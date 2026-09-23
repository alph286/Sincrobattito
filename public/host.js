const socket = io();

const core = document.getElementById('core');
const statusLine = document.getElementById('statusLine');
const playerList = document.getElementById('playerList');
const dots = document.getElementById('dots');
const qrImg = document.getElementById('qrImg');
const joinUrl = document.getElementById('joinUrl');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const hardResetBtn = document.getElementById('hardResetBtn');
const bpmInput = document.getElementById('bpm');
const targetInput = document.getElementById('target');
const windowInput = document.getElementById('windowMs');
const skipChanceInput = document.getElementById('skipChance');

let lastState = null;
let tappedThisCue = new Set();

fetch('/api/join-info')
  .then((r) => r.json())
  .then((info) => {
    joinUrl.textContent = info.url;
    if (info.qr) qrImg.src = info.qr;
  })
  .catch(() => {
    joinUrl.textContent = 'Impossibile generare il link. Usa http://<ip-di-questo-pc>:3000/play';
  });

socket.emit('host:hello');

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
  players.forEach((p) => {
    const li = document.createElement('li');
    li.className = (p.connected ? 'connected' : 'disconnected') + (tappedThisCue.has(p.id) ? ' tapped' : '');
    li.innerHTML = `<span class="dot"></span>${p.name}`;
    playerList.appendChild(li);
  });
}

socket.on('state', (state) => {
  lastState = state;
  renderDots(state.progress, state.target);
  renderPlayers(state.players);

  if (state.phase === 'waiting') {
    core.textContent = 'IN ATTESA';
    core.className = 'pulse-core';
    statusLine.textContent = 'Fai entrare i giocatori, poi premi Avvia.';
    startBtn.disabled = false;
  } else if (state.phase === 'running') {
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
    statusLine.innerHTML = '<span class="big-title">La valvola cede!</span>';
    startBtn.disabled = true;
  }
});

socket.on('beat', () => {
  if (!lastState || lastState.phase !== 'running') return;
  core.classList.add('beat');
  setTimeout(() => core.classList.remove('beat'), 150);
});

socket.on('cue', ({ type }) => {
  tappedThisCue = new Set();
  if (type === 'skip') {
    core.textContent = 'FERMI!';
    core.className = 'pulse-core skip';
    statusLine.textContent = 'Finta: nessuno deve toccare!';
  } else {
    core.textContent = 'ORA!';
    core.className = 'pulse-core cue';
    statusLine.textContent = 'Premete insieme!';
  }
  if (lastState) renderPlayers(lastState.players);
});

socket.on('tapPing', ({ id }) => {
  tappedThisCue.add(id);
  if (lastState) renderPlayers(lastState.players);
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
  setTimeout(() => {
    if (lastState && lastState.phase === 'running') {
      core.textContent = '';
      core.className = 'pulse-core';
    }
  }, 700);
});

socket.on('valveOpen', () => {
  core.textContent = 'APERTA';
  core.className = 'pulse-core ok';
});

startBtn.addEventListener('click', () => {
  socket.emit('host:start', {
    bpm: Number(bpmInput.value) || 66,
    target: Number(targetInput.value) || 8,
    windowMs: Number(windowInput.value) || 600,
    skipChance: Number(skipChanceInput.value) || 0,
  });
});

resetBtn.addEventListener('click', () => {
  socket.emit('host:reset');
});

hardResetBtn.addEventListener('click', () => {
  if (confirm('Rimuovere anche tutti i giocatori collegati?')) {
    socket.emit('host:hardReset');
  }
});
