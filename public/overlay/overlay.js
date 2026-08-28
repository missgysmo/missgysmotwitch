const stage = document.getElementById('stage');
const eventLayer = document.getElementById('event-layer');

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
    if (!seen.has(login)) {
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
const BOUNCE_DURATION_MS = 16000;

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

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${protocol}://${location.host}/ws`);

  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.type === 'settings') applySettings(data.settings);
    if (data.type === 'state') syncState(data.viewers);
    if (data.type === 'event') showEvent(data.eventType, data.event, data.cast);
  };

  ws.onclose = () => setTimeout(connect, 3000);
  ws.onerror = () => ws.close();
}

connect();
