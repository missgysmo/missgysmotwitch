const CELL_PX = 12;

const loginForm = document.getElementById('login-form');
const loginInput = document.getElementById('login');
const statusEl = document.getElementById('status');
const paintArea = document.getElementById('paint-area');
const paletteEl = document.getElementById('palette');
const stickerSelect = document.getElementById('sticker-select');
const cooldownInfoEl = document.getElementById('cooldown-info');
const canvasEl = document.getElementById('canvas');
const ctx = canvasEl.getContext('2d');
const canvasStage = document.getElementById('canvas-stage');
const gridOverlay = document.getElementById('grid-overlay');
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const zoomLevelEl = document.getElementById('zoom-level');
const templateInput = document.getElementById('template-input');
const templateImg = document.getElementById('template-img');
const templateOpacityWrap = document.getElementById('template-opacity-wrap');
const templateOpacity = document.getElementById('template-opacity');
const templateClearBtn = document.getElementById('template-clear');
const eraseBtn = document.getElementById('erase-btn');
const cellInfoEl = document.getElementById('cell-info');

const COLORS = [
  ['#ff4757', 'Rouge'], ['#3742fa', 'Bleu'], ['#2ed573', 'Vert'], ['#ffd633', 'Jaune'],
  ['#9147ff', 'Violet'], ['#ffffff', 'Blanc'], ['#17171d', 'Noir'], ['#ff9f43', 'Orange'],
  ['#ff6ec7', 'Rose'], ['#18dcff', 'Cyan'],
];

let login = null;
let brush = { type: 'pixel', color: COLORS[0][0] };
let cooldownUntil = 0;
let cooldownTimer = null;
const state = { cols: 60, rows: 34, cells: {} };

function buildPalette() {
  paletteEl.innerHTML = '';
  COLORS.forEach(([hex, name], i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'swatch';
    btn.style.background = hex;
    btn.title = name;
    if (i === 0) btn.classList.add('active');
    btn.addEventListener('click', () => {
      brush = { type: 'pixel', color: hex };
      document.querySelectorAll('.swatch').forEach((s) => s.classList.remove('active'));
      btn.classList.add('active');
      stickerSelect.value = '';
      eraseBtn.classList.remove('active');
    });
    paletteEl.appendChild(btn);
  });
}
buildPalette();

eraseBtn.addEventListener('click', () => {
  brush = { type: 'erase' };
  document.querySelectorAll('.swatch').forEach((s) => s.classList.remove('active'));
  eraseBtn.classList.add('active');
  stickerSelect.value = '';
});

async function loadSpecies() {
  const res = await fetch('/api/species');
  const list = await res.json();
  stickerSelect.innerHTML = '<option value="">— ou choisis un sticker —</option>'
    + list.map((s) => `<option value="${s.id}">${s.label}</option>`).join('');
}
loadSpecies();

stickerSelect.addEventListener('change', () => {
  if (!stickerSelect.value) return;
  brush = { type: 'sticker', species: stickerSelect.value };
  document.querySelectorAll('.swatch').forEach((s) => s.classList.remove('active'));
  eraseBtn.classList.remove('active');
});

const stickerImages = {};
function getStickerImage(sp) {
  if (!stickerImages[sp]) {
    const img = new Image();
    img.src = `/overlay/sprites/${sp}.png`;
    stickerImages[sp] = img;
  }
  return stickerImages[sp];
}

function drawCell(x, y, cell) {
  const px = x * CELL_PX;
  const py = y * CELL_PX;
  ctx.clearRect(px, py, CELL_PX, CELL_PX);
  if (!cell) return;
  if (cell.type === 'pixel') {
    ctx.fillStyle = cell.color;
    ctx.fillRect(px, py, CELL_PX, CELL_PX);
  } else if (cell.type === 'sticker') {
    const size = CELL_PX * 3;
    const img = getStickerImage(cell.species);
    const draw = () => ctx.drawImage(img, px - CELL_PX, py - CELL_PX, size, size);
    if (img.complete) draw();
    else img.addEventListener('load', draw, { once: true });
  }
}

let zoomLevel = 1;

function applyZoom() {
  const width = state.cols * CELL_PX * zoomLevel;
  const height = state.rows * CELL_PX * zoomLevel;
  canvasStage.style.width = `${width}px`;
  canvasStage.style.height = `${height}px`;
  gridOverlay.style.backgroundSize = `${CELL_PX * zoomLevel}px ${CELL_PX * zoomLevel}px`;
  zoomLevelEl.textContent = `${Math.round(zoomLevel * 100)}%`;
}

zoomInBtn.addEventListener('click', () => {
  zoomLevel = Math.min(6, zoomLevel + 0.25);
  applyZoom();
});
zoomOutBtn.addEventListener('click', () => {
  zoomLevel = Math.max(0.25, zoomLevel - 0.25);
  applyZoom();
});

