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
const templateSelect = document.getElementById('template-select');
const templateFileWrap = document.getElementById('template-file-wrap');
const templateSizeWrap = document.getElementById('template-size-wrap');
const templateSize = document.getElementById('template-size');
const templateMoveBtn = document.getElementById('template-move');
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
const state = { cols: 60, rows: 34, cells: {}, templates: [] };

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

// Modèle optionnel, choisi par chaque viewer pour lui seul : aucun, un des modèles de la
// streameuse, ou sa propre image. Il le place et le redimensionne où il veut sur le graffiti,
// dans la limite de 25 % de la surface pour laisser de la place aux autres. Tout reste dans son
// navigateur : le modèle n'est jamais envoyé au serveur, ni montré aux autres ou sur le stream.
// Seuls les pixels posés sont partagés (en direct, avec tout le monde).
const TEMPLATE_CHOICE_KEY = 'graffiti-template-choice';
const TEMPLATE_LOCAL_KEY = 'graffiti-template-local';
const TEMPLATE_OPACITY_KEY = 'graffiti-template-opacity';
const TEMPLATE_PLACE_KEY = 'graffiti-template-place';
const TEMPLATE_MAX_AREA = 0.25; // part maximale de la surface du graffiti
const TEMPLATE_MIN_SIZE = 10; // % de la taille maximale

function readPref(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writePref(key, value) {
  try {
    if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, value);
  } catch { /* stockage indisponible ou plein : le choix ne sera juste pas retenu */ }
}

let localTemplateSrc = readPref(TEMPLATE_LOCAL_KEY);
let templateChoice = readPref(TEMPLATE_CHOICE_KEY) || 'none';
const savedOpacity = readPref(TEMPLATE_OPACITY_KEY);
if (savedOpacity !== null) templateOpacity.value = savedOpacity;

// Placement en fractions du graffiti : x, y = coin haut gauche ; size = % de la taille maximale.
let templatePlace = (() => {
  try {
    const p = JSON.parse(readPref(TEMPLATE_PLACE_KEY));
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.size)) return p;
  } catch { /* placement absent ou illisible */ }
  return null;
})();
let templateMoving = false;

// Largeur/hauteur du modèle en fractions du graffiti, selon sa taille choisie.
function templateBox() {
  const ratio = templateImg.naturalHeight / templateImg.naturalWidth || 1; // h/w de l'image
  const aspect = state.rows / state.cols; // h/w du graffiti
  // aire = w × h = w² × ratio / aspect ≤ TEMPLATE_MAX_AREA, et l'image doit tenir dans le graffiti
  const maxW = Math.min(1, aspect / ratio, Math.sqrt((TEMPLATE_MAX_AREA * aspect) / ratio));
  const w = (maxW * templatePlace.size) / 100;
  return { w, h: (w * ratio) / aspect };
}

function layoutTemplate() {
  if (templateImg.hidden || !templateImg.naturalWidth) return;
  if (!templatePlace) templatePlace = { x: 0, y: 0, size: 100, centered: false };
  const { w, h } = templateBox();
  if (templatePlace.centered === false) {
    templatePlace = { x: (1 - w) / 2, y: (1 - h) / 2, size: templatePlace.size };
  }
  templatePlace.x = Math.min(Math.max(0, templatePlace.x), 1 - w);
  templatePlace.y = Math.min(Math.max(0, templatePlace.y), 1 - h);
  templateImg.style.left = `${templatePlace.x * 100}%`;
  templateImg.style.top = `${templatePlace.y * 100}%`;
  templateImg.style.width = `${w * 100}%`;
  templateImg.style.height = `${h * 100}%`;
  templateSize.value = templatePlace.size;
}

function saveTemplatePlace() {
  writePref(TEMPLATE_PLACE_KEY, JSON.stringify(templatePlace));
}

function showTemplate(src) {
  const visible = !!src;
  templateOpacityWrap.hidden = !visible;
  templateSizeWrap.hidden = !visible;
  templateMoveBtn.hidden = !visible;
  if (!visible) {
    templateImg.hidden = true;
    templateImg.removeAttribute('src');
    setTemplateMoving(false);
    return;
  }
  templateImg.hidden = false;
  templateImg.style.opacity = templateOpacity.value / 100;
  if (templateImg.getAttribute('src') !== src) templateImg.src = src;
  else layoutTemplate();
}
templateImg.addEventListener('load', layoutTemplate);

function renderTemplateSelect() {
  const options = [['none', 'Aucun modèle']]
    .concat(state.templates.map((t) => [t.id, t.label]))
    .concat([['local', '📁 Mon image perso…']]);
  templateSelect.innerHTML = '';
  for (const [value, label] of options) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    templateSelect.appendChild(opt);
  }
  // Modèle supprimé par la streameuse entre-temps : retour à "aucun".
  if (!options.some(([value]) => value === templateChoice)) templateChoice = 'none';
  templateSelect.value = templateChoice;
  applyTemplateChoice();
}

function applyTemplateChoice() {
  templateFileWrap.hidden = templateChoice !== 'local';
  if (templateChoice === 'local') return showTemplate(localTemplateSrc);
  const tpl = state.templates.find((t) => t.id === templateChoice);
  showTemplate(tpl ? `/graffiti-templates/${tpl.image}` : null);
}

