const socket = io();

const core = document.getElementById('core');
const ring = document.getElementById('ring');
const statusLine = document.getElementById('statusLine');
const dots = document.getElementById('dots');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const hardResetBtn = document.getElementById('hardResetBtn');
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

socket.on('state', (state) => {
  lastState = state;
  renderDots(state.progress, state.target);

  if (state.phase === 'waiting') {
    core.textContent = 'IN ATTESA';
    core.className = 'pulse-core';
    ring.classList.add('idle');
    inviteBox.style.display = '';
    const connectedCount = state.players.filter((p) => p.connected).length;
    statusLine.textContent = connectedCount > 0
      ? `${connectedCount} giocator${connectedCount === 1 ? 'e' : 'i'} collegat${connectedCount === 1 ? 'o' : 'i'}. Premi Avvia quando siete pronti.`
      : 'Fai entrare i giocatori, poi premi Avvia.';
    startBtn.disabled = false;
  } else if (state.phase === 'running') {
    ring.classList.remove('idle');
    inviteBox.style.display = 'none';
    const connectedCount = state.players.filter((p) => p.connected).length;
    if (connectedCount < 2) {
      statusLine.textContent = 'In pausa: servono almeno 2 giocatori collegati per generare un impulso.';
    } else {
      statusLine.textContent = `Battiti ${state.progress}/${state.target} — premete a tempo, fermi sulle finte!`;
    }
    startBtn.disabled = true;
  } else if (state.phase === 'success') {
    core.textContent = 'APERTA';
    core.className = 'pulse-core ok';
    ring.classList.remove('idle');
    inviteBox.style.display = 'none';
    statusLine.innerHTML = '<span class="big-title">La valvola cede!</span>';
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
    statusLine.textContent = 'Finta: nessuno deve toccare!';
  } else {
    core.textContent = 'ORA!';
    core.className = 'pulse-core cue';
    statusLine.textContent = 'Premete insieme!';
  }
});

socket.on('cueResult', ({ type, success, missing, progress, target }) => {
  core.className = 'pulse-core ' + (success ? 'ok' : 'bad');
  if (type === 'skip') {
    core.textContent = success ? 'BRAVI!' : 'TOCCATO!';
  } else {
    core.textContent = success ? 'SINCRONO!' : 'FUORI TEMPO';
  }
  renderDots(progress, target);
  if (type === 'skip') {
    statusLine.textContent = success
      ? 'Bene, nessuno ha ceduto alla finta.'
      : `${missing.join(', ')} ha toccato durante la finta! Si ricomincia.`;
  } else if (success) {
    statusLine.textContent = `Ottimo lavoro! ${progress}/${target} completati.`;
  } else if (missing && missing.length) {
    statusLine.textContent = `Fuori tempo: ${missing.join(', ')} non ha premuto in sincronia. Si ricomincia.`;
  } else {
    statusLine.textContent = 'Fuori tempo. Si ricomincia.';
  }
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

hardResetBtn.addEventListener('click', () => {
  if (confirm('Rimuovere anche tutti i giocatori collegati?')) {
    socket.emit('host:hardReset');
  }
});
