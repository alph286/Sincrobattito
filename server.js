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
  bpm: 66,
  windowMs: 600,      // tolleranza di reazione attorno a ogni battito (viene comunque limitata all'85% dell'intervallo tra battiti)
  target: 8,            // battiti "premi" consecutivi corretti necessari
  skipChance: 0.2,      // probabilità che un dato battito sia una "finta" (non premere)
};

let state = {
  phase: 'waiting',    // waiting | running | success
  players: {},          // id -> { name, connected, lastTapAt }
  progress: 0,
  target: DEFAULTS.target,
  bpm: DEFAULTS.bpm,
  windowMs: DEFAULTS.windowMs,
  skipChance: DEFAULTS.skipChance,
};

let beatTimer = null;
let resolveTimer = null;
let activeBeat = null; // { id, type: 'tap' | 'skip', required: Set, taps: Set }

function publicState() {
  return {
    phase: state.phase,
    progress: state.progress,
    target: state.target,
    bpm: state.bpm,
    windowMs: state.windowMs,
    skipChance: state.skipChance,
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

function beatIntervalMs() {
  return Math.round(60000 / state.bpm);
}

// finestra di pressione: legata al battito, sempre una reazione rapida "a tempo"
function effectiveWindowMs() {
  const interval = beatIntervalMs();
  return Math.max(280, Math.min(state.windowMs, Math.round(interval * 0.85)));
}

function stopBeatLoop() {
  if (beatTimer) clearTimeout(beatTimer);
  if (resolveTimer) clearTimeout(resolveTimer);
  beatTimer = null;
  resolveTimer = null;
  activeBeat = null;
}

function startBeatLoop() {
  stopBeatLoop();
  let firstBeats = 2; // i primissimi battiti sono sempre "premi", per prendere il tempo
  const tick = () => {
    if (state.phase !== 'running') return;
    const required = connectedPlayerIds();

    if (required.length < 2) {
      // non abbastanza giocatori collegati: battito a vuoto, si riprova al prossimo
      io.emit('beat');
      beatTimer = setTimeout(tick, beatIntervalMs());
      return;
    }

    const isSkip = firstBeats <= 0 && Math.random() < state.skipChance;
    if (firstBeats > 0) firstBeats -= 1;

    const id = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    const windowMs = effectiveWindowMs();
    activeBeat = { id, type: isSkip ? 'skip' : 'tap', required: new Set(required), taps: new Set() };
    io.emit('cue', { id, type: activeBeat.type, windowMs });
    resolveTimer = setTimeout(() => resolveBeat(id), windowMs);

    beatTimer = setTimeout(tick, beatIntervalMs());
  };
  tick();
}

function resolveBeat(id) {
  if (!activeBeat || activeBeat.id !== id) return;
  const beat = activeBeat;
  activeBeat = null;

  let success;
  let missing = [];
  if (beat.type === 'tap') {
    missing = [...beat.required].filter((pid) => !beat.taps.has(pid));
    success = missing.length === 0;
    state.progress = success ? state.progress + 1 : 0;
  } else {
    // battito "finta": nessuno doveva premere
    missing = [...beat.taps];
    success = beat.taps.size === 0;
    if (!success) state.progress = 0;
  }

  io.emit('cueResult', {
    id,
    type: beat.type,
    success,
    progress: state.progress,
    target: state.target,
    missing: missing.map((pid) => state.players[pid]?.name || '???'),
  });

  if (beat.type === 'tap' && state.progress >= state.target) {
    state.phase = 'success';
    stopBeatLoop();
    io.emit('valveOpen');
    broadcastState();
    return;
  }

  broadcastState();
}

function resetGame(hard) {
  stopBeatLoop();
  state.progress = 0;
  state.phase = 'waiting';
  if (hard) {
    state.players = {};
  }
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
    if (!activeBeat) return;
    if (!state.players[socket.id]) return;
    activeBeat.taps.add(socket.id);
    io.to('hosts').emit('tapPing', { id: socket.id, name: state.players[socket.id].name, type: activeBeat.type });
  });

  socket.on('host:start', (opts) => {
    if (opts && typeof opts === 'object') {
      if (opts.bpm) state.bpm = Math.min(120, Math.max(30, Number(opts.bpm) || state.bpm));
      if (opts.target) state.target = Math.min(20, Math.max(1, Number(opts.target) || state.target));
      if (opts.windowMs) state.windowMs = Math.min(2000, Math.max(300, Number(opts.windowMs) || state.windowMs));
      if (opts.skipChance !== undefined) {
        state.skipChance = Math.min(0.6, Math.max(0, Number(opts.skipChance) / 100 || 0));
      }
    }
    state.phase = 'running';
    state.progress = 0;
    broadcastState();
    startBeatLoop();
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
