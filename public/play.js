const socket = io();

const joinScreen = document.getElementById('joinScreen');
const gameScreen = document.getElementById('gameScreen');
const joinForm = document.getElementById('joinForm');
const nameInput = document.getElementById('nameInput');
const waitingLine = document.getElementById('waitingLine');
const core = document.getElementById('core');
const dots = document.getElementById('dots');
const statusLine = document.getElementById('statusLine');

let myName = null;
let phase = 'waiting';
let cueOpen = false;
let hasTappedThisCue = false;
let currentCueType = 'tap';

function vibrate(pattern) {
  if (navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
  }
}

joinForm.addEventListener('submit', (e) => {
  e.preventDefault();
  myName = nameInput.value.trim() || 'Avventuriero';
  socket.emit('player:join', myName);
  joinScreen.style.display = 'none';
  gameScreen.style.display = 'flex';
});

function renderDots(progress, target) {
  dots.innerHTML = '';
  for (let i = 0; i < target; i++) {
    const d = document.createElement('div');
    d.className = 'dot' + (i < progress ? ' filled' : '');
    dots.appendChild(d);
  }
}

socket.on('state', (state) => {
  phase = state.phase;
  if (!myName) return;
  renderDots(state.progress, state.target);

  if (state.phase === 'waiting') {
    waitingLine.textContent = 'Aspetta che il DM avvii la valvola...';
    core.textContent = '•';
    core.className = 'pulse-core';
    statusLine.textContent = '';
  } else if (state.phase === 'running') {
    waitingLine.textContent = `Battiti ${state.progress}/${state.target}`;
    if (!cueOpen) {
      core.textContent = '';
      core.className = 'pulse-core';
    }
    const connectedCount = state.players.filter((p) => p.connected).length;
    statusLine.textContent = connectedCount < 2
      ? 'In pausa: aspettiamo che si ricolleghi qualcuno.'
      : 'Senti il battito... preparati.';
  } else if (state.phase === 'success') {
    waitingLine.textContent = '';
    core.textContent = '✓';
    core.className = 'pulse-core ok';
    statusLine.innerHTML = '<span class="big-title">La valvola cede!</span>';
  }
});

socket.on('beat', () => {
  if (phase !== 'running' || cueOpen) return;
  core.classList.add('beat');
  vibrate(20);
  setTimeout(() => core.classList.remove('beat'), 150);
});

socket.on('cue', ({ type }) => {
  cueOpen = true;
  hasTappedThisCue = false;
  currentCueType = type || 'tap';
  if (currentCueType === 'skip') {
    core.textContent = 'FERMO!';
    core.className = 'pulse-core skip';
    statusLine.textContent = 'Finta: non toccare!';
    vibrate(15);
  } else {
    core.textContent = 'PREMI!';
    core.className = 'pulse-core cue';
    statusLine.textContent = 'ORA! Premi insieme agli altri.';
    vibrate([0, 60, 40, 60]);
  }
});

socket.on('cueResult', ({ type, success, progress, target }) => {
  cueOpen = false;
  renderDots(progress, target);
  core.className = 'pulse-core ' + (success ? 'ok' : 'bad');
  core.textContent = success ? '✓' : (hasTappedThisCue ? '✓' : '✗');
  if (type === 'skip') {
    statusLine.textContent = success
      ? 'Bene, ti sei trattenuto!'
      : (hasTappedThisCue ? 'Era una finta, non dovevi toccare!' : 'Qualcun altro ha ceduto alla finta. Si ricomincia.');
  } else {
    statusLine.textContent = success
      ? 'Sincronizzati! Continuate così.'
      : (hasTappedThisCue ? 'Qualcun altro non era pronto. Si ricomincia.' : 'Non hai premuto in tempo!');
  }
  vibrate(success ? [0, 40, 30, 40, 30, 80] : [0, 200]);
  setTimeout(() => {
    if (phase === 'running') {
      core.textContent = '';
      core.className = 'pulse-core';
    }
  }, 700);
});

socket.on('valveOpen', () => {
  core.textContent = '✓';
  core.className = 'pulse-core ok';
  vibrate([0, 80, 60, 80, 60, 200]);
});

function handleTap(e) {
  e.preventDefault();
  if (!cueOpen || hasTappedThisCue) return;
  hasTappedThisCue = true;
  socket.emit('player:tap');
  core.style.transform = 'scale(0.94)';
  setTimeout(() => { core.style.transform = ''; }, 100);
}

core.addEventListener('pointerdown', handleTap);
