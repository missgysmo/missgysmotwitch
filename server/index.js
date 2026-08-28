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
const { generateTitleIdeas } = require('./titleIdeas');
const { generateSocialPosts } = require('./socialPosts');

const PORT = process.env.PORT || 3000;
const CHANNEL = process.env.TWITCH_CHANNEL;
const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI || `http://localhost:${PORT}/auth/callback`;
const SETTINGS_PASSWORD = process.env.SETTINGS_PASSWORD;

// Au lieu de crasher le process sur une erreur inattendue, on la consigne avec l'heure exacte et on continue.
const DEBUG_LOG_PATH = path.join(store.DATA_DIR, 'debug.log');
function logError(label, err) {
  const line = `[${new Date().toISOString()}] ${label}: ${err?.stack || err}\n`;
  console.error(line);
  fs.appendFile(DEBUG_LOG_PATH, line, () => {});
}
process.on('uncaughtException', (err) => logError('uncaughtException', err));
process.on('unhandledRejection', (err) => logError('unhandledRejection', err));

if (!CHANNEL) {
  console.error('TWITCH_CHANNEL manquant dans .env');
  process.exit(1);
}
if (!SETTINGS_PASSWORD) {
  console.error('SETTINGS_PASSWORD manquant dans .env — nécessaire pour protéger /settings');
  process.exit(1);
}
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET manquant(s) dans .env — la vérification des followers et les alertes Twitch ne fonctionneront pas.');
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

// Comparaison en temps constant : évite qu'une différence de timing serve à deviner le mot de passe caractère par caractère.
function safePasswordEquals(candidate) {
  const a = Buffer.from(String(candidate ?? ''));
  const b = Buffer.from(SETTINGS_PASSWORD);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Railway insère plusieurs hops de proxy internes devant l'app (leur adresse change à chaque
// requête), donc req.ip d'Express (même avec trust proxy) ne reflète pas le vrai client — on lit
// directement le premier maillon de X-Forwarded-For, qui est toujours le client d'origine.
function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return req.socket.remoteAddress;
}

// Petit limiteur de débit en mémoire (par IP), sans dépendance externe.
// Nettoie lui-même ses entrées périodiques pour ne pas fuir de mémoire.
function createRateLimiter({ windowMs, max, message }) {
  const hits = new Map(); // ip -> [timestamps]
  setInterval(() => {
    const now = Date.now();
    for (const [ip, arr] of hits) {
      const kept = arr.filter((t) => now - t < windowMs);
      if (kept.length) hits.set(ip, kept);
      else hits.delete(ip);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    const ip = getClientIp(req);
    const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) {
      return res.status(429).json({ error: message || 'Trop de tentatives, réessaie plus tard.' });
    }
    arr.push(now);
    hits.set(ip, arr);
    next();
  };
}

const loginRateLimit = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 8, message: 'Trop de tentatives de connexion, réessaie dans quelques minutes.' });
const publicApiRateLimit = createRateLimiter({ windowMs: 60 * 1000, max: 30, message: 'Trop de requêtes, ralentis un peu.' });

const app = express();
// Nécessaire pour que req.secure reflète le vrai protocole (HTTPS) derrière le proxy Railway,
// sinon le cookie admin marqué "Secure" ne serait jamais envoyé par le navigateur en production.
app.set('trust proxy', 1);
app.use(express.json());

app.get(['/settings', '/settings/'], (req, res) => {
  const file = isAdmin(req) ? 'panel.html' : 'login.html';
  res.sendFile(path.join(__dirname, '..', 'public', 'settings', file));
});

app.post('/api/admin/login', loginRateLimit, (req, res) => {
  if (!safePasswordEquals(req.body?.password)) return res.status(401).json({ error: 'mot de passe incorrect' });
  res.cookie(ADMIN_COOKIE, ADMIN_TOKEN, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 30 * 24 * 60 * 60 * 1000 });
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
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('audio/')) return cb(new Error('Le fichier doit être un son (audio).'));
    cb(null, true);
  },
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

  // Extension prise sur le nom d'origine mais restreinte à une liste connue, pour ne jamais
  // écrire un nom de fichier inattendu à partir d'une valeur envoyée par le navigateur.
  const SAFE_SOUND_EXT = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.webm', '.aac', '.flac']);
  const rawExt = path.extname(req.file.originalname).toLowerCase();
  const ext = SAFE_SOUND_EXT.has(rawExt) ? rawExt : '.mp3';
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

