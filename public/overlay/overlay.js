const stage = document.getElementById('stage');
const eventLayer = document.getElementById('event-layer');
const timerLayer = document.getElementById('timer-layer');
const GRAFFITI_CELL_PX = 8;
const graffitiCanvas = document.getElementById('graffiti-canvas');
const graffitiCtx = graffitiCanvas.getContext('2d');
const chatOverlayEl = document.getElementById('chat-overlay');
const chatOverlayListEl = document.getElementById('chat-overlay-list');
const activityFeedEl = document.getElementById('activity-feed');
const activityFeedTrackEl = document.getElementById('activity-feed-track');
const followListEl = document.getElementById('follow-list');
const followListTrackEl = document.getElementById('follow-list-track');
const tamagotchiEl = document.getElementById('tamagotchi');
const tamagotchiImgEl = document.getElementById('tamagotchi-img');
const tamagotchiBarEl = document.getElementById('tamagotchi-bar-fill');
const raidCardEl = document.getElementById('raid-card');

// Permet d'ajouter chaque module comme source OBS indépendante :
// /overlay/?modules=avatars,chat,canvas,timers (par défaut, sans le paramètre : tous activés)
const MODULE_PARAM = new URLSearchParams(location.search).get('modules');
const ENABLED_MODULES = MODULE_PARAM ? new Set(MODULE_PARAM.split(',').map((m) => m.trim())) : null;
function moduleEnabled(name) {
  return !ENABLED_MODULES || ENABLED_MODULES.has(name);
}
if (!moduleEnabled('avatars')) document.body.classList.add('module-avatars-off');
if (!moduleEnabled('chat')) document.body.classList.add('module-chat-off');
if (!moduleEnabled('canvas')) document.body.classList.add('module-canvas-off');
if (!moduleEnabled('timers')) document.body.classList.add('module-timers-off');
if (!moduleEnabled('activity')) document.body.classList.add('module-activity-off');
if (!moduleEnabled('people')) document.body.classList.add('module-people-off');
if (!moduleEnabled('tamagotchi')) document.body.classList.add('module-tamagotchi-off');
if (!moduleEnabled('raidcard')) document.body.classList.add('module-raidcard-off');

const SPECIES_FILES = {
  'mon-avatar': 'mon-avatar.png',
  cat: 'cat.png',
  'cosmic-cat': 'cosmic-cat.png',
  'cyber-unicorn': 'cyber-unicorn.png',
  dino: 'dino.png',
  girl: 'girl.png',
  'grunge-boy': 'grunge-boy.png',
  unicorn: 'unicorn.png',
  alien: 'alien.png',
  boy: 'boy.png',
  'cyber-triceratops': 'cyber-triceratops.png',
  'cyber-raptor': 'cyber-raptor.png',
  'cyber-puppy': 'cyber-puppy.png',
  'cyber-wolf': 'cyber-wolf.png',
  'gothic-girl': 'gothic-girl.png',
  guerriere: 'guerriere.png',
  ninja: 'ninja.png',
  panda: 'panda.png',
  pizza: 'pizza.png',
  'skate-boy': 'skate-boy.png',
  witch: 'witch.png',
};

const avatars = new Map(); // login -> { el, moveTimer }