templateInput.addEventListener('change', () => {
  const file = templateInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    templateImg.src = reader.result;
    templateImg.hidden = false;
    templateOpacityWrap.hidden = false;
    templateClearBtn.hidden = false;
    templateImg.style.opacity = templateOpacity.value / 100;
  };
  reader.readAsDataURL(file);
});

templateOpacity.addEventListener('input', () => {
  templateImg.style.opacity = templateOpacity.value / 100;
});

templateClearBtn.addEventListener('click', () => {
  templateImg.hidden = true;
  templateImg.src = '';
  templateOpacityWrap.hidden = true;
  templateClearBtn.hidden = true;
  templateInput.value = '';
});

function resizeCanvas() {
  canvasEl.width = state.cols * CELL_PX;
  canvasEl.height = state.rows * CELL_PX;
  applyZoom();
}

function redraw() {
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  for (const key in state.cells) {
    const [x, y] = key.split(',').map(Number);
    drawCell(x, y, state.cells[key]);
  }
}

async function loadCanvas() {
  const res = await fetch('/api/canvas');
  const data = await res.json();
  state.cols = data.cols;
  state.rows = data.rows;
  state.cells = data.cells || {};
  cooldownInfoEl.textContent = data.enabled
    ? `Cooldown : ${data.cooldownSeconds}s entre deux placements.`
    : 'Le graffiti est désactivé pour le moment.';
  resizeCanvas();
  redraw();
}
loadCanvas();

function connectWs() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${protocol}://${location.host}/ws`);
  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.type === 'canvas-init') {
      state.cols = data.cols;
      state.rows = data.rows;
      state.cells = data.cells || {};
      resizeCanvas();
      redraw();
    }
    if (data.type === 'canvas-update') {
      state.cells[`${data.x},${data.y}`] = data.cell;
      drawCell(data.x, data.y, data.cell);
    }
  };
  ws.onclose = () => setTimeout(connectWs, 3000);
  ws.onerror = () => ws.close();
}
connectWs();

function startCooldownDisplay(ms) {
  clearInterval(cooldownTimer);
  cooldownUntil = Date.now() + ms;
  const tick = () => {
    const remaining = cooldownUntil - Date.now();
    if (remaining <= 0) {
      clearInterval(cooldownTimer);
      statusEl.textContent = 'Tu peux à nouveau peindre !';
      return;
    }
    statusEl.textContent = `Prochain placement dans ${(remaining / 1000).toFixed(1)}s...`;
  };
  tick();
  cooldownTimer = setInterval(tick, 200);
}

canvasEl.addEventListener('click', async (e) => {
  if (!login) return;
  if (Date.now() < cooldownUntil) return;

  const rect = canvasEl.getBoundingClientRect();
  const x = Math.floor(((e.clientX - rect.left) / rect.width) * state.cols);
  const y = Math.floor(((e.clientY - rect.top) / rect.height) * state.rows);

  const body = { login, x, y, type: brush.type };
  if (brush.type === 'pixel') body.color = brush.color;
  else if (brush.type === 'sticker') body.species = brush.species;

  try {
    const res = await fetch('/api/canvas/place', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      statusEl.textContent = data.error || 'Erreur';
      if (data.retryInMs) startCooldownDisplay(data.retryInMs);
      return;
    }
    startCooldownDisplay(data.cooldownMs);
  } catch (err) {
    statusEl.textContent = 'Erreur réseau, réessaie.';
    console.error(err);
  }
});

canvasEl.addEventListener('mousemove', (e) => {
  const rect = canvasEl.getBoundingClientRect();
  const x = Math.floor(((e.clientX - rect.left) / rect.width) * state.cols);
  const y = Math.floor(((e.clientY - rect.top) / rect.height) * state.rows);
  const cell = state.cells[`${x},${y}`];
  if (!cell) {
    cellInfoEl.textContent = '';
    return;
  }
  const what = cell.type === 'pixel' ? 'une couleur' : `un sticker (${cell.species})`;
  cellInfoEl.textContent = cell.login ? `${what} posé par ${cell.login}` : what;
});

canvasEl.addEventListener('mouseleave', () => {
  cellInfoEl.textContent = '';
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const value = loginInput.value.trim().toLowerCase();
  if (!value) return;
  statusEl.textContent = 'Vérification...';
  try {
    const res = await fetch(`/api/follow-status/${encodeURIComponent(value)}`);
    const data = await res.json();
    if (data.follows) {
      login = value;
      statusEl.textContent = `Connecté en tant que ${value}. Clique sur le canvas pour peindre !`;
      paintArea.hidden = false;
    } else {
      login = null;
      paintArea.hidden = true;
      statusEl.textContent = 'Tu dois suivre la chaîne sur Twitch pour participer.';
    }
  } catch (err) {
    statusEl.textContent = 'Erreur de vérification, réessaie.';
    console.error(err);
  }
});
