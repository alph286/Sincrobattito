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

// impulso visivo identico per battiti e cue: le indicazioni (ORA/FERMI/esito) le dà la Regia
function pulse() {
  core.classList.add('beat');
  vibrate(20);
  clearTimeout(beatTimeout);
  beatTimeout = setTimeout(() => core.classList.remove('beat'), 150);
}

socket.on('state', (state) => {
  phase = state.phase;
  if (!myName) return;
  renderDots(state.progress, state.target);

  if (state.phase === 'waiting') {
    ring.classList.add('idle');
    statusLine.textContent = 'In attesa che la Regia avvii la valvola…';
  } else {
    ring.classList.remove('idle');
    statusLine.textContent = 'Senti il battito… segui la Regia.';
  }
});

socket.on('beat', () => {
  if (phase !== 'running') return;
  pulse();
});

socket.on('cue', () => {
  cueOpen = true;
  hasTappedThisCue = false;
  pulse();
});

socket.on('cueResult', ({ progress, target }) => {
  cueOpen = false;
  renderDots(progress, target);
});

function handleTap(e) {
  e.preventDefault();
  if (!cueOpen || hasTappedThisCue) return;
  hasTappedThisCue = true;
  socket.emit('player:tap');
}

core.addEventListener('pointerdown', handleTap);
