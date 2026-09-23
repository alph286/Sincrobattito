const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');
const QRCode = require('qrcode');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.redirect('/host'));
app.get('/host', (req, res) => res.sendFile(path.join(__dirname, 'public', 'host.html')));
app.get('/play', (req, res) => res.sendFile(path.join(__dirname, 'public', 'play.html')));

function getLocalIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

app.get('/api/join-info', async (req, res) => {
  const ip = getLocalIp();
  const url = `http://${ip}:${PORT}/play`;
  try {
    const qr = await QRCode.toDataURL(url, { margin: 1, width: 320 });
    res.json({ url, qr });
  } catch (err) {
    res.json({ url, qr: null });
  }
});

// ---------- Game state ----------
const DEFAULTS = {
  bpm: 54,
  windowMs: 1500,     // durata della finestra di pressione
  minInterval: 3000,  // intervallo minimo tra un impulso e l'altro
  maxInterval: 7000,  // intervallo massimo
  target: 3,           // impulsi sincronizzati consecutivi necessari
};

let state = {
  phase: 'waiting',    // waiting | running | success
  players: {},          // id -> { name, connected, lastTapAt }
  progress: 0,
  target: DEFAULTS.target,
  bpm: DEFAULTS.bpm,
  windowMs: DEFAULTS.windowMs,
  minInterval: DEFAULTS.minInterval,
  maxInterval: DEFAULTS.maxInterval,
};

let loopTimer = null;
let heartbeatTimer = null;
let activeCue = null; // { id, deadline, taps: Set }

function publicState() {
  return {
    phase: state.phase,
    progress: state.progress,
    target: state.target,
    bpm: state.bpm,
    windowMs: state.windowMs,
    players: Object.entries(state.players).map(([id, p]) => ({
      id,
      name: p.name,
      connected: p.connected,
    })),
  };
}

function broadcastState() {
  io.emit('state', publicState());
}

function connectedPlayerIds() {
  return Object.entries(state.players)
    .filter(([, p]) => p.connected)
    .map(([id]) => id);
}

function startHeartbeat() {
  stopHeartbeat();
  const tick = () => {
    io.emit('beat');
    heartbeatTimer = setTimeout(tick, Math.round(60000 / state.bpm));
  };
  tick();
}

function stopHeartbeat() {
  if (heartbeatTimer) clearTimeout(heartbeatTimer);
  heartbeatTimer = null;
}

function scheduleNextCue() {
  clearTimeout(loopTimer);
  if (state.phase !== 'running') return;
  const delay = state.minInterval + Math.random() * (state.maxInterval - state.minInterval);
  loopTimer = setTimeout(openCue, delay);
}

function openCue() {
  if (state.phase !== 'running') return;
  const required = connectedPlayerIds();
  if (required.length < 2) {
    // non abbastanza giocatori collegati: riprova più tardi
    scheduleNextCue();
    return;
  }
  const id = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  activeCue = { id, required: new Set(required), taps: new Set() };
  io.emit('cue', { id, windowMs: state.windowMs });
  setTimeout(() => resolveCue(id), state.windowMs);
}

function resolveCue(id) {
  if (!activeCue || activeCue.id !== id) return;
  const cue = activeCue;
  activeCue = null;

  const allTapped = [...cue.required].every((pid) => cue.taps.has(pid));
  const success = allTapped && cue.required.size >= 2;

  if (success) {
    state.progress += 1;
  } else {
    state.progress = 0;
  }

  const missing = [...cue.required].filter((pid) => !cue.taps.has(pid));

  io.emit('cueResult', {
    id,
    success,
    progress: state.progress,
    target: state.target,
    missing: missing.map((pid) => state.players[pid]?.name || '???'),
  });

  if (state.progress >= state.target) {
    state.phase = 'success';
    stopHeartbeat();
    io.emit('valveOpen');
    broadcastState();
    return;
  }

  broadcastState();
  scheduleNextCue();
}

function resetGame(hard) {
  clearTimeout(loopTimer);
  activeCue = null;
  state.progress = 0;
  state.phase = 'waiting';
  if (hard) {
    state.players = {};
  }
  stopHeartbeat();
  broadcastState();
}

io.on('connection', (socket) => {
  socket.emit('state', publicState());

  socket.on('host:hello', () => {
    socket.join('hosts');
    socket.emit('state', publicState());
  });

  socket.on('player:join', (name) => {
    const clean = (name || '').toString().trim().slice(0, 24) || 'Avventuriero';
    state.players[socket.id] = { name: clean, connected: true };
    socket.data.isPlayer = true;
    broadcastState();
  });

  socket.on('player:tap', () => {
    if (!activeCue) return;
    if (!state.players[socket.id]) return;
    activeCue.taps.add(socket.id);
    io.to('hosts').emit('tapPing', { id: socket.id, name: state.players[socket.id].name });
  });

  socket.on('host:start', (opts) => {
    if (opts && typeof opts === 'object') {
      if (opts.bpm) state.bpm = Math.min(120, Math.max(30, Number(opts.bpm) || state.bpm));
      if (opts.target) state.target = Math.min(10, Math.max(1, Number(opts.target) || state.target));
      if (opts.windowMs) state.windowMs = Math.min(4000, Math.max(600, Number(opts.windowMs) || state.windowMs));
    }
    state.phase = 'running';
    state.progress = 0;
    broadcastState();
    startHeartbeat();
    scheduleNextCue();
  });

  socket.on('host:reset', () => resetGame(false));
  socket.on('host:hardReset', () => resetGame(true));

  socket.on('disconnect', () => {
    if (state.players[socket.id]) {
      state.players[socket.id].connected = false;
      broadcastState();
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIp();
  console.log(`Sincrobattito in ascolto su:`);
  console.log(`  Regia (host):    http://${ip}:${PORT}/host`);
  console.log(`  Giocatori:       http://${ip}:${PORT}/play`);
});
