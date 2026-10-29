// Grimaldello — clone di "Pick a Lock" per Anime Salve.
// Un grimaldello gira attorno alla serratura: bisogna toccare quando passa sulla runa.
// Ogni perno preso inverte il verso e fa comparire la runa successiva; se il grimaldello
// supera la runa o si tocca a vuoto, il tentativo fallisce.

(() => {
  const TAU = Math.PI * 2;
  const SPEEDS = [1.5, 2.1, 2.8, 3.5, 4.3];        // rad/s per le velocità 1..5 della serratura del DM
  const STORE_KEY = 'grimaldello.level';

  const $ = (id) => document.getElementById(id);
  const menuScreen = $('menuScreen');
  const gameScreen = $('gameScreen');
  const canvas = $('lock');
  const ctx = canvas.getContext('2d');
  const statusEl = $('status');
  const hudTitle = $('hudTitle');
  const picksEl = $('picks');

  // ---------- livello salvato ----------
  function loadLevel() {
    try { return Math.max(1, parseInt(localStorage.getItem(STORE_KEY), 10) || 1); } catch (e) { return 1; }
  }
  function saveLevel(n) {
    try { localStorage.setItem(STORE_KEY, String(n)); } catch (e) { /* niente persistenza, pazienza */ }
  }
  let campaignLevel = loadLevel();
  const refreshLevelLabel = () => { $('levelLabel').textContent = '· livello ' + campaignLevel; };
  refreshLevelLabel();

  // ---------- configurazione partita ----------
  // mode 'levels': livello n = n perni, velocità crescente, grimaldelli infiniti.
  // mode 'custom': serratura impostata dal DM (perni, velocità, grimaldelli, bonus).
  function levelConfig(n) {
    return {
      mode: 'levels',
      level: n,
      title: 'Livello ' + n,
      pins: n,
      speed: Math.min(4.6, 1.5 + 0.11 * (n - 1)),
      picks: 0,
      bonus: 0,
    };
  }

  function customConfig(c) {
    const pins = clampInt(c.pins, 1, 30, 5);
    const speed = clampInt(c.speed, 1, 5, 3);
    return {
      mode: 'custom',
      title: 'Serratura · ' + pins + (pins === 1 ? ' perno' : ' perni'),
      pins,
      speed: SPEEDS[speed - 1],
      speedLevel: speed,
      picks: clampInt(c.picks, 0, 20, 3),
      bonus: clampInt(c.bonus, -5, 15, 0),
    };
  }

  function clampInt(v, min, max, def) {
    const n = parseInt(v, 10);
    if (Number.isNaN(n)) return def;
    return Math.min(max, Math.max(min, n));
  }

  // ---------- stato di gioco ----------
  let cfg = null;
  let g = null;   // stato del tentativo corrente

  function newAttempt(keepPicks) {
    const picksLeft = keepPicks && g ? g.picksLeft : cfg.picks;
    g = {
      phase: 'ready',          // ready | play | fail | open | over
      angle: -Math.PI / 2,     // il grimaldello parte in alto
      dir: 1,
      remaining: cfg.pins,
      target: 0,               // angolo della runa
      gap: 0,                  // distanza (in radianti) fra grimaldello e runa al momento della comparsa
      travelled: 0,
      picksLeft,
      shake: 0,
      flash: 0,                // >0 rosso, <0 verde
      shackle: 0,              // 0 chiuso .. 1 aperto
      hitPulse: 0,
      t: 0,
    };
    spawnTarget();
    renderPicks();
  }

  function spawnTarget() {
    // la runa compare davanti al grimaldello, mai troppo vicina né quasi un giro intero
    g.gap = 0.55 * Math.PI + Math.random() * 1.15 * Math.PI;
    g.target = g.angle + g.dir * g.gap;
    g.travelled = 0;
  }

  // mezza ampiezza angolare della finestra utile, allargata dal bonus del DM
  function hitWindow() {
    return Math.max(0.07, 0.14 + 0.012 * cfg.bonus);
  }

  function startGame(config) {
    cfg = config;
    hudTitle.textContent = cfg.title;
    menuScreen.hidden = true;
    gameScreen.hidden = false;
    newAttempt(false);
    setStatus('Tocca per iniziare');
    resize();
  }

  function backToMenu() {
    gameScreen.hidden = true;
    menuScreen.hidden = false;
    refreshLevelLabel();
    g = null;
  }

  function setStatus(text, cls) {
    statusEl.textContent = text;
    statusEl.className = 'status' + (cls ? ' ' + cls : '');
  }

  function renderPicks() {
    if (!cfg.picks) { picksEl.innerHTML = ''; return; }
    let html = '';
    for (let i = 0; i < cfg.picks; i++) {
      html += '<span class="' + (i < g.picksLeft ? '' : 'broken') + '">⟋</span>';
    }
    picksEl.innerHTML = html;
  }

  // ---------- input ----------
  function onTap() {
    if (!g) return;
    audio.unlock();
    switch (g.phase) {
      case 'ready':
        g.phase = 'play';
        setStatus('');
        return;
      case 'play':
        if (Math.abs(g.travelled - g.gap) <= hitWindow()) hit();
        else fail('Mancato!');
        return;
      case 'open':
        if (g.t > 0.6) nextAfterOpen();
        return;
      case 'over':
        if (g.t > 0.6) { newAttempt(false); setStatus('Tocca per iniziare'); }
        return;
      case 'fail':
        if (g.t > 0.5) { newAttempt(true); setStatus('Tocca per riprovare'); }
        return;
    }
  }

  gameScreen.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    e.preventDefault();
    onTap();
  });
  document.addEventListener('keydown', (e) => {
    if (gameScreen.hidden) return;
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) onTap(); }
    if (e.code === 'Escape') backToMenu();
  });

  function hit() {
    g.remaining--;
    g.hitPulse = 1;
    audio.click();
    vibrate(15);
    if (g.remaining <= 0) return open();
    g.dir = -g.dir;
    spawnTarget();
  }

  function fail(msg) {
    g.phase = 'fail';
    g.t = 0;
    g.shake = 1;
    g.flash = 1;
    audio.clunk();
    vibrate([40, 40, 80]);
    if (cfg.picks) {
      g.picksLeft--;
      renderPicks();
      if (g.picksLeft <= 0) {
        g.phase = 'over';
        setStatus('L’ultimo grimaldello si è spezzato', 'bad');
        return;
      }
      setStatus(msg + ' Il grimaldello si spezza.', 'bad');
      return;
    }
    setStatus(msg, 'bad');
  }

  function open() {
    g.phase = 'open';
    g.t = 0;
    g.flash = -1;
    audio.chime();
    vibrate([20, 30, 20, 30, 120]);
    if (cfg.mode === 'levels') {
      campaignLevel = Math.max(campaignLevel, cfg.level + 1);
      saveLevel(campaignLevel);
      setStatus('Aperta! Tocca per il livello successivo', 'good');
    } else {
      setStatus('La serratura cede.', 'good');
    }
  }

  function nextAfterOpen() {
    if (cfg.mode === 'levels') {
      cfg = levelConfig(campaignLevel);
      hudTitle.textContent = cfg.title;
      newAttempt(false);
      setStatus('Tocca per iniziare');
    } else {
      newAttempt(false);
      setStatus('Tocca per iniziare');
    }
  }

  function vibrate(p) {
    if (navigator.vibrate) try { navigator.vibrate(p); } catch (e) { /* ignorato */ }
  }

  // ---------- audio sintetizzato (niente file esterni) ----------
  const audio = (() => {
    let ac = null;
    function unlock() {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ac = new AC();
      }
      if (ac.state === 'suspended') ac.resume();
    }
    function tone(freq, dur, type, vol, when, slideTo) {
      if (!ac) return;
      const t0 = ac.currentTime + (when || 0);
      const o = ac.createOscillator();
      const gn = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      gn.gain.setValueAtTime(vol, t0);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(gn).connect(ac.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    }
    return {
      unlock,
      click() { tone(1800, 0.04, 'square', 0.08); tone(900, 0.06, 'triangle', 0.1, 0.01); },
      clunk() { tone(140, 0.25, 'sawtooth', 0.15, 0, 60); tone(90, 0.3, 'square', 0.08, 0.03, 50); },
      chime() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.5, 'triangle', 0.09, i * 0.08)); },
    };
  })();

  // ---------- disegno ----------
  let W = 0, H = 0, dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  window.addEventListener('resize', resize);

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!g) return;

    // la serratura (arco + corpo) deve stare nel canvas: corpo di raggio Rb, arco che sale fino a ~1.9 Rb
    const Rb = Math.min(W / 2.3, H / 3.4);
    const cx = W / 2;
    const cy = H / 2 + Rb * 0.45;
    const R = Rb * 0.72;            // raggio della scanalatura
    const groove = Rb * 0.16;       // spessore della scanalatura

    const sx = g.shake > 0 ? Math.sin(g.t * 70) * 10 * g.shake : 0;
    ctx.save();
    ctx.translate(cx + sx, cy);

    drawShackle(Rb);
    drawBody(Rb);

    // scanalatura
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.lineWidth = groove;
    ctx.strokeStyle = '#0d0a0b';
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(168,138,90,.35)';
    ctx.beginPath(); ctx.arc(0, 0, R + groove / 2, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, R - groove / 2, 0, TAU); ctx.stroke();

    // runa bersaglio
    if (g.phase === 'ready' || g.phase === 'play') drawRune(R, groove);

    // grimaldello
    if (g.phase !== 'open') drawPick(R, groove);

    // perni rimanenti al centro
    drawCounter(Rb);

    ctx.restore();

    // lampo rosso / verde su tutto
    if (g.flash) {
      const a = Math.abs(g.flash) * 0.35;
      ctx.fillStyle = g.flash > 0 ? `rgba(179,35,43,${a})` : `rgba(111,191,115,${a * 0.6})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawShackle(Rb) {
    const lift = easeOut(g.shackle) * Rb * 0.45;
    const sw = Rb * 0.2;              // spessore dell'arco
    const half = Rb * 0.56;           // metà larghezza
    const top = -Rb * 1.8 - lift;
    const grad = ctx.createLinearGradient(-half, 0, half, 0);
    grad.addColorStop(0, '#5d4a35');
    grad.addColorStop(0.45, '#c9ac78');
    grad.addColorStop(1, '#4a3a2a');
    ctx.save();
    ctx.lineCap = 'butt';
    ctx.lineWidth = sw;
    ctx.strokeStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-half, -Rb * 0.5);
    ctx.lineTo(-half, top + half);
    ctx.arc(0, top + half, half, Math.PI, 0);
    // il gambo destro si sfila dal corpo quando la serratura si apre
    ctx.lineTo(half, -Rb * 0.5 - lift);
    ctx.stroke();
    ctx.restore();
  }

  function drawBody(Rb) {
    const grad = ctx.createRadialGradient(-Rb * 0.3, -Rb * 0.35, Rb * 0.1, 0, 0, Rb);
    grad.addColorStop(0, '#4d3a2c');
    grad.addColorStop(0.7, '#2a1e18');
    grad.addColorStop(1, '#160f0c');
    ctx.beginPath();
    ctx.arc(0, 0, Rb, 0, TAU);
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(0,0,0,.6)';
    ctx.shadowBlur = 30;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = Rb * 0.045;
    ctx.strokeStyle = '#7d6444';
    ctx.stroke();

    // borchie sul bordo
    ctx.fillStyle = '#8c7350';
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU + Math.PI / 8;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * Rb * 0.91, Math.sin(a) * Rb * 0.91, Rb * 0.03, 0, TAU);
      ctx.fill();
    }
  }

  function drawRune(R, groove) {
    const x = Math.cos(g.target) * R;
    const y = Math.sin(g.target) * R;
    const pulse = 0.5 + 0.5 * Math.sin(g.t * 6);
    const r = Math.min(groove * 0.48, Math.max(groove * 0.25, R * hitWindow() * 0.6));
    ctx.save();
    ctx.shadowColor = 'rgba(217,164,65,.9)';
    ctx.shadowBlur = 14 + pulse * 12;
    ctx.fillStyle = '#d9a441';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    // glifo: piccolo rombo inciso
    ctx.fillStyle = '#5a3a10';
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.55);
    ctx.lineTo(x + r * 0.4, y);
    ctx.lineTo(x, y + r * 0.55);
    ctx.lineTo(x - r * 0.4, y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawPick(R, groove) {
    const len = groove * 1.5;
    const wid = groove * 0.32;
    ctx.save();
    ctx.rotate(g.angle);
    ctx.translate(R, 0);
    ctx.fillStyle = g.phase === 'fail' || g.phase === 'over' ? '#e0464f' : '#c8202a';
    ctx.shadowColor = 'rgba(255,60,70,.7)';
    ctx.shadowBlur = 10 + g.hitPulse * 20;
    roundRect(-len / 2, -wid / 2, len, wid, wid / 2);
    ctx.fill();
    ctx.restore();
  }

  function drawCounter(Rb) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const scale = 1 + g.hitPulse * 0.15;
    ctx.font = `${Math.round(Rb * 0.42 * scale)}px Georgia, serif`;
    ctx.fillStyle = g.phase === 'open' ? '#6fbf73' : '#f1e6d8';
    ctx.fillText(g.phase === 'open' ? '✓' : String(g.remaining), 0, Rb * 0.02);
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  const easeOut = (x) => 1 - Math.pow(1 - x, 3);

  // ---------- ciclo ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (g) {
      g.t += dt;
      if (g.phase === 'play') {
        const step = cfg.speed * dt;
        g.angle += g.dir * step;
        g.travelled += step;
        if (g.travelled > g.gap + hitWindow()) fail('Superata!');
      }
      if (g.phase === 'open') g.shackle = Math.min(1, g.shackle + dt * 2.5);
      g.shake = Math.max(0, g.shake - dt * 2.5);
      g.hitPulse = Math.max(0, g.hitPulse - dt * 4);
      if (g.flash > 0) g.flash = Math.max(0, g.flash - dt * 2);
      if (g.flash < 0) g.flash = Math.min(0, g.flash + dt * 1.2);
    }
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- menu ----------
  function readForm() {
    return {
      pins: $('cfgPins').value,
      speed: $('cfgSpeed').value,
      picks: $('cfgPicks').value,
      bonus: $('cfgBonus').value,
    };
  }

  function shareUrl() {
    const c = customConfig(readForm());
    const u = new URL(location.href);
    u.search = '';
    u.hash = '';
    u.searchParams.set('perni', c.pins);
    u.searchParams.set('velocita', c.speedLevel);
    u.searchParams.set('grimaldelli', c.picks);
    if (c.bonus) u.searchParams.set('bonus', c.bonus);
    return u.toString();
  }

  $('btnLevels').addEventListener('click', () => startGame(levelConfig(campaignLevel)));
  $('btnCustom').addEventListener('click', () => startGame(customConfig(readForm())));
  $('btnBack').addEventListener('click', backToMenu);
  $('btnCopy').addEventListener('click', async () => {
    const url = shareUrl();
    $('copyHint').textContent = url;   // sempre visibile: in http su LAN la clipboard spesso non è disponibile
    try {
      await navigator.clipboard.writeText(url);
      $('copyHint').textContent = 'Copiato: ' + url;
    } catch (e) { /* resta da copiare a mano */ }
  });

  // link del DM: ?perni=6&velocita=3&grimaldelli=2&bonus=4 apre direttamente quella serratura
  const qs = new URLSearchParams(location.search);
  if (qs.has('perni')) {
    const c = { pins: qs.get('perni'), speed: qs.get('velocita'), picks: qs.get('grimaldelli'), bonus: qs.get('bonus') };
    $('cfgPins').value = clampInt(c.pins, 1, 30, 5);
    $('cfgSpeed').value = clampInt(c.speed, 1, 5, 3);
    $('cfgPicks').value = clampInt(c.picks, 0, 20, 3);
    $('cfgBonus').value = clampInt(c.bonus, -5, 15, 0);
    startGame(customConfig(c));
  }
})();
