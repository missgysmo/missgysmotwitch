require('dotenv').config();
const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const path = require('path');

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

app.use(express.static(path.join(__dirname, '..', 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const overlayClients = new Set();

function broadcast(message) {
  const data = JSON.stringify(message);
  for (const client of overlayClients) {
    if (client.readyState === client.OPEN) client.send(data);
  }
}

function buildState() {
  const active = chatTracker.getActiveLogins();
  return {
    type: 'state',
    viewers: active.filter(isFollowerCached).map((login) => ({ login, skin: getSkin(login) })),
  };
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
  const tokens = store.getTokens();
  if (!tokens) return null;
  broadcasterId = await twitchEvents.getUserId({ clientId: CLIENT_ID, accessToken: tokens.access_token, login: CHANNEL });
  return broadcasterId;
}

async function checkAndCacheFollower(login) {
  if (isChannelOwner(login)) return true;
  const key = login.toLowerCase();
  try {
    const tokens = store.getTokens();
    const bId = await ensureBroadcasterId();
    if (!tokens || !bId) throw new Error('app pas encore autorisée via /auth');
    const userId = await twitchEvents.getUserId({ clientId: CLIENT_ID, accessToken: tokens.access_token, login });
    const follows = await twitchEvents.checkFollower({ clientId: CLIENT_ID, accessToken: tokens.access_token, broadcasterId: bId, userId });
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
});

wss.on('connection', (ws) => {
  overlayClients.add(ws);
  ws.send(JSON.stringify({ type: 'settings', settings: store.getSettings() }));
  ws.send(JSON.stringify(buildState()));
  ws.on('close', () => overlayClients.delete(ws));
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

const MOVEMENT_PATTERNS = ['random', 'horizontal', 'vertical', 'circular'];
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function sanitizeEventConfig(input, fallback) {
  const clamp = (v, min, max, d) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
  return {
    text: typeof input?.text === 'string' && input.text.trim() ? input.text.slice(0, 200) : fallback.text,
    color: HEX_COLOR.test(input?.color) ? input.color : fallback.color,
    fontSize: clamp(input?.fontSize, 8, 40, fallback.fontSize),
  };
}

app.post('/api/settings', requireAdmin, (req, res) => {
  const {
    avatarSize, zone, moveIntervalMs, moveVarianceMs, transitionSeconds,
    movementPattern, corridorPosition, mirrorOnDirection, inactivityMinutes, transitionEffect, nameTag, events,
  } = req.body;
  const clamp = (v, min, max, fallback) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);
  const d = store.DEFAULT_SETTINGS;

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
    const broadcasterId = await twitchEvents.getUserId({ clientId: CLIENT_ID, accessToken: tokens.access_token, login: CHANNEL });
    await twitchEvents.connectEventSub({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      broadcasterId,
      onEvent: (type, event) => {
        console.log(`[twitchEvents] event reçu: ${type}`);
        broadcast({ type: 'event', eventType: type, event });
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