// Envoie uniquement aux overlays ouverts en mode aperçu (/overlay/?preview=1) : sert aux boutons
// "Tester" du panel, pour que rien ne s'affiche jamais sur le stream principal pendant les essais.
function broadcastToPreview(message) {
  const data = JSON.stringify(message);
  for (const client of overlayClients) {
    if (client.isPreview && client.readyState === client.OPEN) client.send(data);
  }
}

// Avatars de test (admin uniquement) : pour prévisualiser un personnage sur l'overlay sans vrai viewer.
const testAvatars = new Map(); // login -> { species, hue }
const recentActivity = []; // { kind: 'follow'|'subscribe'|'cheer'|'raid', displayName, extra, ts } — remis à zéro à chaque redémarrage du serveur
const RECENT_ACTIVITY_MAX = 40;

// Mascotte "Tamagotchi" : humeur 0-100, gagnée par l'activité du chat/des events, perdue avec le temps qui passe.
let tamagotchiMood = store.getTamagotchiState().mood;
function boostTamagotchi(amount) {
  tamagotchiMood = Math.max(0, Math.min(100, tamagotchiMood + amount));
  store.setTamagotchiState({ mood: tamagotchiMood, updatedAt: Date.now() });
  broadcast({ type: 'tamagotchi', mood: tamagotchiMood });
}
setInterval(() => {
  boostTamagotchi(-store.getSettings().tamagotchi.decayPerMinute);
}, 60 * 1000);

// clé "action:login" -> dernier déclenchement, pour le cooldown des actions de chat par viewer
const tamagotchiActionCooldowns = new Map();
function broadcastTamagotchiReaction(reaction) {
  if (!reaction || reaction === 'none') return;
  broadcast({ type: 'tamagotchi-reaction', reaction });
}

// includeTest: les avatars de test (onglet "Test avatars") ne doivent jamais apparaître
// sur le stream réel — seulement dans l'aperçu sandbox (/overlay/?preview=1).
function buildState(includeTest = false) {
  const active = chatTracker.getActiveLogins().filter((login) => !isChannelOwner(login));
  const real = active.filter(isFollowerCached).map((login) => ({ login, skin: getSkin(login) }));
  const test = includeTest ? [...testAvatars.entries()].map(([login, skin]) => ({ login, skin })) : [];
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
const followerChecksInFlight = new Map(); // login (lowercase) -> Promise en cours, évite les doublons d'appels Twitch
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
// et relance une vérification en arrière-plan si absente ou périmée (une seule à la fois par pseudo,
// même si buildState() est appelé plusieurs fois avant que la première vérification ne réponde).
function isFollowerCached(login) {
  if (isChannelOwner(login)) return true;
  const key = login.toLowerCase();
  const cached = followerCache.get(key);
  if ((!cached || Date.now() - cached.checkedAt > FOLLOWER_TTL_MS) && !followerChecksInFlight.has(key)) {
    const promise = checkAndCacheFollower(login)
      .then((follows) => {
        const prev = cached?.follows;
        if (follows !== prev) broadcast(buildState());
      })
      .finally(() => followerChecksInFlight.delete(key));
    followerChecksInFlight.set(key, promise);
  }
  return cached ? cached.follows : false;
}

// Purge périodique des caches en mémoire indexés par pseudo, pour ne pas grossir indéfiniment
// sur une chaîne avec beaucoup de viewers différents au fil du temps.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of followerCache) {
    if (now - entry.checkedAt > FOLLOWER_TTL_MS * 6) followerCache.delete(key);
  }
  for (const [key, ts] of graffitiCooldowns) {
    if (now - ts > 60 * 60 * 1000) graffitiCooldowns.delete(key);
  }
  for (const [key, ts] of tamagotchiActionCooldowns) {
    if (now - ts > 60 * 60 * 1000) tamagotchiActionCooldowns.delete(key);
  }
}, 30 * 60 * 1000).unref();

function getSkin(login) {
  if (isChannelOwner(login)) return { species: 'mon-avatar', hue: 0 };
  return store.getAvatar(login) || defaultSkin(login);
}

function defaultSkin(login) {
  const selectable = species.getSelectable();
  const hash = [...login].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return { species: selectable[hash % selectable.length].id, hue: 0 };
}

