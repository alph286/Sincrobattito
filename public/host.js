const socket = io();

const core = document.getElementById('core');
const ring = document.getElementById('ring');
const playerList = document.getElementById('playerList');
const dots = document.getElementById('dots');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const hardResetBtn = document.getElementById('hardResetBtn');
const resetFakesBtn = document.getElementById('resetFakesBtn');
const bpmInput = document.getElementById('bpm');
const targetInput = document.getElementById('target');
const windowInput = document.getElementById('windowMs');
const skipChanceInput = document.getElementById('skipChance');
const inviteBox = document.getElementById('inviteBox');
const qrImg = document.getElementById('qrImg');
const joinUrl = document.getElementById('joinUrl');
const connBanner = document.getElementById('connBanner');
const levelsRow = document.getElementById('levelsRow');
const saveLevelBtn = document.getElementById('saveLevelBtn');

let lastState = null;
let levels = [];
let selectedLevel = null;
let saveMode = false;
let beatTimeout = null;

socket.emit('host:hello');

socket.on('disconnect', () => connBanner.classList.add('visible'));
socket.io.on('reconnect_attempt', () => connBanner.classList.add('visible'));
socket.on('connect', () => {
  connBanner.classList.remove('visible');
  socket.emit('host:hello');
});

fetch('/api/join-info')
  .then((r) => r.json())
  .then(({ url, qr }) => {
    joinUrl.textContent = url;
    if (qr) qrImg.src = qr;
    else inviteBox.style.display = 'none';
  })
  .catch(() => { inviteBox.style.display = 'none'; });

function renderDots(progress, target) {
  dots.innerHTML = '';
  for (let i = 0; i < target; i++) {
    const d = document.createElement('div');
    d.className = 'dot' + (i < progress ? ' filled' : '');
    dots.appendChild(d);
  }
}

function renderPlayers(players) {
  playerList.innerHTML = '';
  for (const p of players) {
    const li = document.createElement('li');
    li.className = p.connected ? 'connected' : 'disconnected';
    li.innerHTML = '<span class="dot"></span><span class="name"></span>'
      + '<span class="fake-taps" title="Finte toccate"></span>'
      + '<button class="mini secondary" data-act="zero">Azzera</button>'
      + '<button class="mini ghost" data-act="kick">Espelli</button>';
    li.querySelector('.name').textContent = p.name;
    li.querySelector('.fake-taps').textContent = p.fakeTaps;
    li.querySelector('[data-act="zero"]').addEventListener('click', () => socket.emit('host:resetFakeTaps', p.id));
    li.querySelector('[data-act="kick"]').addEventListener('click', () => socket.emit('host:kick', p.id));
    playerList.appendChild(li);
  }
}

socket.on('state', (state) => {
  lastState = state;
  renderDots(state.progress, state.target);
  renderPlayers(state.players);

  if (state.phase === 'waiting') {
    core.textContent = 'IN ATTESA';
    core.className = 'pulse-core';
    ring.classList.add('idle');
    inviteBox.style.display = '';
    startBtn.disabled = false;
  } else if (state.phase === 'running') {
    ring.classList.remove('idle');
    inviteBox.style.display = 'none';
    startBtn.disabled = true;
  } else if (state.phase === 'success') {
    core.textContent = 'APERTA';
    core.className = 'pulse-core ok';
    ring.classList.remove('idle');
    inviteBox.style.display = 'none';
    startBtn.disabled = true;
  }
});

socket.on('beat', () => {
  if (!lastState || lastState.phase !== 'running') return;
  core.classList.add('beat');
  clearTimeout(beatTimeout);
  beatTimeout = setTimeout(() => core.classList.remove('beat'), 150);
});

socket.on('cue', ({ type }) => {
  clearTimeout(beatTimeout);
  if (type === 'skip') {
    core.textContent = 'FERMI!';
    core.className = 'pulse-core skip';
  } else {
    core.textContent = 'ORA!';
    core.className = 'pulse-core cue';
  }
});

socket.on('cueResult', ({ type, success, progress, target }) => {
  core.className = 'pulse-core ' + (success ? 'ok' : 'bad');
  if (type === 'skip') {
    core.textContent = success ? 'BRAVI!' : 'TOCCATO!';
  } else {
    core.textContent = success ? 'SINCRONO!' : 'FUORI TEMPO';
  }
  renderDots(progress, target);
});

socket.on('valveOpen', () => {
  core.textContent = 'APERTA';
  core.className = 'pulse-core ok';
});

function currentValues() {
  return {
    bpm: Number(bpmInput.value) || 66,
    target: Number(targetInput.value) || 8,
    windowMs: Number(windowInput.value) || 600,
    skipChance: Number(skipChanceInput.value) || 0,
  };
}

// ---------- livelli: un tocco carica i valori nei campi, "Salva nel livello…" poi un tocco li salva ----------
function renderLevels() {
  levelsRow.innerHTML = '';
  levelsRow.classList.toggle('saving', saveMode);
  levels.forEach((lv, i) => {
    const b = document.createElement('button');
    b.className = 'level-btn' + (i === selectedLevel ? ' selected' : '');
    b.disabled = !lv && !saveMode;
    b.innerHTML = `<span>Livello ${i + 1}</span><small>${
      lv ? `${lv.bpm} bpm · ${lv.target} · ${lv.windowMs} ms · ${lv.skipChance}%` : 'vuoto'
    }</small>`;
    b.addEventListener('click', () => onLevelClick(i));
    levelsRow.appendChild(b);
  });
  saveLevelBtn.textContent = saveMode ? 'Annulla salvataggio' : 'Salva nel livello…';
}

function onLevelClick(i) {
  if (saveMode) {
    socket.emit('host:saveLevel', { slot: i, values: currentValues() });
    saveMode = false;
    selectedLevel = i;
    renderLevels();
    return;
  }
  const lv = levels[i];
  if (!lv) return;
  bpmInput.value = lv.bpm;
  targetInput.value = lv.target;
  windowInput.value = lv.windowMs;
  skipChanceInput.value = lv.skipChance;
  selectedLevel = i;
  renderLevels();
}

socket.on('levels', (list) => {
  levels = list;
  renderLevels();
});

saveLevelBtn.addEventListener('click', () => {
  saveMode = !saveMode;
  renderLevels();
});

startBtn.addEventListener('click', () => {
  socket.emit('host:start', currentValues());
});

resetBtn.addEventListener('click', () => {
  socket.emit('host:reset');
});

resetFakesBtn.addEventListener('click', () => {
  socket.emit('host:resetFakeTaps');
});

hardResetBtn.addEventListener('click', () => {
  if (confirm('Rimuovere anche tutti i giocatori collegati?')) {
    socket.emit('host:hardReset');
  }
});
