const socket = io();

const joinScreen = document.getElementById('joinScreen');
const gameScreen = document.getElementById('gameScreen');
const joinForm = document.getElementById('joinForm');
const nameInput = document.getElementById('nameInput');
const core = document.getElementById('core');
const ring = document.getElementById('ring');
const dots = document.getElementById('dots');
const statusLine = document.getElementById('statusLine');
const connBanner = document.getElementById('connBanner');

let myName = null;
let phase = 'waiting';
let cueOpen = false;
let hasTappedThisCue = false;
let currentCueType = 'tap';

socket.on('connect', () => connBanner.classList.remove('visible'));
socket.on('disconnect', () => connBanner.classList.add('visible'));
socket.io.on('reconnect_attempt', () => connBanner.classList.add('visible'));

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
    core.className = 'pulse-core';
    ring.classList.add('idle');
    statusLine.textContent = 'In attesa che la Regia avvii la valvola…';
  } else if (state.phase === 'running') {
    ring.classList.remove('idle');
    if (!cueOpen) {
      core.className = 'pulse-core';
      statusLine.textContent = 'Senti il battito… preparati.';
    }
  } else if (state.phase === 'success') {
    core.className = 'pulse-core ok';
    ring.classList.remove('idle');
    statusLine.textContent = 'La valvola cede!';
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
    core.className = 'pulse-core skip';
    core.textContent = 'FERMI';
    statusLine.textContent = 'Finta — non toccare!';
    vibrate(15);
  } else {
    core.className = 'pulse-core cue';
    core.textContent = 'ORA';
    statusLine.textContent = 'Premi adesso, insieme agli altri!';
    vibrate([0, 60, 40, 60]);
  }
});

socket.on('cueResult', ({ success, progress, target }) => {
  cueOpen = false;
  renderDots(progress, target);
  core.className = 'pulse-core ' + (success ? 'ok' : 'bad');
  core.textContent = success ? 'BRAVO' : 'FUORI TEMPO';
  statusLine.textContent = success
    ? `Ottimo! ${progress}/${target} battiti sincroni.`
    : 'Qualcuno ha sbagliato tempo — si riparte.';
  vibrate(success ? [0, 40, 30, 40, 30, 80] : [0, 200]);
  setTimeout(() => {
    if (phase === 'running') {
      core.className = 'pulse-core';
      core.textContent = '';
      statusLine.textContent = 'Senti il battito… preparati.';
    }
  }, 700);
});

socket.on('valveOpen', () => {
  core.className = 'pulse-core ok';
  core.textContent = '';
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