let settings = {
  avatarSize: 64,
  zone: { top: 8, right: 5, bottom: 8, left: 5 },
  moveIntervalMs: 4500,
  moveVarianceMs: 2000,
  transitionSeconds: 4,
  movementPattern: 'random',
  corridorPosition: 50,
  mirrorOnDirection: true,
  transitionEffect: true,
  nameTag: { show: true, fontSize: 13, color: '#ffffff' },
  ownerNameColor: '#ffd633',
  ownerSize: 64,
  graffiti: { enabled: true, cols: 60, rows: 34, cooldownSeconds: 8, position: { x: 2, y: 58, width: 32, height: 38 } },
  chatOverlay: {
    enabled: false, maxMessages: 8, fontSize: 14, textColor: '#ffffff', colorMode: 'twitch', style: 'list', rotation: 0,
    bgColor: '#000000', bgOpacity: 55, fadeSeconds: 12, position: { x: 78, y: 55, width: 20, height: 40 },
  },
  spriteFlip: {
    cat: true, 'cosmic-cat': true, 'cyber-unicorn': true, dino: false,
    girl: false, 'grunge-boy': false, unicorn: false, 'mon-avatar': true,
    alien: false, boy: false, 'cyber-triceratops': true, 'cyber-raptor': false,
    'cyber-puppy': false, 'cyber-wolf': false, 'gothic-girl': false, guerriere: false,
    ninja: false, panda: false, pizza: false, 'skate-boy': false, witch: false,
  },
  events: {
    follow: { enabled: true, showText: true, text: '💜 {user} vient de follow !', color: '#ffffff', fontSize: 16, reaction: 'pulse', position: { x: 50, y: 14 } },
    subscribe: { enabled: true, showText: true, text: '⭐ {user} vient de s\'abonner !', color: '#ffffff', fontSize: 16, reaction: 'jump', position: { x: 50, y: 14 } },
    cheer: { enabled: true, showText: true, text: '💎 {user} a cheer {bits} bits !', color: '#ffffff', fontSize: 16, reaction: 'shake', position: { x: 50, y: 14 } },
    raid: { enabled: true, showText: true, text: '🚀 Raid de {user} ({viewers} viewers) !', color: '#ffffff', fontSize: 16, reaction: 'bounce', position: { x: 50, y: 14 } },
  },
  activityFeed: {
    enabled: false, fontSize: 15, textColor: '#ffffff', bgColor: '#000000', bgOpacity: 55, speedSeconds: 18,
    position: { x: 25, y: 92, width: 50, height: 6 },
  },
  followList: {
    enabled: false, mode: 'both', fontSize: 14, textColor: '#ffffff', bgColor: '#000000', bgOpacity: 55, speedSeconds: 30,
    position: { x: 2, y: 2, width: 20, height: 50 },
  },
  tamagotchi: {
    enabled: false, species: 'mascot', size: 96, showBar: true,
    position: { x: 90, y: 85 },
  },
  raidCard: {
    enabled: true, durationSeconds: 12, fontSize: 16, textColor: '#ffffff', bgColor: '#000000', bgOpacity: 70,
    position: { x: 50, y: 50 },
  },
};

function applySettings(newSettings) {
  settings = newSettings;
  const root = document.documentElement.style;
  root.setProperty('--avatar-size', `${settings.avatarSize}px`);
  root.setProperty('--avatar-transition', `${settings.transitionSeconds}s`);
  root.setProperty('--name-font-size', `${settings.nameTag.fontSize}px`);
  root.setProperty('--name-color', settings.nameTag.color);
  document.body.classList.toggle('hide-names', !settings.nameTag.show);
  const ownerEntry = [...avatars.values()].find((e) => e.el.dataset.species === 'mon-avatar');
  if (ownerEntry) {
    const size = `${settings.ownerSize}px`;
    ownerEntry.el.querySelector('.avatar').style.width = size;
    ownerEntry.el.querySelector('.avatar').style.height = size;
    ownerEntry.el.querySelector('.avatar-name').style.color = settings.ownerNameColor;
  }
  applyGraffitiLayout();
  applyChatOverlayLayout();
  applyActivityFeedLayout();
  applyFollowListLayout();
  applyTamagotchiLayout();
  applyRaidCardLayout();
}

applySettings(settings);

function zoneBounds() {
  const { top, right, bottom, left } = settings.zone;
  const minX = (left / 100) * window.innerWidth;
  const maxX = window.innerWidth - (right / 100) * window.innerWidth - settings.avatarSize;
  const minY = (top / 100) * window.innerHeight;
  const maxY = window.innerHeight - (bottom / 100) * window.innerHeight - settings.avatarSize;
  return { minX, maxX: Math.max(minX, maxX), minY, maxY: Math.max(minY, maxY) };
}

function randomPos() {
  const { minX, maxX, minY, maxY } = zoneBounds();
  return {
    x: minX + Math.random() * (maxX - minX),
    y: minY + Math.random() * (maxY - minY),
  };
}

