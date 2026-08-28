const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const AVATARS_PATH = path.join(DATA_DIR, 'avatars.json');
const TOKENS_PATH = path.join(DATA_DIR, 'tokens.json');
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');
const CANVAS_PATH = path.join(DATA_DIR, 'canvas.json');

const DEFAULT_SETTINGS = {
  avatarSize: 64,
  zone: { top: 8, right: 5, bottom: 8, left: 5 },
  moveIntervalMs: 4500,
  moveVarianceMs: 2000,
  transitionSeconds: 4,
  movementPattern: 'random',
  corridorPosition: 50,
  mirrorOnDirection: true,
  inactivityMinutes: 10,
  transitionEffect: true,
  nameTag: { show: true, fontSize: 13, color: '#ffffff' },
  ownerNameColor: '#ffd633',
  ownerSize: 64,
  spriteFlip: {
    cat: true,
    'cosmic-cat': true,
    'cyber-unicorn': true,
    dino: false,
    girl: false,
    'grunge-boy': false,
    unicorn: false,
    'mon-avatar': true,
    alien: false,
    boy: false,
    'cyber-triceratops': true,
    'cyber-raptor': false,
    'cyber-puppy': false,
    'cyber-wolf': false,
    'gothic-girl': false,
    guerriere: false,
    ninja: false,
    panda: false,
    pizza: false,
    'skate-boy': false,
    witch: false,
  },
  timers: {
    intro: { label: 'Le stream démarre dans...', durationSeconds: 300, color: '#ffffff', fontSize: 32, position: { x: 50, y: 50 } },
    pause: { label: 'De retour dans...', durationSeconds: 300, color: '#ffffff', fontSize: 32, position: { x: 50, y: 50 } },
  },
  graffiti: {
    enabled: true,
    cols: 60,
    rows: 34,
    cooldownSeconds: 8,
    position: { x: 2, y: 58, width: 32, height: 38 },
  },
  chatOverlay: {
    enabled: false,
    maxMessages: 8,
    fontSize: 14,
    textColor: '#ffffff',
    useUserColor: true,
    bgColor: '#000000',
    bgOpacity: 55,
    fadeSeconds: 12,
    position: { x: 78, y: 55, width: 20, height: 40 },
  },
  events: {
    follow: { enabled: true, showText: true, text: '💜 {user} vient de follow !', color: '#ffffff', fontSize: 16, reaction: 'pulse', position: { x: 50, y: 14 }, sound: null },
    subscribe: { enabled: true, showText: true, text: '⭐ {user} vient de s\'abonner !', color: '#ffffff', fontSize: 16, reaction: 'jump', position: { x: 50, y: 14 }, sound: null },
    cheer: { enabled: true, showText: true, text: '💎 {user} a cheer {bits} bits !', color: '#ffffff', fontSize: 16, reaction: 'shake', position: { x: 50, y: 14 }, sound: null },
    raid: { enabled: true, showText: true, text: '🚀 Raid de {user} ({viewers} viewers) !', color: '#ffffff', fontSize: 16, reaction: 'bounce', position: { x: 50, y: 14 }, sound: null },
  },
};

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getAllAvatars() {
  return readJson(AVATARS_PATH, {});
}

// Canvas graffiti collectif : cells = { "x,y": { type: 'pixel', color } | { type: 'sticker', species } }
function getCanvas() {
  return readJson(CANVAS_PATH, { cols: DEFAULT_SETTINGS.graffiti.cols, rows: DEFAULT_SETTINGS.graffiti.rows, cells: {} });
}

function setCanvasCell(x, y, cell) {
  const canvas = getCanvas();
  canvas.cells[`${x},${y}`] = cell;
  writeJson(CANVAS_PATH, canvas);
  return canvas;
}

function resetCanvas(cols, rows) {
  const canvas = { cols, rows, cells: {} };
  writeJson(CANVAS_PATH, canvas);
  return canvas;
}

function getAvatar(login) {
  const avatars = getAllAvatars();
  return avatars[login.toLowerCase()] || null;
}

function setAvatar(login, skin) {
  const avatars = getAllAvatars();
  avatars[login.toLowerCase()] = skin;
  writeJson(AVATARS_PATH, avatars);
  return avatars[login.toLowerCase()];
}

function getTokens() {
  return readJson(TOKENS_PATH, null);
}

function setTokens(tokens) {
  writeJson(TOKENS_PATH, tokens);
}

function mergeEventConfig(defaults, saved) {
  return { ...defaults, ...(saved || {}), position: { ...defaults.position, ...(saved?.position || {}) } };
}

function getSettings() {
  const saved = readJson(SETTINGS_PATH, {});
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    zone: { ...DEFAULT_SETTINGS.zone, ...(saved.zone || {}) },
    nameTag: { ...DEFAULT_SETTINGS.nameTag, ...(saved.nameTag || {}) },
    spriteFlip: { ...DEFAULT_SETTINGS.spriteFlip, ...(saved.spriteFlip || {}) },
    timers: {
      intro: { ...DEFAULT_SETTINGS.timers.intro, ...(saved.timers?.intro || {}), position: { ...DEFAULT_SETTINGS.timers.intro.position, ...(saved.timers?.intro?.position || {}) } },
      pause: { ...DEFAULT_SETTINGS.timers.pause, ...(saved.timers?.pause || {}), position: { ...DEFAULT_SETTINGS.timers.pause.position, ...(saved.timers?.pause?.position || {}) } },
    },
    graffiti: {
      ...DEFAULT_SETTINGS.graffiti,
      ...(saved.graffiti || {}),
      position: { ...DEFAULT_SETTINGS.graffiti.position, ...(saved.graffiti?.position || {}) },
    },
    chatOverlay: {
      ...DEFAULT_SETTINGS.chatOverlay,
      ...(saved.chatOverlay || {}),
      position: { ...DEFAULT_SETTINGS.chatOverlay.position, ...(saved.chatOverlay?.position || {}) },
    },
    events: {
      follow: mergeEventConfig(DEFAULT_SETTINGS.events.follow, saved.events?.follow),
      subscribe: mergeEventConfig(DEFAULT_SETTINGS.events.subscribe, saved.events?.subscribe),
      cheer: mergeEventConfig(DEFAULT_SETTINGS.events.cheer, saved.events?.cheer),
      raid: mergeEventConfig(DEFAULT_SETTINGS.events.raid, saved.events?.raid),
    },
  };
}

function setSettings(settings) {
  writeJson(SETTINGS_PATH, settings);
  return settings;
}

module.exports = {
  getAllAvatars,
  getAvatar,
  setAvatar,
  getTokens,
  setTokens,
  getSettings,
  setSettings,
  getCanvas,
  setCanvasCell,
  resetCanvas,
  DEFAULT_SETTINGS,
  DATA_DIR,
};
