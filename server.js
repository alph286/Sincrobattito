const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const os = require('os');
const path = require('path');
const QRCode = require('qrcode');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3001;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.redirect('/host'));
app.get('/host', (req, res) => res.sendFile(path.join(__dirname, 'public', 'host.html')));
app.get('/play', (req, res) => res.sendFile(path.join(__dirname, 'public', 'play.html')));
app.get('/qr', (req, res) => res.sendFile(path.join(__dirname, 'public', 'qr.html')));

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
    const qr = await QRCode.toDataURL(url, { margin: 1, width: Math.min(Number(req.query.w) || 320, 1200) });
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
  phase: 'waiting',    // waiting (valvola disattivata) | session (sessione aperta, fermo) | running (livello in corso) | success (livello superato, fermo)
  players: {},          // id pubblico -> { name, token, sockets, fakeTaps }
  progress: 0,
  target: DEFAULTS.target,
  bpm: DEFAULTS.bpm,
  windowMs: DEFAULTS.windowMs,
  skipChance: DEFAULTS.skipChance,
};

// ---------- Livelli preimpostati (salvati dalla regia, persistono su file) ----------
const LEVEL_SLOTS = 5;
const LEVELS_FILE = path.join(__dirname, 'levels.json');

function cleanLevel(v) {
  if (!v || typeof v !== 'object') return null;
  return {
    bpm: Math.min(120, Math.max(30, Number(v.bpm) || DEFAULTS.bpm)),
    target: Math.min(20, Math.max(1, Number(v.target) || DEFAULTS.target)),
    windowMs: Math.min(2000, Math.max(300, Number(v.windowMs) || DEFAULTS.windowMs)),
    skipChance: Math.min(60, Math.max(0, Number(v.skipChance) || 0)), // in percentuale, come nei campi della regia
  };
}

function loadLevels() {
  const empty = Array(LEVEL_SLOTS).fill(null);
  try {
    const saved = JSON.parse(fs.readFileSync(LEVELS_FILE, 'utf8'));
    return empty.map((_, i) => cleanLevel(Array.isArray(saved) ? saved[i] : null));
  } catch (e) {
    return empty;
  }
}

let levels = loadLevels();

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
      connected: p.sockets > 0,
      fakeTaps: p.fakeTaps,
    })),
  };
}

function broadcastState() {
  io.emit('state', publicState());
}

function connectedPlayerIds() {
  return Object.entries(state.players)
    .filter(([, p]) => p.sockets > 0)
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
    // ogni giocatore che ha toccato la finta prende +1 (al massimo uno per finta)
    for (const pid of beat.taps) {
      if (state.players[pid]) state.players[pid].fakeTaps += 1;
    }
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

// toPhase: 'session' interrompe solo il livello, 'waiting' chiude la sessione
function resetGame(hard, toPhase = 'waiting') {
  stopBeatLoop();
  state.progress = 0;
  state.phase = state.phase === 'waiting' ? 'waiting' : toPhase;
  if (hard) {
    for (const id of Object.keys(state.players)) kickPlayer(id);
  }
  broadcastState();
}

function playerByToken(token) {
  if (typeof token !== 'string') return null;
  return Object.keys(state.players).find((id) => state.players[id].token === token) || null;
}

function attachPlayer(socket, id) {
  const p = state.players[id];
  socket.data.playerId = id;
  socket.join('player:' + id);
  p.sockets += 1;
  socket.emit('joined', { id, token: p.token, name: p.name });
}

// rimuove il giocatore: i suoi telefoni tornano alla pagina del nome e il login salvato non vale più
function kickPlayer(id) {
  if (!state.players[id]) return;
  delete state.players[id];
  if (activeBeat) activeBeat.required.delete(id);
  io.to('player:' + id).emit('kicked');
  for (const s of io.sockets.sockets.values()) {
    if (s.data.playerId === id) {
      s.data.playerId = null;
      s.leave('player:' + id);
    }
  }
}

io.on('connection', (socket) => {
  socket.emit('state', publicState());

  socket.on('host:hello', () => {
    socket.join('hosts');
    socket.emit('state', publicState());
    socket.emit('levels', levels);
  });

  socket.on('host:saveLevel', ({ slot, values } = {}) => {
    const i = Number(slot);
    if (!Number.isInteger(i) || i < 0 || i >= LEVEL_SLOTS) return;
    levels[i] = cleanLevel(values);
    try {
      fs.writeFileSync(LEVELS_FILE, JSON.stringify(levels, null, 2));
    } catch (e) {
      console.warn('Impossibile salvare i livelli:', e.message);
    }
    io.to('hosts').emit('levels', levels);
  });

  socket.on('player:join', (name) => {
    if (socket.data.playerId) return;
    const clean = (name || '').toString().trim().slice(0, 24) || 'Avventuriero';
    const id = crypto.randomBytes(6).toString('hex');
    state.players[id] = { name: clean, token: crypto.randomUUID(), sockets: 0, fakeTaps: 0 };
    attachPlayer(socket, id);
    broadcastState();
  });

  // il telefono rientra con il token salvato: se il giocatore esiste ancora riprende da dove era
  socket.on('player:resume', (token) => {
    if (socket.data.playerId) return;
    const id = playerByToken(token);
    if (!id) {
      socket.emit('kicked');
      return;
    }
    attachPlayer(socket, id);
    broadcastState();
  });

  socket.on('player:tap', () => {
    const id = socket.data.playerId;
    if (!activeBeat || !id || !state.players[id]) return;
    activeBeat.taps.add(id);
    io.to('hosts').emit('tapPing', { id, name: state.players[id].name, type: activeBeat.type });
  });

  socket.on('host:kick', (id) => {
    kickPlayer(id);
    broadcastState();
  });

  // id di un giocatore: azzera solo il suo contatore; senza id: azzera tutti
  socket.on('host:resetFakeTaps', (id) => {
    for (const [pid, p] of Object.entries(state.players)) {
      if (!id || pid === id) p.fakeTaps = 0;
    }
    broadcastState();
  });

  socket.on('host:openSession', () => {
    if (state.phase !== 'waiting') return;
    state.phase = 'session';
    broadcastState();
  });

  // "Inizia livello": parte solo a sessione aperta e livello fermo
  socket.on('host:start', (opts) => {
    if (state.phase !== 'session' && state.phase !== 'success') return;
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

  socket.on('host:reset', () => resetGame(false, 'session'));
  socket.on('host:closeSession', () => resetGame(false, 'waiting'));
  socket.on('host:hardReset', () => resetGame(true));

  socket.on('disconnect', () => {
    const p = state.players[socket.data.playerId];
    if (p) {
      p.sockets = Math.max(0, p.sockets - 1);
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