function nextPos(entry) {
  const bounds = zoneBounds();
  const pattern = settings.movementPattern;
  const corridor = settings.corridorPosition / 100;

  if (pattern === 'horizontal') {
    const laneY = bounds.minY + corridor * (bounds.maxY - bounds.minY);
    entry.dirX = entry.dirX === 1 ? -1 : 1;
    return { x: entry.dirX === 1 ? bounds.maxX : bounds.minX, y: laneY };
  }

  if (pattern === 'vertical') {
    const laneX = bounds.minX + corridor * (bounds.maxX - bounds.minX);
    entry.dirY = entry.dirY === 1 ? -1 : 1;
    return { x: laneX, y: entry.dirY === 1 ? bounds.maxY : bounds.minY };
  }

  if (pattern === 'circular') {
    if (!entry.circle) {
      const cx = (bounds.minX + bounds.maxX) / 2;
      const cy = (bounds.minY + bounds.maxY) / 2;
      const r = Math.min((bounds.maxX - bounds.minX) / 2, (bounds.maxY - bounds.minY) / 2);
      entry.circle = { cx, cy, r, angle: Math.random() * Math.PI * 2 };
    }
    entry.circle.angle += Math.PI / 4;
    const { cx, cy, r, angle } = entry.circle;
    return {
      x: Math.min(bounds.maxX, Math.max(bounds.minX, cx + r * Math.cos(angle))),
      y: Math.min(bounds.maxY, Math.max(bounds.minY, cy + r * Math.sin(angle))),
    };
  }

  return randomPos();
}

function initialPos(entry) {
  const bounds = zoneBounds();
  const pattern = settings.movementPattern;
  const corridor = settings.corridorPosition / 100;

  if (pattern === 'horizontal') {
    entry.dirX = -1;
    return { x: bounds.minX, y: bounds.minY + corridor * (bounds.maxY - bounds.minY) };
  }
  if (pattern === 'vertical') {
    entry.dirY = -1;
    return { x: bounds.minX + corridor * (bounds.maxX - bounds.minX), y: bounds.minY };
  }
  return randomPos();
}

function createAvatarEl(login, skin, entry) {
  const wrap = document.createElement('div');
  wrap.className = 'avatar-wrap';
  wrap.innerHTML = `
    <div class="avatar-name">${escapeHtml(login)}</div>
    <img class="avatar" alt="" />
  `;
  applySkin(wrap, skin);
  stage.appendChild(wrap);
  const pos = initialPos(entry);
  wrap.style.left = `${pos.x}px`;
  wrap.style.top = `${pos.y}px`;
  if (settings.transitionEffect) {
    wrap.style.opacity = '0';
    requestAnimationFrame(() => requestAnimationFrame(() => { wrap.style.opacity = '1'; }));
  }
  return wrap;
}

function removeAvatarEl(entry) {
  clearTimeout(entry.moveTimer);
  if (settings.transitionEffect) {
    entry.el.style.opacity = '0';
    setTimeout(() => entry.el.remove(), settings.transitionSeconds * 1000);
  } else {
    entry.el.remove();
  }
}