const GRAFFITI_COLORS = {
  rouge: '#ff4757', red: '#ff4757',
  bleu: '#3742fa', blue: '#3742fa',
  vert: '#2ed573', green: '#2ed573',
  jaune: '#ffd633', yellow: '#ffd633',
  violet: '#9147ff', purple: '#9147ff',
  blanc: '#ffffff', white: '#ffffff',
  noir: '#17171d', black: '#17171d',
  orange: '#ff9f43',
  rose: '#ff6ec7', pink: '#ff6ec7',
  cyan: '#18dcff',
};

function resolveGraffitiColor(arg) {
  const named = GRAFFITI_COLORS[arg.toLowerCase()];
  if (named) return named;
  const hex = arg.startsWith('#') ? arg : `#${arg}`;
  return HEX_COLOR.test(hex) ? hex : null;
}

// login (lowercase) -> timestamp du dernier pixel/sticker placé
const graffitiCooldowns = new Map();

// Moniteur de santé du bot : statut chat/EventSub, pour l'onglet "Santé du bot" du dashboard
const botHealth = {
  startedAt: Date.now(),
  eventSubConnected: false,
};

const chatTracker = createChatTracker(CHANNEL, {
  onChange: () => broadcast(buildState()),
  getInactivityMs: () => store.getSettings().inactivityMinutes * 60 * 1000,
  onStatusChange: (connected) => {
    if (!connected) logError('twitchChat', new Error('Déconnecté du chat Twitch'));
  },
  onMessage: (login, message, meta) => {
    try {
      // bulle au-dessus de l'avatar : seuls les followers (ou le streamer) en ont un affiché
      const cached = followerCache.get(login);
      if (isChannelOwner(login) || cached?.follows) {
        broadcast({ type: 'chat', login, text: message.slice(0, 200) });
      }
      // affichage du chat sur l'overlay : tout le monde, indépendant du statut follower
      broadcast({
        type: 'chatlog',
        login,
        displayName: meta.displayName,
        color: meta.color,
        text: message.slice(0, 300),
        id: meta.id,
      });
      const t = store.getSettings().tamagotchi;
      boostTamagotchi(t.boostChat);
      // Actions mascotte déclenchables par les followers via une commande de chat (!caresse, !nourrir, !jouer...)
      const isFollower = isChannelOwner(login) || cached?.follows;
      if (isFollower) {
        const text = message.trim().toLowerCase();
        for (const [actionId, action] of Object.entries(t.chatActions)) {
          if (!action.enabled || text !== action.command) continue;
          const cooldownKey = `${actionId}:${login}`;
          const lastUse = tamagotchiActionCooldowns.get(cooldownKey) || 0;
          if (Date.now() - lastUse < action.cooldownSeconds * 1000) break;
          tamagotchiActionCooldowns.set(cooldownKey, Date.now());
          boostTamagotchi(action.boost);
          broadcastTamagotchiReaction(action.reaction);
          break;
        }
      }
    } catch (err) {
      logError('chatTracker.onMessage', err);
    }
  },
  onMessageDeleted: (id) => {
    broadcast({ type: 'chatlog-delete', id });
  },
  onClearChat: (login) => {
    broadcast({ type: 'chatlog-clear', login: login || null });
  },
});

// Chronomètres (intro / pause) : état éphémère en mémoire, pas persisté sur disque.
const activeTimers = {}; // id -> endAt (ms epoch)

wss.on('connection', (ws, req) => {
  ws.isPreview = new URL(req.url, 'http://internal').searchParams.get('preview') === '1';
  overlayClients.add(ws);
  ws.send(JSON.stringify({ type: 'settings', settings: store.getSettings() }));
  ws.send(JSON.stringify(buildState(ws.isPreview)));
  for (const [id, endAt] of Object.entries(activeTimers)) {
    if (endAt > Date.now()) {
      ws.send(JSON.stringify({ type: 'timer', id, action: 'start', endAt, cfg: store.getSettings().timers[id] }));
    }
  }
  ws.send(JSON.stringify({ type: 'canvas-init', ...store.getCanvas() }));
  ws.send(JSON.stringify({ type: 'activity', recent: recentActivity, people: store.getPeople() }));
  ws.send(JSON.stringify({ type: 'tamagotchi', mood: tamagotchiMood }));
  ws.on('close', () => overlayClients.delete(ws));
});

