require('dotenv').config();
const express = require('express');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const path = require('path');
const multer = require('multer');

const store = require('./store');
const species = require('./species');
const { createChatTracker } = require('./twitchChat');
const twitchEvents = require('./twitchEvents');

const PORT = process.env.PORT || 3000;
const CHANNEL = process.env.TWITCH_CHANNEL;
const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI || `http://localhost:${PORT}/auth/callback`;
const SETTINGS_PASSWORD = process.env.SETTINGS_PASSWORD;

if (!CHANNEL) {
  console.error('TWITCH_CHANNEL manquant dans .env');
  process.exit(1);
}
if (!SETTINGS_PASSWORD) {
  console.error('SETTINGS_PASSWORD manquant dans .env — nécessaire pour protéger /settings');
  process.exit(1);
}

const ADMIN_TOKEN = crypto.randomBytes(24).toString('hex');
const ADMIN_COOKIE = 'admin_token';

function getCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  const found = header.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.split('=')[1]) : null;
}

function isAdmin(req) {
  return getCookie(req, ADMIN_COOKIE) === ADMIN_TOKEN;
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Non autorisé, connecte-toi sur /settings' });
  next();
}

const app = express();
app.use(express.json());

app.get(['/settings', '/settings/'], (req, res) => {
  const file = isAdmin(req) ? 'panel.html' : 'login.html';
  res.sendFile(path.join(__dirname, '..', 'public', 'settings', file));
});

app.post('/api/admin/login', (req, res) => {
  if (req.body.password !== SETTINGS_PASSWORD) return res.status(401).json({ error: 'mot de passe incorrect' });
  res.cookie(ADMIN_COOKIE, ADMIN_TOKEN, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie(ADMIN_COOKIE);
  res.json({ ok: true });
});

// no-cache : évite qu'OBS/le navigateur affiche une version périmée d'overlay.js après un déploiement
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
}));

// --- Sons des alertes (upload par l'admin, stockés sur le volume persistant) ---
const SOUNDS_DIR = path.join(store.DATA_DIR, 'sounds');
fs.mkdirSync(SOUNDS_DIR, { recursive: true });
app.use('/sounds', express.static(SOUNDS_DIR, { maxAge: '1y' }));

const soundUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

app.post('/api/admin/sound/:type', requireAdmin, (req, res) => {
  soundUpload.single('sound')(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux (8 Mo max)' : err.message;
      return res.status(400).json({ error: message });
    }
    handleSoundUpload(req, res);
  });
});

function handleSoundUpload(req, res) {
  const type = req.params.type;
  const settings = store.getSettings();
  if (!settings.events[type]) return res.status(400).json({ error: 'type invalide' });
  if (!req.file) return res.status(400).json({ error: 'fichier audio manquant ou format invalide' });

  const ext = path.extname(req.file.originalname) || '.mp3';
  const filename = `${type}-${Date.now()}${ext}`;
  fs.writeFileSync(path.join(SOUNDS_DIR, filename), req.file.buffer);

  const oldFile = settings.events[type].sound;
  settings.events[type].sound = filename;
  store.setSettings(settings);
  if (oldFile) fs.rm(path.join(SOUNDS_DIR, oldFile), { force: true }, () => {});

  broadcast({ type: 'settings', settings });
  res.json({ ok: true, sound: filename });
}

