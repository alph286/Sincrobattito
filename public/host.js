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
    statusLine.textContent = `Sincronia ${state.progress}/${state.target} — attenti al battito...`;
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

socket.on('cue', ({ windowMs }) => {
  tappedThisCue = new Set();
  core.textContent = 'ORA!';
  core.className = 'pulse-core cue';
  statusLine.textContent = 'Impulso di pressione! Chi tocca in tempo?';
  if (lastState) renderPlayers(lastState.players);
});

socket.on('tapPing', ({ id }) => {
  tappedThisCue.add(id);
  if (lastState) renderPlayers(lastState.players);
});

socket.on('cueResult', ({ success, missing, progress, target }) => {
  core.className = 'pulse-core ' + (success ? 'ok' : 'bad');
  core.textContent = success ? 'SINCRONO!' : 'FUORI TEMPO';
  renderDots(progress, target);
  if (success) {
    statusLine.textContent = `Ottimo lavoro! ${progress}/${target} completati.`;
  } else if (missing && missing.length) {
    statusLine.textContent = `Fuori tempo: ${missing.join(', ')} non ha premuto in sincronia. Si ricomincia.`;
  } else {
    statusLine.textContent = 'Fuori tempo. Si ricomincia.';
  }
  setTimeout(() => {
    if (lastState && lastState.phase === 'running') {
      core.textContent = 'ATTESA...';
      core.className = 'pulse-core';
    }
  }, 900);
});

socket.on('valveOpen', () => {
  core.textContent = 'APERTA';
  core.className = 'pulse-core ok';
});

startBtn.addEventListener('click', () => {
  socket.emit('host:start', {
    bpm: Number(bpmInput.value) || 54,
    target: Number(targetInput.value) || 3,
    windowMs: Number(windowInput.value) || 1500,
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
