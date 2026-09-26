// Sfondo animato WebGL2: rumore organico con domain warping, palette "carne/valvola".
// Se WebGL2 non è disponibile o la compilazione fallisce, il canvas resta nascosto
// e la pagina mostra il gradiente statico già definito in style.css come fallback.

const VERT_SRC = `#version 300 es
in vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG_SRC = `#version 300 es
precision highp float;

uniform float iTime;
uniform vec2 iResolution;
out vec4 fragColor;

float hash(vec2 p) {
  p = fract(p * 0.6180339887);
  p *= 25.0;
  return fract(p.x * p.y * (p.x + p.y));
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

const mat2 mtx = mat2(0.80, 0.60, -0.60, 0.80);

float fbm(vec2 p) {
  float f = 0.0;
  f += 0.5000 * noise(p); p = mtx * p * 2.02;
  f += 0.2500 * noise(p); p = mtx * p * 2.03;
  f += 0.1250 * noise(p); p = mtx * p * 2.01;
  f += 0.0625 * noise(p);
  return f / 0.9375;
}

float pattern(vec2 p) {
  float v = fbm(p);
  v = fbm(p + 1.2 * v);
  return v;
}

void main() {
  vec2 uv = (2.0 * gl_FragCoord.xy - iResolution.xy) / iResolution.y;
  uv *= 1.6;

  float t = iTime * 0.10;
  float pulse = 0.5 + 0.5 * sin(iTime * 1.05);

  float v = pattern(uv + vec2(0.0, t));

  vec3 deep = vec3(0.043, 0.047, 0.063);
  vec3 flesh = vec3(0.227, 0.063, 0.078);
  vec3 fleshLight = vec3(0.431, 0.122, 0.133);
  vec3 glow = vec3(1.0, 0.302, 0.333);

  vec3 col = mix(deep, flesh, smoothstep(0.15, 0.55, v));
  col = mix(col, fleshLight, smoothstep(0.50, 0.80, v));
  col = mix(col, glow, smoothstep(0.82, 1.0, v) * (0.35 + 0.25 * pulse));

  float vig = 1.0 - 0.55 * length(uv) / 1.8;
  col *= clamp(vig, 0.35, 1.0);

  fragColor = vec4(col, 1.0);
}`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(info || 'Shader compile error');
  }
  return shader;
}

function initBgShader(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  let gl = null;
  try {
    gl = canvas.getContext('webgl2', { antialias: false, powerPreference: 'low-power' });
  } catch (e) {
    gl = null;
  }
  if (!gl) {
    console.warn('Sfondo animato disattivato: WebGL2 non disponibile su questo browser.');
    canvas.style.display = 'none';
    return;
  }

  let program;
  try {
    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'Program link error');
    }
  } catch (e) {
    console.warn('Sfondo animato disattivato: errore nella compilazione dello shader.', e);
    canvas.style.display = 'none';
    return;
  }

  const posBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(program, 'aPos');
  const uTime = gl.getUniformLocation(program, 'iTime');
  const uResolution = gl.getUniformLocation(program, 'iResolution');

  gl.useProgram(program);
  gl.enableVertexAttribArray(aPos);
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  let running = true;

  function resize() {
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  function renderFrame(time) {
    resize();
    gl.uniform1f(uTime, time);
    gl.uniform2f(uResolution, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  if (reduceMotion) {
    renderFrame(0);
  } else {
    const start = performance.now();
    const loop = (now) => {
      if (!running) return;
      renderFrame((now - start) / 1000);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    document.addEventListener('visibilitychange', () => {
      running = !document.hidden;
      if (running) requestAnimationFrame(loop);
    });

    window.addEventListener('resize', resize);
  }
}

initBgShader('bgCanvas');