app.delete('/api/admin/sound/:type', requireAdmin, (req, res) => {
  const type = req.params.type;
  const settings = store.getSettings();
  if (!settings.events[type]) return res.status(400).json({ error: 'type invalide' });

  const oldFile = settings.events[type].sound;
  settings.events[type].sound = null;
  store.setSettings(settings);
  if (oldFile) fs.rm(path.join(SOUNDS_DIR, oldFile), { force: true }, () => {});

  broadcast({ type: 'settings', settings });
  res.json({ ok: true });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const overlayClients = new Set();

function broadcast(message) {
  const data = JSON.stringify(message);
  for (const client of overlayClients) {
    if (client.readyState === client.OPEN) client.send(data);
  }
}

// Avatars de test (admin uniquement) : pour prévisualiser un personnage sur l'overlay sans vrai viewer.
const testAvatars = new Map(); // login -> { species, hue }

function buildState() {
  const active = chatTracker.getActiveLogins().filter((login) => !isChannelOwner(login));
  const real = active.filter(isFollowerCached).map((login) => ({ login, skin: getSkin(login) }));
  const test = [...testAvatars.entries()].map(([login, skin]) => ({ login, skin }));
  const owner = { login: CHANNEL, skin: getSkin(CHANNEL) };
  return { type: 'state', viewers: [owner, ...real, ...test] };
}

function isChannelOwner(login) {
  return login.toLowerCase() === CHANNEL.toLowerCase();
}

// --- Vérification "followers uniquement" ---
// Seuls les followers de la chaîne ont un avatar sur l'overlay.
let broadcasterId = null;
const followerCache = new Map(); // login (lowercase) -> { follows, checkedAt }
const FOLLOWER_TTL_MS = 5 * 60 * 1000;

async function ensureBroadcasterId() {
  if (broadcasterId) return broadcasterId;
  if (!store.getTokens()) return null;
  broadcasterId = await twitchEvents.getUserId({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, login: CHANNEL });
  return broadcasterId;
}

async function checkAndCacheFollower(login) {
  if (isChannelOwner(login)) return true;
  const key = login.toLowerCase();
  try {
    const bId = await ensureBroadcasterId();
    if (!store.getTokens() || !bId) throw new Error('app pas encore autorisée via /auth');
    const userId = await twitchEvents.getUserId({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, login });
    const follows = await twitchEvents.checkFollower({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, broadcasterId: bId, userId });
    followerCache.set(key, { follows, checkedAt: Date.now() });
    return follows;
  } catch (err) {
    console.error(`[followers] échec vérification pour ${login}:`, err.message);
    followerCache.set(key, { follows: false, checkedAt: Date.now() });
    return false;
  }
}

// Lecture synchrone pour buildState() : renvoie la dernière valeur connue (false si jamais vérifié)
// et relance une vérification en arrière-plan si absente ou périmée.
function isFollowerCached(login) {
  if (isChannelOwner(login)) return true;
  const key = login.toLowerCase();
  const cached = followerCache.get(key);
  if (!cached || Date.now() - cached.checkedAt > FOLLOWER_TTL_MS) {
    checkAndCacheFollower(login).then((follows) => {
      const prev = cached?.follows;
      if (follows !== prev) broadcast(buildState());
    });
  }
  return cached ? cached.follows : false;
}

function getSkin(login) {
  if (isChannelOwner(login)) return { species: 'mon-avatar', hue: 0 };
  return store.getAvatar(login) || defaultSkin(login);
}

function defaultSkin(login) {
  const selectable = species.getSelectable();
  const hash = [...login].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return { species: selectable[hash % selectable.length].id, hue: 0 };
}

const chatTracker = createChatTracker(CHANNEL, {
  onChange: () => broadcast(buildState()),
  getInactivityMs: () => store.getSettings().inactivityMinutes * 60 * 1000,
  onMessage: (login, message) => {
    // seuls les followers (ou le streamer) ont un avatar affiché, inutile de diffuser sinon
    const cached = followerCache.get(login);
    if (!isChannelOwner(login) && !cached?.follows) return;
    broadcast({ type: 'chat', login, text: message.slice(0, 200) });
  },
});

// Chronomètres (intro / pause) : état éphémère en mémoire, pas persisté sur disque.
const activeTimers = {}; // id -> endAt (ms epoch)

wss.on('connection', (ws) => {
  overlayClients.add(ws);
  ws.send(JSON.stringify({ type: 'settings', settings: store.getSettings() }));
  ws.send(JSON.stringify(buildState()));
  for (const [id, endAt] of Object.entries(activeTimers)) {
    if (endAt > Date.now()) {
      ws.send(JSON.stringify({ type: 'timer', id, action: 'start', endAt, cfg: store.getSettings().timers[id] }));
    }
  }
  ws.on('close', () => overlayClients.delete(ws));
});

app.post('/api/admin/timer/:id/start', requireAdmin, (req, res) => {
  const id = req.params.id;
  const settings = store.getSettings();
  if (!settings.timers[id]) return res.status(400).json({ error: 'chronomètre invalide' });
  const endAt = Date.now() + settings.timers[id].durationSeconds * 1000;
  activeTimers[id] = endAt;
  broadcast({ type: 'timer', id, action: 'start', endAt, cfg: settings.timers[id] });
  res.json({ ok: true, endAt });
});

app.post('/api/admin/timer/:id/stop', requireAdmin, (req, res) => {
  const id = req.params.id;
  delete activeTimers[id];
  broadcast({ type: 'timer', id, action: 'stop' });
  res.json({ ok: true });
});

// --- API personnalisation ---
app.get('/api/species', (req, res) => {
  res.json(species.getSelectable().map((s) => ({ id: s.id, label: s.label, file: s.file })));
});

app.get('/api/avatar/:login', async (req, res) => {
  const login = req.params.login;
  const skin = getSkin(login);
  const follows = isChannelOwner(login) ? true : await checkAndCacheFollower(login);
  res.json({ ...skin, follows });
});

app.post('/api/avatar/:login', async (req, res) => {
  const login = req.params.login;
  if (isChannelOwner(login)) {
    return res.status(403).json({ error: 'Cet avatar est réservé, il ne peut pas être personnalisé.' });
  }

  const follows = await checkAndCacheFollower(login);
  if (!follows) {
    return res.status(403).json({ error: 'Tu dois suivre la chaîne sur Twitch pour personnaliser un avatar.' });
  }

  const { speciesId, hue } = req.body;
  const match = species.getById(speciesId);
  if (!match || match.reserved) return res.status(400).json({ error: 'species invalide' });

  const hueValue = Number.isFinite(hue) ? ((hue % 360) + 360) % 360 : 0;
  const skin = store.setAvatar(login, { species: speciesId, hue: hueValue });
  broadcast(buildState());
  res.json(skin);
});

// --- API réglages overlay ---
app.get('/api/settings', requireAdmin, (req, res) => {
  res.json(store.getSettings());
});

// Liste complète des avatars connus (tous les viewers ayant déjà personnalisé, + le streamer)
// utilisée pour les réactions "tout le monde apparaît" (ex: rebond de raid).
function buildCast() {
  // Un avatar par personnage disponible (pas seulement ceux déjà choisis par des viewers).
  const cast = species.getSelectable().map((s) => ({ login: `cast-${s.id}`, skin: { species: s.id, hue: 0 } }));
  cast.push({ login: CHANNEL, skin: getSkin(CHANNEL) });
  return cast;
}

// --- Test des alertes (déclenche une fausse notification, sans passer par Twitch) ---
const TEST_EVENTS = {
  follow: { type: 'channel.follow', event: { user_name: 'TestFollower', user_login: 'testfollower' } },
  subscribe: { type: 'channel.subscribe', event: { user_name: 'TestSub', user_login: 'testsub' } },
  cheer: { type: 'channel.cheer', event: { user_name: 'TestCheerer', user_login: 'testcheerer', bits: 100 } },
  raid: { type: 'channel.raid', event: { from_broadcaster_user_name: 'TestRaider', from_broadcaster_user_login: 'testraider', viewers: 25 } },
};

app.post('/api/admin/test-event/:type', requireAdmin, (req, res) => {
  const test = TEST_EVENTS[req.params.type];
  if (!test) return res.status(400).json({ error: 'type invalide' });
  broadcast({ type: 'event', eventType: test.type, event: test.event, cast: buildCast() });
  res.json({ ok: true });
});

// --- Test des avatars (fait apparaître un personnage sur l'overlay sans vrai viewer) ---
app.post('/api/admin/test-avatar/:speciesId', requireAdmin, (req, res) => {
  const match = species.getById(req.params.speciesId);
  if (!match) return res.status(400).json({ error: 'species invalide' });
  testAvatars.set(`test-${req.params.speciesId}`, { species: req.params.speciesId, hue: 0 });
  broadcast(buildState());
  res.json({ ok: true });
});

app.delete('/api/admin/test-avatar/:speciesId', requireAdmin, (req, res) => {
  testAvatars.delete(`test-${req.params.speciesId}`);
  broadcast(buildState());
  res.json({ ok: true });
});

app.delete('/api/admin/test-avatar', requireAdmin, (req, res) => {
  testAvatars.clear();
  broadcast(buildState());
  res.json({ ok: true });
});

const MOVEMENT_PATTERNS = ['random', 'horizontal', 'vertical', 'circular'];
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const EVENT_REACTIONS = ['none', 'pulse', 'jump', 'shake', 'spin', 'rain', 'bounce'];

function sanitizeEventConfig(input, fallback) {
  const clamp = (v, min, max, d) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
  return {
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : fallback.enabled,
    showText: typeof input?.showText === 'boolean' ? input.showText : fallback.showText,
    text: typeof input?.text === 'string' && input.text.trim() ? input.text.slice(0, 200) : fallback.text,
    color: HEX_COLOR.test(input?.color) ? input.color : fallback.color,
    fontSize: clamp(input?.fontSize, 8, 40, fallback.fontSize),
    reaction: EVENT_REACTIONS.includes(input?.reaction) ? input.reaction : fallback.reaction,
    position: {
      x: clamp(input?.position?.x, 0, 100, fallback.position.x),
      y: clamp(input?.position?.y, 0, 100, fallback.position.y),
    },
    // pas envoyé par le formulaire de réglages classique — géré à part par l'upload de son,
    // donc on garde la valeur existante tant qu'on ne reçoit pas explicitement une string ou null
    sound: (typeof input?.sound === 'string' || input?.sound === null) ? input.sound : fallback.sound,
  };
}

function sanitizeTimerConfig(input, fallback) {
  const clamp = (v, min, max, d) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
  return {
    label: typeof input?.label === 'string' && input.label.trim() ? input.label.slice(0, 100) : fallback.label,
    durationSeconds: clamp(input?.durationSeconds, 5, 7200, fallback.durationSeconds),
    color: HEX_COLOR.test(input?.color) ? input.color : fallback.color,
    fontSize: clamp(input?.fontSize, 12, 80, fallback.fontSize),
    position: {
      x: clamp(input?.position?.x, 0, 100, fallback.position.x),
      y: clamp(input?.position?.y, 0, 100, fallback.position.y),
    },
  };
}

app.post('/api/settings', requireAdmin, (req, res) => {
  const {
    avatarSize, zone, moveIntervalMs, moveVarianceMs, transitionSeconds,
    movementPattern, corridorPosition, mirrorOnDirection, inactivityMinutes, transitionEffect, nameTag, events, spriteFlip, ownerNameColor, ownerSize, timers,
  } = req.body;
  const clamp = (v, min, max, fallback) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);
  // Le fallback doit être les réglages actuellement enregistrés (pas les valeurs par défaut d'usine),
  // sinon un champ absent du payload (ex: "sound", géré à part par l'upload) se réinitialise à chaque sauvegarde.
  const d = store.getSettings();

  const settings = {
    avatarSize: clamp(avatarSize, 24, 200, d.avatarSize),
    zone: {
      top: clamp(zone?.top, 0, 45, d.zone.top),
      right: clamp(zone?.right, 0, 45, d.zone.right),
      bottom: clamp(zone?.bottom, 0, 45, d.zone.bottom),
      left: clamp(zone?.left, 0, 45, d.zone.left),
    },
    moveIntervalMs: clamp(moveIntervalMs, 500, 20000, d.moveIntervalMs),
    moveVarianceMs: clamp(moveVarianceMs, 0, 10000, d.moveVarianceMs),
    transitionSeconds: clamp(transitionSeconds, 0.5, 15, d.transitionSeconds),
    movementPattern: MOVEMENT_PATTERNS.includes(movementPattern) ? movementPattern : d.movementPattern,
    corridorPosition: clamp(corridorPosition, 0, 100, d.corridorPosition),
    mirrorOnDirection: typeof mirrorOnDirection === 'boolean' ? mirrorOnDirection : d.mirrorOnDirection,
    inactivityMinutes: clamp(inactivityMinutes, 1, 120, d.inactivityMinutes),
    transitionEffect: typeof transitionEffect === 'boolean' ? transitionEffect : d.transitionEffect,
    nameTag: {
      show: typeof nameTag?.show === 'boolean' ? nameTag.show : d.nameTag.show,
      fontSize: clamp(nameTag?.fontSize, 8, 32, d.nameTag.fontSize),
      color: HEX_COLOR.test(nameTag?.color) ? nameTag.color : d.nameTag.color,
    },
    events: {
      follow: sanitizeEventConfig(events?.follow, d.events.follow),
      subscribe: sanitizeEventConfig(events?.subscribe, d.events.subscribe),
      cheer: sanitizeEventConfig(events?.cheer, d.events.cheer),
      raid: sanitizeEventConfig(events?.raid, d.events.raid),
    },
    ownerNameColor: HEX_COLOR.test(ownerNameColor) ? ownerNameColor : d.ownerNameColor,
    ownerSize: clamp(ownerSize, 24, 200, d.ownerSize),
    spriteFlip: Object.fromEntries(
      Object.keys(d.spriteFlip).map((id) => [id, typeof spriteFlip?.[id] === 'boolean' ? spriteFlip[id] : d.spriteFlip[id]])
    ),
    timers: {
      intro: sanitizeTimerConfig(timers?.intro, d.timers.intro),
      pause: sanitizeTimerConfig(timers?.pause, d.timers.pause),
    },
  };

  store.setSettings(settings);
  broadcast({ type: 'settings', settings });
  res.json(settings);
});

// --- OAuth Twitch ---
let oauthState = null;

app.get('/auth', (req, res) => {
  oauthState = crypto.randomBytes(16).toString('hex');
  const url = twitchEvents.getAuthUrl({ clientId: CLIENT_ID, redirectUri: REDIRECT_URI, state: oauthState });
  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || state !== oauthState) return res.status(400).send('État OAuth invalide.');
  try {
    const tokens = await twitchEvents.exchangeCode({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, redirectUri: REDIRECT_URI, code });
    store.setTokens(tokens);
    res.send('Autorisation Twitch réussie. Redémarre le serveur pour activer les events (follow/sub/cheer/raid). Tu peux fermer cet onglet.');
    console.log('[auth] token obtenu et sauvegardé, redémarre le serveur pour activer EventSub.');
  } catch (err) {
    console.error('[auth] échec échange de code:', err.message);
    res.status(500).send("Échec de l'autorisation Twitch, voir les logs serveur.");
  }
});

async function startEventSub() {
  const tokens = store.getTokens();
  if (!tokens) {
    console.log(`[twitchEvents] pas encore autorisé — ouvre http://localhost:${PORT}/auth pour connecter les events follow/sub/cheer/raid.`);
    return;
  }
  try {
    const broadcasterId = await twitchEvents.getUserId({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, login: CHANNEL });
    await twitchEvents.connectEventSub({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      broadcasterId,
      onEvent: (type, event) => {
        console.log(`[twitchEvents] event reçu: ${type}`);
        broadcast({ type: 'event', eventType: type, event, cast: buildCast() });
      },
    });
  } catch (err) {
    console.error('[twitchEvents] échec démarrage EventSub:', err.message);
  }
}

server.listen(PORT, () => {
  console.log(`Serveur lancé sur http://localhost:${PORT}`);
  console.log(`Overlay OBS: http://localhost:${PORT}/overlay/`);
  console.log(`Page personnalisation: http://localhost:${PORT}/customize/`);
  console.log(`Réglages overlay: http://localhost:${PORT}/settings/`);
  chatTracker.connect().catch((err) => console.error('[twitchChat] échec connexion:', err.message));
  startEventSub();
});