// Nouveau modèle : on repart au centre, en taille maximale.
function resetTemplatePlace() {
  templatePlace = { x: 0, y: 0, size: 100, centered: false };
  saveTemplatePlace();
}

templateSelect.addEventListener('change', () => {
  templateChoice = templateSelect.value;
  writePref(TEMPLATE_CHOICE_KEY, templateChoice);
  resetTemplatePlace();
  applyTemplateChoice();
  if (templateChoice === 'local' && !localTemplateSrc) templateInput.click();
});

// Réduit l'image si elle dépasse 1920x1080 (sans la déformer), en WebP pour rester légère
// (PNG si le navigateur ne sait pas encoder le WebP).
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1920 / img.naturalWidth, 1080 / img.naturalHeight);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((blob) => {
        if (blob) return resolve(blob);
        c.toBlob((png) => (png ? resolve(png) : reject(new Error('conversion impossible'))), 'image/png');
      }, 'image/webp', 0.9);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image illisible')); };
    img.src = url;
  });
}

templateInput.addEventListener('change', async () => {
  const file = templateInput.files[0];
  if (!file) return;
  try {
    const blob = await shrinkImage(file);
    const reader = new FileReader();
    reader.onload = () => {
      localTemplateSrc = reader.result;
      writePref(TEMPLATE_LOCAL_KEY, localTemplateSrc);
      resetTemplatePlace();
      applyTemplateChoice();
    };
    reader.readAsDataURL(blob);
  } catch (err) {
    alert(`Impossible de charger cette image : ${err.message}`);
  }
});

templateOpacity.addEventListener('input', () => {
  templateImg.style.opacity = templateOpacity.value / 100;
  writePref(TEMPLATE_OPACITY_KEY, templateOpacity.value);
});

templateSize.addEventListener('input', () => {
  if (!templatePlace) return;
  // Redimensionne autour du centre du modèle
  const before = templateBox();
  const cx = templatePlace.x + before.w / 2;
  const cy = templatePlace.y + before.h / 2;
  templatePlace.size = Math.max(TEMPLATE_MIN_SIZE, Number(templateSize.value));
  const after = templateBox();
  templatePlace.x = cx - after.w / 2;
  templatePlace.y = cy - after.h / 2;
  layoutTemplate();
  saveTemplatePlace();
});

// Mode "placer" : le modèle se déplace à la souris/au doigt ; les clics ne posent plus de pixels.
function setTemplateMoving(on) {
  templateMoving = on;
  templateImg.classList.toggle('moving', on);
  canvasStage.classList.toggle('template-moving', on);
  templateMoveBtn.textContent = on ? '✅ Terminer le placement' : '✋ Déplacer mon modèle';
}
templateMoveBtn.addEventListener('click', () => setTemplateMoving(!templateMoving));

templateImg.addEventListener('pointerdown', (e) => {
  if (!templateMoving) return;
  e.preventDefault();
  templateImg.setPointerCapture(e.pointerId);
  const rect = canvasStage.getBoundingClientRect();
  const start = { px: e.clientX, py: e.clientY, x: templatePlace.x, y: templatePlace.y };
  const move = (ev) => {
    templatePlace.x = start.x + (ev.clientX - start.px) / rect.width;
    templatePlace.y = start.y + (ev.clientY - start.py) / rect.height;
    layoutTemplate();
  };
  const up = () => {
    templateImg.removeEventListener('pointermove', move);
    templateImg.removeEventListener('pointerup', up);
    templateImg.removeEventListener('pointercancel', up);
    saveTemplatePlace();
  };
  templateImg.addEventListener('pointermove', move);
  templateImg.addEventListener('pointerup', up);
  templateImg.addEventListener('pointercancel', up);
});

let zoomFitted = false;

function resizeCanvas() {
  canvasEl.width = state.cols * CELL_PX;
  canvasEl.height = state.rows * CELL_PX;
  fitZoomOnce();
  applyZoom();
  layoutTemplate();
}

// Au premier affichage de la zone de dessin, zoom ajusté pour voir tout le graffiti
// (format 1920x1080) en largeur. Rien à faire tant qu'elle est cachée (avant la connexion).
function fitZoomOnce() {
  if (zoomFitted) return;
  const available = canvasStage.parentElement.clientWidth - 16;
  if (available <= 0) return;
  zoomFitted = true;
  const fit = available / (state.cols * CELL_PX);
  if (fit < 1) zoomLevel = Math.max(0.25, Math.floor(fit * 20) / 20);
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
  state.templates = data.templates || [];
  cooldownInfoEl.textContent = data.enabled
    ? `Cooldown : ${data.cooldownSeconds}s entre deux placements.`
    : 'Le graffiti est désactivé pour le moment.';
  resizeCanvas();
  redraw();
  renderTemplateSelect();
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
    if (data.type === 'graffiti-templates') {
      state.templates = data.templates || [];
      renderTemplateSelect();
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
  if (templateMoving) return;
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
      fitZoomOnce();
      applyZoom();
      layoutTemplate();
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