function applySkin(el, skin) {
  const img = el.querySelector('.avatar');
  const name = el.querySelector('.avatar-name');
  const file = SPECIES_FILES[skin.species] || SPECIES_FILES.cat;
  const src = `/overlay/sprites/${file}`;
  if (!img.src.endsWith(file)) img.src = src;
  el.dataset.species = skin.species;

  if (skin.species === 'mon-avatar') {
    const size = `${settings.ownerSize}px`;
    img.style.width = size;
    img.style.height = size;
    img.style.filter = 'none';
    name.style.color = settings.ownerNameColor;
  } else {
    img.style.width = '';
    img.style.height = '';
    img.style.filter = skin.hue ? `hue-rotate(${skin.hue}deg)` : 'none';
    name.style.color = '';
  }
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function wander(login) {
  const entry = avatars.get(login);
  if (!entry) return;
  const pos = nextPos(entry);
  if (settings.mirrorOnDirection) {
    const prevX = parseFloat(entry.el.style.left) || pos.x;
    if (Math.abs(pos.x - prevX) > 1) {
      const movingLeft = pos.x < prevX;
      const mirror = settings.spriteFlip[entry.el.dataset.species] ? !movingLeft : movingLeft;
      entry.el.querySelector('.avatar').style.transform = mirror ? 'scaleX(-1)' : 'scaleX(1)';
    }
  }
  entry.el.style.left = `${pos.x}px`;
  entry.el.style.top = `${pos.y}px`;
  // laisse toujours le trajet en cours se terminer avant d'en lancer un nouveau,
  // sinon l'avatar est sans cesse redirigé avant d'atteindre sa destination
  const wait = Math.max(settings.moveIntervalMs, settings.transitionSeconds * 1000) + Math.random() * settings.moveVarianceMs;
  entry.moveTimer = setTimeout(() => wander(login), wait);
}

// --- Graffiti collectif (!pixel / !sticker) ---
let graffitiState = { cols: 60, rows: 34, cells: {} };
const stickerImages = {};
function getStickerImage(species) {
  if (!stickerImages[species]) {
    const img = new Image();
    img.src = `/overlay/sprites/${SPECIES_FILES[species] || SPECIES_FILES.cat}`;
    stickerImages[species] = img;
  }
  return stickerImages[species];
}

function drawGraffitiCell(x, y, cell) {
  const px = x * GRAFFITI_CELL_PX;
  const py = y * GRAFFITI_CELL_PX;
  graffitiCtx.clearRect(px, py, GRAFFITI_CELL_PX, GRAFFITI_CELL_PX);
  if (!cell) return;
  if (cell.type === 'pixel') {
    graffitiCtx.fillStyle = cell.color;
    graffitiCtx.fillRect(px, py, GRAFFITI_CELL_PX, GRAFFITI_CELL_PX);
  } else if (cell.type === 'sticker') {
    const size = GRAFFITI_CELL_PX * 3;
    const img = getStickerImage(cell.species);
    const draw = () => graffitiCtx.drawImage(img, px - GRAFFITI_CELL_PX, py - GRAFFITI_CELL_PX, size, size);
    if (img.complete) draw();
    else img.addEventListener('load', draw, { once: true });
  }
}

function redrawGraffitiCanvas() {
  graffitiCtx.clearRect(0, 0, graffitiCanvas.width, graffitiCanvas.height);
  for (const key in graffitiState.cells) {
    const [x, y] = key.split(',').map(Number);
    drawGraffitiCell(x, y, graffitiState.cells[key]);
  }
}

function initGraffitiCanvas(data) {
  graffitiState = { cols: data.cols, rows: data.rows, cells: data.cells || {} };
  graffitiCanvas.width = graffitiState.cols * GRAFFITI_CELL_PX;
  graffitiCanvas.height = graffitiState.rows * GRAFFITI_CELL_PX;
  redrawGraffitiCanvas();
}

function applyGraffitiLayout() {
  const g = settings.graffiti;
  graffitiCanvas.style.display = g.enabled ? 'block' : 'none';
  graffitiCanvas.style.left = `${g.position.x}%`;
  graffitiCanvas.style.top = `${g.position.y}%`;
  graffitiCanvas.style.width = `${g.position.width}%`;
  graffitiCanvas.style.height = `${g.position.height}%`;
}

function applyChatOverlayLayout() {
  const c = settings.chatOverlay;
  chatOverlayEl.style.display = c.enabled ? 'flex' : 'none';
  chatOverlayEl.style.left = `${c.position.x}%`;
  chatOverlayEl.style.top = `${c.position.y}%`;
  chatOverlayEl.style.width = `${c.position.width}%`;
  chatOverlayEl.style.height = `${c.position.height}%`;
  chatOverlayEl.style.fontSize = `${c.fontSize}px`;
  chatOverlayEl.style.color = c.textColor;
  chatOverlayEl.style.transform = `rotate(${c.rotation}deg)`;
  chatOverlayEl.classList.toggle('style-bubbles', c.style === 'bubbles');
  chatOverlayEl.classList.toggle('style-list', c.style !== 'bubbles');
  const rgb = hexToRgb(c.bgColor);
  chatOverlayEl.style.background = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${c.bgOpacity / 100})`;
}

function applyActivityFeedLayout() {
  const a = settings.activityFeed;
  activityFeedEl.style.display = a.enabled ? 'block' : 'none';
  activityFeedEl.style.left = `${a.position.x}%`;
  activityFeedEl.style.top = `${a.position.y}%`;
  activityFeedEl.style.width = `${a.position.width}%`;
  activityFeedEl.style.height = `${a.position.height}%`;
  activityFeedEl.style.fontSize = `${a.fontSize}px`;
  activityFeedEl.style.color = a.textColor;
  const rgb = hexToRgb(a.bgColor);
  activityFeedEl.style.background = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a.bgOpacity / 100})`;
  activityFeedTrackEl.style.animationDuration = `${a.speedSeconds}s`;
}

