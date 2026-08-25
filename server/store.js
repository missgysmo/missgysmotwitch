const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const AVATARS_PATH = path.join(DATA_DIR, 'avatars.json');
const TOKENS_PATH = path.join(DATA_DIR, 'tokens.json');
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');

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
  ownerHue: 0,
  spriteFlip: {
    cat: true,
    'cosmic-cat': true,
    'cyber-unicorn': true,
    dino: false,
    girl: false,
    'grunge-boy': false,
    unicorn: false,
    'mon-avatar': true,
  },
  events: {
    follow: { enabled: true, showText: true, text: '💜 {user} vient de follow !', color: '#ffffff', fontSize: 16, reaction: 'pulse', position: { x: 50, y: 14 } },
    subscribe: { enabled: true, showText: true, text: '⭐ {user} vient de s\'abonner !', color: '#ffffff', fontSize: 16, reaction: 'jump', position: { x: 50, y: 14 } },
    cheer: { enabled: true, showText: true, text: '💎 {user} a cheer {bits} bits !', color: '#ffffff', fontSize: 16, reaction: 'shake', position: { x: 50, y: 14 } },
    raid: { enabled: true, showText: true, text: '🚀 Raid de {user} ({viewers} viewers) !', color: '#ffffff', fontSize: 16, reaction: 'rain', position: { x: 50, y: 14 } },
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
  DEFAULT_SETTINGS,
};