app.post('/api/admin/canvas/reset', requireAdmin, (req, res) => {
  const settings = store.getSettings();
  const canvas = store.resetCanvas(settings.graffiti.cols, settings.graffiti.rows);
  broadcast({ type: 'canvas-init', ...canvas });
  res.json({ ok: true });
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

app.get('/api/avatar/:login', publicApiRateLimit, async (req, res) => {
  const login = req.params.login;
  const skin = getSkin(login);
  const follows = isChannelOwner(login) ? true : await checkAndCacheFollower(login);
  res.json({ ...skin, follows });
});

app.post('/api/avatar/:login', publicApiRateLimit, async (req, res) => {
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

// --- API graffiti collectif (page /canvas/, réservée aux followers comme les avatars) ---
app.get('/api/canvas', (req, res) => {
  const settings = store.getSettings();
  const canvas = store.getCanvas();
  res.json({ ...canvas, cooldownSeconds: settings.graffiti.cooldownSeconds, enabled: settings.graffiti.enabled });
});

app.get('/api/follow-status/:login', publicApiRateLimit, async (req, res) => {
  const login = req.params.login;
  const follows = isChannelOwner(login) ? true : await checkAndCacheFollower(login);
  res.json({ follows });
});

app.post('/api/canvas/place', publicApiRateLimit, async (req, res) => {
  const settings = store.getSettings();
  if (!settings.graffiti.enabled) return res.status(403).json({ error: 'Le graffiti est désactivé pour le moment.' });

  const login = (req.body.login || '').toLowerCase().trim();
  if (!login) return res.status(400).json({ error: 'pseudo manquant' });

  const follows = isChannelOwner(login) ? true : await checkAndCacheFollower(login);
  if (!follows) return res.status(403).json({ error: 'Tu dois suivre la chaîne sur Twitch pour participer au graffiti.' });

  const now = Date.now();
  const last = graffitiCooldowns.get(login) || 0;
  const cooldownMs = settings.graffiti.cooldownSeconds * 1000;
  if (now - last < cooldownMs) {
    return res.status(429).json({ error: 'Doucement !', retryInMs: cooldownMs - (now - last) });
  }

  const { cols, rows } = settings.graffiti;
  const x = Number(req.body.x);
  const y = Number(req.body.y);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= cols || y < 0 || y >= rows) {
    return res.status(400).json({ error: 'coordonnées invalides' });
  }

  let cell;
  if (req.body.type === 'pixel') {
    const color = resolveGraffitiColor(String(req.body.color || ''));
    if (!color) return res.status(400).json({ error: 'couleur invalide' });
    cell = { type: 'pixel', color, login };
  } else if (req.body.type === 'sticker') {
    const match = species.getById(String(req.body.species || '').toLowerCase());
    if (!match || match.reserved) return res.status(400).json({ error: 'personnage invalide' });
    cell = { type: 'sticker', species: match.id, login };
  } else if (req.body.type === 'erase') {
    const existing = store.getCanvas().cells[`${x},${y}`];
    if (!existing) return res.status(400).json({ error: 'Cette case est déjà vide.' });
    if (existing.login !== login) return res.status(403).json({ error: 'Tu ne peux effacer que tes propres pixels.' });
    cell = null;
  } else {
    return res.status(400).json({ error: 'type invalide' });
  }

  store.setCanvasCell(x, y, cell);
  broadcast({ type: 'canvas-update', x, y, cell });
  graffitiCooldowns.set(login, now);
  res.json({ ok: true, cooldownMs });
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
  broadcastToPreview({ type: 'event', eventType: test.type, event: test.event, cast: buildCast() });
  res.json({ ok: true });
});

// --- Test des avatars (fait apparaître un personnage sur l'aperçu sandbox sans vrai viewer, jamais sur le stream réel) ---
app.post('/api/admin/test-avatar/:speciesId', requireAdmin, (req, res) => {
  const match = species.getById(req.params.speciesId);
  if (!match) return res.status(400).json({ error: 'species invalide' });
  testAvatars.set(`test-${req.params.speciesId}`, { species: req.params.speciesId, hue: 0 });
  broadcastToPreview(buildState(true));
  res.json({ ok: true });
});

app.delete('/api/admin/test-avatar/:speciesId', requireAdmin, (req, res) => {
  testAvatars.delete(`test-${req.params.speciesId}`);
  broadcastToPreview(buildState(true));
  res.json({ ok: true });
});

// Test de la fiche mémoire raid, sans appeler l'API Twitch (sandbox uniquement)
app.post('/api/admin/test-raid-card', requireAdmin, (req, res) => {
  broadcastToPreview({
    type: 'raid-card',
    login: 'testraider',
    displayName: 'TestRaider',
    avatar: '/overlay/sprites/cat.png',
    game: 'Just Chatting',
    title: 'Un stream de test bien sympa',
    viewers: 25,
  });
  res.json({ ok: true });
});

// Test d'une réaction de la mascotte, sandbox uniquement (n'affecte jamais le vrai stream ni son humeur)
app.post('/api/admin/test-tamagotchi-reaction/:reaction', requireAdmin, (req, res) => {
  const { reaction } = req.params;
  if (!TAMAGOTCHI_REACTIONS.includes(reaction) || reaction === 'none') {
    return res.status(400).json({ error: 'réaction invalide' });
  }
  broadcastToPreview({ type: 'tamagotchi-reaction', reaction });
  res.json({ ok: true });
});

app.post('/api/admin/title-ideas', requireAdmin, (req, res) => {
  const { game, keywords, mood } = req.body || {};
  if (typeof game !== 'string' || typeof keywords !== 'string' || game.length > 80 || keywords.length > 200) {
    return res.status(400).json({ error: 'entrée invalide' });
  }
  res.json(generateTitleIdeas({ game, keywords, mood }));
});

// --- Moniteur de santé du bot ---
app.get('/api/admin/health', requireAdmin, (req, res) => {
  let recentErrors = [];
  try {
    const raw = fs.readFileSync(DEBUG_LOG_PATH, 'utf8');
    recentErrors = raw.trim().split('\n').filter(Boolean).slice(-10).reverse();
  } catch {
    // pas encore d'erreurs consignées
  }
  const chatStatus = chatTracker.getStatus();
  res.json({
    chat: chatStatus,
    eventSub: { connected: botHealth.eventSubConnected },
    overlayClients: overlayClients.size,
    uptimeSeconds: Math.floor((Date.now() - botHealth.startedAt) / 1000),
    recentErrors,
  });
});

// --- Carnet de bord des réguliers : notes privées admin, jamais exposées côté overlay/viewer ---
app.get('/api/admin/viewer-notes', requireAdmin, (req, res) => {
  res.json(store.getViewerNotes());
});

app.post('/api/admin/viewer-notes/:login', requireAdmin, (req, res) => {
  const { note, tags } = req.body || {};
  if (typeof note !== 'string' || note.length > 2000) return res.status(400).json({ error: 'note invalide' });
  if (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string' || t.length > 30) || tags.length > 10) {
    return res.status(400).json({ error: 'tags invalides' });
  }
  const saved = store.setViewerNote(req.params.login, { note, tags });
  res.json(saved);
});

app.delete('/api/admin/viewer-notes/:login', requireAdmin, (req, res) => {
  store.deleteViewerNote(req.params.login);
  res.json({ ok: true });
});

app.get('/api/admin/thank-you-card/:login', requireAdmin, async (req, res) => {
  try {
    const profile = await twitchEvents.getUserProfile({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, login: req.params.login });
    res.json(profile);
  } catch (err) {
    logError('thank-you-card', err);
    res.status(404).json({ error: "Viewer introuvable sur Twitch" });
  }
});

app.post('/api/admin/social-posts', requireAdmin, (req, res) => {
  const { game, message, mood, moment } = req.body || {};
  if ([game, message, mood, moment].some((v) => v !== undefined && typeof v !== 'string')) {
    return res.status(400).json({ error: 'entrée invalide' });
  }
  if ((game || '').length > 80 || (message || '').length > 200) {
    return res.status(400).json({ error: 'entrée invalide' });
  }
  const { socialLinks, socialPlatforms } = store.getSettings();
  res.json(generateSocialPosts({ game, message, mood, moment, links: socialLinks, platforms: socialPlatforms }));
});

// --- Mascotte Tamagotchi : bouton "nourrir" manuel depuis le dashboard ---
app.post('/api/admin/tamagotchi/feed', requireAdmin, (req, res) => {
  boostTamagotchi(15);
  res.json({ ok: true, mood: tamagotchiMood });
});

app.delete('/api/admin/test-avatar', requireAdmin, (req, res) => {
  testAvatars.clear();
  broadcastToPreview(buildState(true));
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

function sanitizeGraffitiConfig(input, fallback) {
  const clamp = (v, min, max, d) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
  return {
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : fallback.enabled,
    cols: clamp(input?.cols, 10, 150, fallback.cols),
    rows: clamp(input?.rows, 10, 150, fallback.rows),
    cooldownSeconds: clamp(input?.cooldownSeconds, 1, 120, fallback.cooldownSeconds),
    position: {
      x: clamp(input?.position?.x, 0, 100, fallback.position.x),
      y: clamp(input?.position?.y, 0, 100, fallback.position.y),
      width: clamp(input?.position?.width, 5, 100, fallback.position.width),
      height: clamp(input?.position?.height, 5, 100, fallback.position.height),
    },
  };
}

function sanitizeChatOverlayConfig(input, fallback) {
  const clamp = (v, min, max, d) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
  return {
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : fallback.enabled,
    maxMessages: clamp(input?.maxMessages, 1, 30, fallback.maxMessages),
    fontSize: clamp(input?.fontSize, 8, 40, fallback.fontSize),
    textColor: HEX_COLOR.test(input?.textColor) ? input.textColor : fallback.textColor,
    colorMode: ['twitch', 'palette', 'off'].includes(input?.colorMode) ? input.colorMode : fallback.colorMode,
    style: ['list', 'bubbles'].includes(input?.style) ? input.style : fallback.style,
    rotation: clamp(input?.rotation, -45, 45, fallback.rotation),
    bgColor: HEX_COLOR.test(input?.bgColor) ? input.bgColor : fallback.bgColor,
    bgOpacity: clamp(input?.bgOpacity, 0, 100, fallback.bgOpacity),
    fadeSeconds: clamp(input?.fadeSeconds, 0, 86400, fallback.fadeSeconds),
    position: {
      x: clamp(input?.position?.x, 0, 100, fallback.position.x),
      y: clamp(input?.position?.y, 0, 100, fallback.position.y),
      width: clamp(input?.position?.width, 5, 100, fallback.position.width),
      height: clamp(input?.position?.height, 5, 100, fallback.position.height),
    },
  };
}

function sanitizeActivityFeedConfig(input, fallback) {
  const clamp = (v, min, max, d) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
  return {
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : fallback.enabled,
    fontSize: clamp(input?.fontSize, 8, 40, fallback.fontSize),
    textColor: HEX_COLOR.test(input?.textColor) ? input.textColor : fallback.textColor,
    bgColor: HEX_COLOR.test(input?.bgColor) ? input.bgColor : fallback.bgColor,
    bgOpacity: clamp(input?.bgOpacity, 0, 100, fallback.bgOpacity),
    speedSeconds: clamp(input?.speedSeconds, 3, 120, fallback.speedSeconds),
    position: {
      x: clamp(input?.position?.x, 0, 100, fallback.position.x),
      y: clamp(input?.position?.y, 0, 100, fallback.position.y),
      width: clamp(input?.position?.width, 5, 100, fallback.position.width),
      height: clamp(input?.position?.height, 2, 100, fallback.position.height),
    },
  };
}

function sanitizeFollowListConfig(input, fallback) {
  const clamp = (v, min, max, d) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
  return {
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : fallback.enabled,
    mode: ['followers', 'subs', 'both'].includes(input?.mode) ? input.mode : fallback.mode,
    fontSize: clamp(input?.fontSize, 8, 40, fallback.fontSize),
    textColor: HEX_COLOR.test(input?.textColor) ? input.textColor : fallback.textColor,
    bgColor: HEX_COLOR.test(input?.bgColor) ? input.bgColor : fallback.bgColor,
    bgOpacity: clamp(input?.bgOpacity, 0, 100, fallback.bgOpacity),
    speedSeconds: clamp(input?.speedSeconds, 3, 300, fallback.speedSeconds),
    position: {
      x: clamp(input?.position?.x, 0, 100, fallback.position.x),
      y: clamp(input?.position?.y, 0, 100, fallback.position.y),
      width: clamp(input?.position?.width, 5, 100, fallback.position.width),
      height: clamp(input?.position?.height, 5, 100, fallback.position.height),
    },
  };
}

const URL_LIKE = /^$|^[^\s<>"]{1,200}$/;

function sanitizeSocialLinks(input, fallback) {
  const out = {};
  for (const key of Object.keys(fallback)) {
    const v = input?.[key];
    out[key] = typeof v === 'string' && URL_LIKE.test(v) ? v : fallback[key];
  }
  return out;
}

function sanitizeSocialPlatforms(input, fallback) {
  const out = {};
  for (const key of Object.keys(fallback)) {
    out[key] = typeof input?.[key] === 'boolean' ? input[key] : fallback[key];
  }
  return out;
}

function sanitizeRaidCardConfig(input, fallback) {
  const clamp = (v, min, max, d) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
  return {
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : fallback.enabled,
    durationSeconds: clamp(input?.durationSeconds, 3, 60, fallback.durationSeconds),
    fontSize: clamp(input?.fontSize, 8, 40, fallback.fontSize),
    textColor: HEX_COLOR.test(input?.textColor) ? input.textColor : fallback.textColor,
    bgColor: HEX_COLOR.test(input?.bgColor) ? input.bgColor : fallback.bgColor,
    bgOpacity: clamp(input?.bgOpacity, 0, 100, fallback.bgOpacity),
    position: {
      x: clamp(input?.position?.x, 0, 100, fallback.position.x),
      y: clamp(input?.position?.y, 0, 100, fallback.position.y),
    },
  };
}

const TAMAGOTCHI_REACTIONS = ['none', 'pulse', 'jump', 'shake', 'spin', 'bounce', 'awaken'];

function sanitizeTamagotchiChatAction(input, fallback) {
  return {
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : fallback.enabled,
    command: typeof input?.command === 'string' && /^!\S{1,20}$/.test(input.command.trim()) ? input.command.trim().toLowerCase() : fallback.command,
    boost: Number.isFinite(input?.boost) ? Math.min(100, Math.max(0, input.boost)) : fallback.boost,
    cooldownSeconds: Number.isFinite(input?.cooldownSeconds) ? Math.min(600, Math.max(0, input.cooldownSeconds)) : fallback.cooldownSeconds,
    reaction: TAMAGOTCHI_REACTIONS.includes(input?.reaction) ? input.reaction : fallback.reaction,
  };
}

function sanitizeTamagotchiConfig(input, fallback) {
  const clamp = (v, min, max, d) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
  return {
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : fallback.enabled,
    species: input?.species === 'mascot' || species.getById(input?.species) ? input.species : fallback.species,
    size: clamp(input?.size, 24, 300, fallback.size),
    showBar: typeof input?.showBar === 'boolean' ? input.showBar : fallback.showBar,
    decayPerMinute: clamp(input?.decayPerMinute, 0, 20, fallback.decayPerMinute),
    boostChat: clamp(input?.boostChat, 0, 20, fallback.boostChat),
    boostFollow: clamp(input?.boostFollow, 0, 100, fallback.boostFollow),
    boostSub: clamp(input?.boostSub, 0, 100, fallback.boostSub),
    boostCheer: clamp(input?.boostCheer, 0, 100, fallback.boostCheer),
    boostRaid: clamp(input?.boostRaid, 0, 100, fallback.boostRaid),
    position: {
      x: clamp(input?.position?.x, 0, 100, fallback.position.x),
      y: clamp(input?.position?.y, 0, 100, fallback.position.y),
    },
    eventReactions: {
      follow: TAMAGOTCHI_REACTIONS.includes(input?.eventReactions?.follow) ? input.eventReactions.follow : fallback.eventReactions.follow,
      subscribe: TAMAGOTCHI_REACTIONS.includes(input?.eventReactions?.subscribe) ? input.eventReactions.subscribe : fallback.eventReactions.subscribe,
      cheer: TAMAGOTCHI_REACTIONS.includes(input?.eventReactions?.cheer) ? input.eventReactions.cheer : fallback.eventReactions.cheer,
      raid: TAMAGOTCHI_REACTIONS.includes(input?.eventReactions?.raid) ? input.eventReactions.raid : fallback.eventReactions.raid,
    },
    chatActions: dedupeTamagotchiCommands({
      pet: sanitizeTamagotchiChatAction(input?.chatActions?.pet, fallback.chatActions.pet),
      feed: sanitizeTamagotchiChatAction(input?.chatActions?.feed, fallback.chatActions.feed),
      play: sanitizeTamagotchiChatAction(input?.chatActions?.play, fallback.chatActions.play),
    }),
  };
}

// Si deux actions activées partagent la même commande de chat, seule la première (dans cet ordre)
// resterait déclenchable — on désactive silencieusement les suivantes plutôt que de laisser
// une action configurée mais qui ne se déclenchera jamais sans que personne ne le sache.
function dedupeTamagotchiCommands(actions) {
  const seen = new Set();
  for (const id of ['pet', 'feed', 'play']) {
    const action = actions[id];
    if (!action.enabled) continue;
    if (seen.has(action.command)) action.enabled = false;
    else seen.add(action.command);
  }
  return actions;
}

app.post('/api/settings', requireAdmin, (req, res) => {
  const {
    avatarSize, zone, moveIntervalMs, moveVarianceMs, transitionSeconds,
    movementPattern, corridorPosition, mirrorOnDirection, inactivityMinutes, transitionEffect, nameTag, events, spriteFlip, ownerNameColor, ownerSize, timers, graffiti, chatOverlay, activityFeed, followList, tamagotchi, raidCard, socialLinks, socialPlatforms,
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
    graffiti: sanitizeGraffitiConfig(graffiti, d.graffiti),
    chatOverlay: sanitizeChatOverlayConfig(chatOverlay, d.chatOverlay),
    activityFeed: sanitizeActivityFeedConfig(activityFeed, d.activityFeed),
    followList: sanitizeFollowListConfig(followList, d.followList),
    tamagotchi: sanitizeTamagotchiConfig(tamagotchi, d.tamagotchi),
    raidCard: sanitizeRaidCardConfig(raidCard, d.raidCard),
    socialLinks: sanitizeSocialLinks(socialLinks, d.socialLinks),
    socialPlatforms: sanitizeSocialPlatforms(socialPlatforms, d.socialPlatforms),
  };

  store.setSettings(settings);
  broadcast({ type: 'settings', settings });

  // les coordonnées existantes ne veulent plus rien dire si la grille change de taille
  if (settings.graffiti.cols !== d.graffiti.cols || settings.graffiti.rows !== d.graffiti.rows) {
    const canvas = store.resetCanvas(settings.graffiti.cols, settings.graffiti.rows);
    broadcast({ type: 'canvas-init', ...canvas });
  }

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

// Alimente le fil "activité récente" (session en cours) + la liste persistante des followers/subs, puis diffuse aux overlays.
function recordActivity(type, event) {
  let kind, displayName, login, extra = null;
  if (type === 'channel.follow') {
    kind = 'follow';
    displayName = event.user_name;
    login = event.user_login;
    store.addPerson('followers', login, displayName);
  } else if (type === 'channel.subscribe') {
    kind = 'subscribe';
    displayName = event.user_name;
    login = event.user_login;
    store.addPerson('subs', login, displayName);
  } else if (type === 'channel.cheer') {
    kind = 'cheer';
    displayName = event.user_name;
    login = event.user_login;
    extra = event.bits;
  } else if (type === 'channel.raid') {
    kind = 'raid';
    displayName = event.from_broadcaster_user_name;
    login = event.from_broadcaster_user_login;
    extra = event.viewers;
  } else {
    return;
  }
  recentActivity.unshift({ kind, displayName, login, extra, ts: Date.now() });
  if (recentActivity.length > RECENT_ACTIVITY_MAX) recentActivity.length = RECENT_ACTIVITY_MAX;
  broadcast({ type: 'activity', recent: recentActivity, people: store.getPeople() });

  const t = store.getSettings().tamagotchi;
  const boostByKind = { follow: t.boostFollow, subscribe: t.boostSub, cheer: t.boostCheer, raid: t.boostRaid };
  boostTamagotchi(boostByKind[kind] || 0);
  broadcastTamagotchiReaction(t.eventReactions[kind]);

  if (kind === 'raid' && login) {
    twitchEvents.getChannelInfo({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, login })
      .then((info) => broadcast({ type: 'raid-card', ...info, viewers: extra }))
      .catch((err) => logError('raid-card', err));
  }
}

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
        recordActivity(type, event);
      },
      onStatusChange: (connected) => {
        botHealth.eventSubConnected = connected;
        if (!connected) logError('twitchEvents', new Error('Déconnecté d\'EventSub'));
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