function applyFollowListLayout() {
  const f = settings.followList;
  followListEl.style.display = f.enabled ? 'block' : 'none';
  followListEl.style.left = `${f.position.x}%`;
  followListEl.style.top = `${f.position.y}%`;
  followListEl.style.width = `${f.position.width}%`;
  followListEl.style.height = `${f.position.height}%`;
  followListEl.style.fontSize = `${f.fontSize}px`;
  followListEl.style.color = f.textColor;
  const rgb = hexToRgb(f.bgColor);
  followListEl.style.background = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${f.bgOpacity / 100})`;
  followListTrackEl.style.animationDuration = `${f.speedSeconds}s`;
}

const ACTIVITY_LABELS = {
  follow: (a) => `💜 ${a.displayName} vient de follow !`,
  subscribe: (a) => `⭐ ${a.displayName} vient de s'abonner !`,
  cheer: (a) => `💎 ${a.displayName} a cheer ${a.extra} bits !`,
  raid: (a) => `🚀 Raid de ${a.displayName} (${a.extra} viewers) !`,
};

function renderActivity(recent) {
  const items = recent.slice(0, RECENT_ACTIVITY_DISPLAY_MAX).map((a) => {
    const label = ACTIVITY_LABELS[a.kind];
    return label ? `<span class="activity-feed-item">${escapeHtml(label(a))}</span>` : '';
  });
  // dupliqué pour un défilement continu sans trou visible
  activityFeedTrackEl.innerHTML = items.join('') + items.join('');
}

function renderPeople(people) {
  const mode = settings.followList.mode;
  let list = [];
  if (mode === 'followers') list = people.followers;
  else if (mode === 'subs') list = people.subs;
  else {
    list = [
      ...people.followers.map((p) => ({ ...p, tag: '💜' })),
      ...people.subs.map((p) => ({ ...p, tag: '⭐' })),
    ].sort((a, b) => b.since - a.since);
  }
  const items = list.map((p) => `<span class="follow-list-item">${p.tag || ''} ${escapeHtml(p.displayName)}</span>`);
  followListTrackEl.innerHTML = items.join('') + items.join('');
}

function applyTamagotchiLayout() {
  const t = settings.tamagotchi;
  tamagotchiEl.style.display = t.enabled ? 'flex' : 'none';
  tamagotchiEl.style.left = `${t.position.x}%`;
  tamagotchiEl.style.top = `${t.position.y}%`;
  tamagotchiEl.style.width = `${t.size}px`;
  tamagotchiImgEl.src = t.species === 'mascot' ? '/overlay/sprites/mascot.png' : `/overlay/sprites/${SPECIES_FILES[t.species] || SPECIES_FILES.cat}`;
  tamagotchiEl.classList.toggle('hide-bar', !t.showBar);
}

function renderTamagotchiMood(mood) {
  tamagotchiBarEl.style.width = `${mood}%`;
  tamagotchiEl.classList.toggle('mood-happy', mood >= 70);
  tamagotchiEl.classList.toggle('mood-neutral', mood >= 35 && mood < 70);
  tamagotchiEl.classList.toggle('mood-sad', mood < 35);
}

const TAMAGOTCHI_REACTION_CLASSES = ['react-pulse', 'react-jump', 'react-shake', 'react-spin', 'react-bounce'];
let tamagotchiReactionTimer = null;
function playTamagotchiReaction(reaction) {
  const cls = `react-${reaction}`;
  if (!TAMAGOTCHI_REACTION_CLASSES.includes(cls)) return;
  tamagotchiEl.classList.remove(...TAMAGOTCHI_REACTION_CLASSES);
  // force le reflow pour pouvoir relancer la même animation deux fois de suite
  void tamagotchiEl.offsetWidth;
  tamagotchiEl.classList.add(cls);
  clearTimeout(tamagotchiReactionTimer);
  tamagotchiReactionTimer = setTimeout(() => tamagotchiEl.classList.remove(cls), 1200);
}

