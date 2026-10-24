const socket = io();

const joinScreen = document.getElementById('joinScreen');
const gameScreen = document.getElementById('gameScreen');
const joinForm = document.getElementById('joinForm');
const nameInput = document.getElementById('nameInput');
const core = document.getElementById('core');
const dots = document.getElementById('dots');
const cueLabel = document.getElementById('cueLabel');
const connBanner = document.getElementById('connBanner');
const fakeCount = document.getElementById('fakeCount');

const TOKEN_KEY = 'sincrobattito-token';

function loadToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
}
function saveToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch (e) { /* ignore */ }
}

let myId = null;
let phase = 'waiting';
let cueOpen = false;
let hasTappedThisCue = false;

// a ogni connessione (anche dopo una caduta di rete) si rientra col token salvato, se c'è
socket.on('connect', () => {
  connBanner.classList.remove('visible');
  const token = loadToken();
  if (token) socket.emit('player:resume', token);
  else showJoin();
});
socket.on('disconnect', () => connBanner.classList.add('visible'));
socket.io.on('reconnect_attempt', () => connBanner.classList.add('visible'));

function vibrate(pattern) {
  if (navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
  }
}

function showJoin() {
  myId = null;
  gameScreen.style.display = 'none';
  joinScreen.style.display = 'flex';
}

joinForm.addEventListener('submit', (e) => {
  e.preventDefault();
  socket.emit('player:join', nameInput.value.trim() || 'Avventuriero');
});

socket.on('joined', ({ id, token }) => {
  myId = id;
  saveToken(token);
  joinScreen.style.display = 'none';
  gameScreen.style.display = 'flex';
});

socket.on('kicked', () => {
  saveToken(null);
  clearCue();
  nameInput.value = '';
  showJoin();
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
  if (!myId) return;
  renderDots(state.progress, state.target);
  const me = state.players.find((p) => p.id === myId);
  if (me) fakeCount.textContent = me.fakeTaps;
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
