const socket = io();

const joinScreen = document.getElementById('joinScreen');
const gameScreen = document.getElementById('gameScreen');
const joinForm = document.getElementById('joinForm');
const nameInput = document.getElementById('nameInput');
const core = document.getElementById('core');
const dots = document.getElementById('dots');
const cueLabel = document.getElementById('cueLabel');
const connBanner = document.getElementById('connBanner');

let myName = null;
let phase = 'waiting';
let cueOpen = false;
let hasTappedThisCue = false;

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

let beatTimeout = null;

function clearCue() {
  cueOpen = false;
  core.className = 'pulse-core';
  cueLabel.textContent = '';
  cueLabel.className = 'cue-label';
}

socket.on('state', (state) => {
  phase = state.phase;
  if (!myName) return;
  renderDots(state.progress, state.target);
  if (state.phase !== 'running') clearCue();
});

// tutti i cambi sono istantanei: nessuna transizione, così a BPM alti gli stati non si accavallano
socket.on('beat', () => {
  if (phase !== 'running' || cueOpen) return;
  core.classList.add('beat');
  vibrate(20);
  clearTimeout(beatTimeout);
  beatTimeout = setTimeout(() => core.classList.remove('beat'), 150);
});

socket.on('cue', ({ type }) => {
  clearTimeout(beatTimeout);
  cueOpen = true;
  hasTappedThisCue = false;
  const skip = type === 'skip';
  core.className = 'pulse-core ' + (skip ? 'skip' : 'cue');
  cueLabel.textContent = skip ? 'FERMI' : 'ORA';
  cueLabel.className = 'cue-label ' + (skip ? 'skip' : 'cue');
  vibrate(skip ? 15 : [0, 60, 40, 60]);
});

socket.on('cueResult', ({ progress, target }) => {
  clearCue();
  renderDots(progress, target);
});

function handleTap(e) {
  e.preventDefault();
  if (!cueOpen || hasTappedThisCue) return;
  hasTappedThisCue = true;
  socket.emit('player:tap');
}

core.addEventListener('pointerdown', handleTap);