let raidCardHideTimer = null;
function applyRaidCardLayout() {
  const r = settings.raidCard;
  raidCardEl.style.left = `${r.position.x}%`;
  raidCardEl.style.top = `${r.position.y}%`;
  raidCardEl.style.fontSize = `${r.fontSize}px`;
  raidCardEl.style.color = r.textColor;
  const rgb = hexToRgb(r.bgColor);
  raidCardEl.style.background = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${r.bgOpacity / 100})`;
}

function showRaidCard(data) {
  const r = settings.raidCard;
  if (!r.enabled) return;
  raidCardEl.innerHTML = `
    <img class="raid-card-avatar" src="${data.avatar || ''}" alt="" />
    <div class="raid-card-info">
      <div class="raid-card-name">🚀 ${escapeHtml(data.displayName || data.login)}</div>
      ${data.game ? `<div class="raid-card-game">${escapeHtml(data.game)}</div>` : ''}
      ${data.title ? `<div class="raid-card-title">${escapeHtml(data.title)}</div>` : ''}
      <div class="raid-card-viewers">${data.viewers ?? '?'} viewers</div>
    </div>
  `;
  raidCardEl.classList.add('visible');
  clearTimeout(raidCardHideTimer);
  raidCardHideTimer = setTimeout(() => raidCardEl.classList.remove('visible'), r.durationSeconds * 1000);
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// Couleur stable par pseudo (mode "palette"), utile quand Twitch ne fournit pas de couleur perso.
const RECENT_ACTIVITY_DISPLAY_MAX = 15;
const CHAT_PALETTE = ['#ff6ec7', '#18dcff', '#ffd633', '#2ed573', '#9147ff', '#ff9f43', '#ff4757', '#3742fa', '#7bed9f', '#eccc68'];
function paletteColorFor(login) {
  let hash = 0;
  for (const c of login) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return CHAT_PALETTE[hash % CHAT_PALETTE.length];
}

function nameColorFor(c, data) {
  if (c.colorMode === 'twitch') return data.color || paletteColorFor(data.login);
  if (c.colorMode === 'palette') return paletteColorFor(data.login);
  return c.textColor;
}

function addChatLogMessage(data) {
  const c = settings.chatOverlay;
  if (!c.enabled) return;

  const nameColor = nameColorFor(c, data);
  const row = document.createElement('div');
  row.className = 'chat-overlay-msg';
  if (data.id) row.dataset.msgId = data.id;
  row.dataset.login = data.login;
  if (c.style === 'bubbles') row.style.setProperty('--msg-color', nameColor);
  const nameEl = document.createElement('span');
  nameEl.className = 'chat-overlay-name';
  nameEl.textContent = `${data.displayName}: `;
  nameEl.style.color = nameColor;
  row.appendChild(nameEl);
  row.appendChild(document.createTextNode(data.text));
  chatOverlayListEl.appendChild(row);

  while (chatOverlayListEl.children.length > c.maxMessages) {
    chatOverlayListEl.removeChild(chatOverlayListEl.firstChild);
  }

  if (c.fadeSeconds > 0) {
    setTimeout(() => {
      row.classList.add('fading');
      setTimeout(() => row.remove(), 1300);
    }, c.fadeSeconds * 1000);
  }
}

function removeChatLogMessage(id) {
  if (!id) return;
  const row = chatOverlayListEl.querySelector(`[data-msg-id="${id}"]`);
  if (row) row.remove();
}

function clearChatLogMessages(login) {
  const rows = login
    ? chatOverlayListEl.querySelectorAll(`[data-login="${login}"]`)
    : chatOverlayListEl.querySelectorAll('.chat-overlay-msg');
  rows.forEach((row) => row.remove());
}

const timerEls = {}; // id -> { el, interval }

function formatTimer(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function handleTimerMessage(data) {
  const existing = timerEls[data.id];

  if (data.action === 'stop' || (data.action === 'start' && data.endAt <= Date.now())) {
    if (existing) {
      clearInterval(existing.interval);
      existing.el.remove();
      delete timerEls[data.id];
    }
    return;
  }

  if (existing) {
    clearInterval(existing.interval);
    existing.el.remove();
  }

  const el = document.createElement('div');
  el.className = 'timer-box';
  el.style.left = `${data.cfg.position.x}%`;
  el.style.top = `${data.cfg.position.y}%`;
  el.style.color = data.cfg.color;
  el.style.fontSize = `${data.cfg.fontSize}px`;
  el.innerHTML = `<div class="timer-label">${escapeHtml(data.cfg.label)}</div><div class="timer-value"></div>`;
  timerLayer.appendChild(el);

  const valueEl = el.querySelector('.timer-value');
  function tick() {
    const remaining = data.endAt - Date.now();
    if (remaining <= 0) {
      valueEl.textContent = formatTimer(0);
      clearInterval(timerEls[data.id].interval);
      setTimeout(() => { el.remove(); delete timerEls[data.id]; }, 1500);
      return;
    }
    valueEl.textContent = formatTimer(remaining);
  }
  tick();
  const interval = setInterval(tick, 250);
  timerEls[data.id] = { el, interval };
}

const CHAT_BUBBLE_MS = 5000;

function showChatBubble(login, text) {
  const entry = avatars.get(login.toLowerCase());
  if (!entry) return;
  const wrap = entry.el;

  const existing = wrap.querySelector('.chat-bubble');
  if (existing) existing.remove();

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.textContent = text;
  wrap.insertBefore(bubble, wrap.firstChild);
  requestAnimationFrame(() => bubble.classList.add('show'));

  setTimeout(() => {
    bubble.classList.remove('show');
    setTimeout(() => bubble.remove(), 300);
  }, CHAT_BUBBLE_MS);
}

function syncState(viewers) {
  const seen = new Set();
  for (const { login, skin } of viewers) {
    seen.add(login);
    if (avatars.has(login)) {
      applySkin(avatars.get(login).el, skin);
    } else {
      const entry = { el: null, moveTimer: null, login };
      entry.el = createAvatarEl(login, skin, entry);
      avatars.set(login, entry);
      entry.moveTimer = setTimeout(() => wander(login), Math.max(settings.moveIntervalMs, settings.transitionSeconds * 1000));
    }
  }
  for (const [login, entry] of avatars) {
    // ne retire pas un avatar temporaire (ex: rebond de raid) avant la fin de sa réaction
    if (!seen.has(login) && !entry.temporary) {
      removeAvatarEl(entry);
      avatars.delete(login);
    }
  }
}

const EVENT_KEYS = {
  'channel.follow': 'follow',
  'channel.subscribe': 'subscribe',
  'channel.cheer': 'cheer',
  'channel.raid': 'raid',
};

function buildEventText(eventType, event, cfg) {
  const vars = {
    user: event.user_name || event.from_broadcaster_user_name || 'Quelqu\'un',
    bits: event.bits,
    viewers: event.viewers,
  };
  return cfg.text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
}

const RAIN_FALL_MS = 1500;
const RAIN_PAUSE_MS = 500;
const RAIN_REPEATS = 3;

function rainDrop(entry, color, remaining) {
  const bounds = zoneBounds();
  const x = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
  const landingY = bounds.maxY;

  entry.el.style.setProperty('--event-glow', color);
  entry.el.classList.add('event-rain');

  // téléporte au-dessus de l'écran, sans transition, puis relance la chute vers le bas
  entry.el.style.transition = 'none';
  entry.el.style.left = `${x}px`;
  entry.el.style.top = `${-settings.avatarSize}px`;
  entry.el.offsetHeight; // force le navigateur à appliquer la position avant de ré-activer la transition
  entry.el.style.transition = '';
  entry.el.style.top = `${landingY}px`;

  entry.moveTimer = setTimeout(() => {
    if (remaining > 1) {
      rainDrop(entry, color, remaining - 1);
    } else {
      entry.el.classList.remove('event-rain');
      wander(entry.login);
    }
  }, RAIN_FALL_MS + RAIN_PAUSE_MS);
}

function makeItRain(entry, color) {
  clearTimeout(entry.moveTimer);
  rainDrop(entry, color, RAIN_REPEATS);
}

const BOUNCE_FRAME_MS = 20;
const BOUNCE_DURATION_MS = 8000;

function bounceFrame(entry, state) {
  if (Date.now() >= state.endAt) {
    entry.el.classList.remove('event-bounce');
    entry.el.style.transition = '';
    if (entry.temporary) {
      removeAvatarEl(entry);
      avatars.delete(entry.login);
    } else {
      wander(entry.login);
    }
    return;
  }
  const maxX = Math.max(0, window.innerWidth - settings.avatarSize);
  const maxY = Math.max(0, window.innerHeight - settings.avatarSize);
  state.x += state.vx;
  state.y += state.vy;
  if (state.x <= 0) { state.x = 0; state.vx = Math.abs(state.vx); }
  else if (state.x >= maxX) { state.x = maxX; state.vx = -Math.abs(state.vx); }
  if (state.y <= 0) { state.y = 0; state.vy = Math.abs(state.vy); }
  else if (state.y >= maxY) { state.y = maxY; state.vy = -Math.abs(state.vy); }
  entry.el.style.left = `${state.x}px`;
  entry.el.style.top = `${state.y}px`;
  entry.moveTimer = setTimeout(() => bounceFrame(entry, state), BOUNCE_FRAME_MS);
}

function makeItBounce(entry, color) {
  clearTimeout(entry.moveTimer);
  entry.el.style.setProperty('--event-glow', color);
  entry.el.classList.add('event-bounce');
  entry.el.style.transition = 'none';
  const speed = 18 + Math.random() * 12; // px par frame
  const angle = Math.random() * Math.PI * 2;
  const state = {
    x: parseFloat(entry.el.style.left) || 0,
    y: parseFloat(entry.el.style.top) || 0,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    endAt: Date.now() + BOUNCE_DURATION_MS,
  };
  bounceFrame(entry, state);
}

// Fait apparaître temporairement (le temps du rebond) tous les avatars connus mais absents du chat actif
function ensureCastAvatars(cast) {
  if (!cast) return;
  for (const { login, skin } of cast) {
    if (!avatars.has(login)) {
      const entry = { el: null, moveTimer: null, login, temporary: true };
      entry.el = createAvatarEl(login, skin, entry);
      avatars.set(login, entry);
    }
  }
}

function showEvent(eventType, event, cast) {
  const key = EVENT_KEYS[eventType];
  const cfg = settings.events?.[key];
  if (!cfg || !cfg.enabled) return;

  if (cfg.sound) {
    const audio = new Audio(`/sounds/${cfg.sound}`);
    audio.play().catch((err) => console.error('[son] lecture impossible:', err.message));
  }

  if (cfg.reaction === 'rain') {
    for (const entry of avatars.values()) makeItRain(entry, cfg.color);
  } else if (cfg.reaction === 'bounce') {
    ensureCastAvatars(cast);
    for (const entry of avatars.values()) makeItBounce(entry, cfg.color);
  } else if (cfg.reaction !== 'none') {
    const cls = `event-${cfg.reaction}`;
    for (const entry of avatars.values()) {
      entry.el.style.setProperty('--event-glow', cfg.color);
      entry.el.classList.add(cls);
      // fige le déplacement normal le temps de la réaction, pour ne pas la parasiter
      clearTimeout(entry.moveTimer);
      entry.moveTimer = setTimeout(() => wander(entry.login), 3600);
      setTimeout(() => entry.el.classList.remove(cls), 3600);
    }
  }

  if (cfg.showText) {
    const popup = document.createElement('div');
    popup.className = 'event-popup';
    popup.style.left = `${cfg.position.x}%`;
    popup.style.top = `${cfg.position.y}%`;
    popup.style.color = cfg.color;
    popup.style.fontSize = `${cfg.fontSize}px`;
    popup.textContent = buildEventText(eventType, event, cfg);
    eventLayer.appendChild(popup);
    setTimeout(() => popup.remove(), 3600);
  }
}

const PREVIEW_MODE = new URLSearchParams(location.search).get('preview') === '1';

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${protocol}://${location.host}/ws${PREVIEW_MODE ? '?preview=1' : ''}`);

  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.type === 'settings') applySettings(data.settings);
    if (data.type === 'state') syncState(data.viewers);
    if (data.type === 'event') showEvent(data.eventType, data.event, data.cast);
    if (data.type === 'chat') showChatBubble(data.login, data.text);
    if (data.type === 'timer') handleTimerMessage(data);
    if (data.type === 'canvas-init') initGraffitiCanvas(data);
    if (data.type === 'canvas-update') drawGraffitiCell(data.x, data.y, data.cell);
    if (data.type === 'chatlog') addChatLogMessage(data);
    if (data.type === 'chatlog-delete') removeChatLogMessage(data.id);
    if (data.type === 'chatlog-clear') clearChatLogMessages(data.login);
    if (data.type === 'activity') {
      renderActivity(data.recent);
      renderPeople(data.people);
    }
    if (data.type === 'tamagotchi') renderTamagotchiMood(data.mood);
    if (data.type === 'tamagotchi-reaction') playTamagotchiReaction(data.reaction);
    if (data.type === 'raid-card') showRaidCard(data);
  };

  ws.onclose = () => setTimeout(connect, 3000);
  ws.onerror = () => ws.close();
}

connect();
