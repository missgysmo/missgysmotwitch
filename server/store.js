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

function getSettings() {
  const saved = readJson(SETTINGS_PATH, {});
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    zone: { ...DEFAULT_SETTINGS.zone, ...(saved.zone || {}) },
    nameTag: { ...DEFAULT_SETTINGS.nameTag, ...(saved.nameTag || {}) },
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
