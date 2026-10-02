require('dotenv').config();
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const store = require('./store');
const { createSpeciesCatalog } = require('./speciesCatalog');
const { createChatTracker } = require('./twitchChat');

const logger = require('./lib/logger');
const auth = require('./lib/auth');
const { overlayClients, broadcast, broadcastToPreview } = require('./lib/broadcast');
const { createFollowerService } = require('./followerService');
const { createTamagotchiService } = require('./tamagotchiService');
const { createCustomCommandsService } = require('./customCommandsService');

const { createAdminAuthRouter } = require('./routes/adminAuth');
const { createSettingsRouter } = require('./routes/settingsRoute');
const { createSoundsRouter } = require('./routes/sounds');
const { createAvatarsRouter } = require('./routes/avatars');
const { createCanvasRouter } = require('./routes/canvas');
const { createTimersRouter } = require('./routes/timers');
const { createSocialRouter } = require('./routes/social');
const { createViewerNotesRouter } = require('./routes/viewerNotes');
const { createHealthRouter } = require('./routes/health');
const { createTestSandboxRouter } = require('./routes/testSandbox');
const { createSpotifyRouter } = require('./routes/spotify');
const { createTwitchAuthRouter } = require('./routes/twitchAuth');
const { createFollowListSyncRouter } = require('./routes/followListSync');
const { createCustomCommandsRouter } = require('./routes/customCommands');
const { createSpeciesAdminRouter } = require('./routes/speciesAdmin');

const twitchEvents = require('./twitchEvents');

// --- Configuration ---
const PORT = process.env.PORT || 3000;
const CHANNEL = process.env.TWITCH_CHANNEL;
const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI || `http://localhost:${PORT}/auth/callback`;
const SETTINGS_PASSWORD = process.env.SETTINGS_PASSWORD;
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || `http://localhost:${PORT}/auth/spotify/callback`;

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

const ADMIN_TOKEN = auth.deriveAdminToken(SETTINGS_PASSWORD);
const requireAdmin = auth.makeRequireAdmin(ADMIN_TOKEN);
const safePasswordEquals = auth.makeSafePasswordEquals(SETTINGS_PASSWORD);
const loginRateLimit = auth.createRateLimiter({ windowMs: 10 * 60 * 1000, max: 8, message: 'Trop de tentatives de connexion, réessaie dans quelques minutes.' });
const publicApiRateLimit = auth.createRateLimiter({ windowMs: 60 * 1000, max: 30, message: 'Trop de requêtes, ralentis un peu.' });

// --- Services partagés (état + logique métier, indépendants des routes qui les utilisent) ---
const botHealth = { startedAt: Date.now(), eventSubConnected: false };

const chatTracker = createChatTracker(CHANNEL, {
  onChange: () => broadcast(follower.buildState()),
  getInactivityMs: () => store.getSettings().inactivityMinutes * 60 * 1000,
  onStatusChange: (connected) => {
    if (!connected) logger.logError('twitchChat', new Error('Déconnecté du chat Twitch'));
  },
  onMessage: (login, message, meta) => {
    try {
      const isFollower = follower.isFollowerRightNow(login);
      // bulle au-dessus de l'avatar : seuls les followers (ou le streamer) en ont un affiché
      if (isFollower) {
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

      // Ping sonore pour prévenir le streamer d'un nouveau message (joué côté overlay/OBS)
      const cs = store.getSettings().chatSound;
      if (cs.enabled && cs.sound) {
        const now = Date.now();
        if (now - lastChatSoundAt >= cs.cooldownSeconds * 1000) {
          lastChatSoundAt = now;
          broadcast({ type: 'chat-sound', sound: cs.sound });
        }
      }

      tamagotchi.handleChatMessage(login, message, isFollower);
      customCommands.handleChatMessage(login, message, isFollower);
    } catch (err) {
      logger.logError('chatTracker.onMessage', err);
    }
  },
  onMessageDeleted: (id) => broadcast({ type: 'chatlog-delete', id }),
  onClearChat: (login) => broadcast({ type: 'chatlog-clear', login: login || null }),
});
let lastChatSoundAt = 0;

const speciesCatalog = createSpeciesCatalog({ store });

const follower = createFollowerService({
  store,
  species: speciesCatalog,
  twitchEvents,
  CHANNEL,
  CLIENT_ID,
  CLIENT_SECRET,
  broadcast,
  getActiveLogins: () => chatTracker.getActiveLogins(),
  getTestAvatars: () => testSandbox.getTestAvatars(),
});
const tamagotchi = createTamagotchiService({ store, broadcast });
const customCommands = createCustomCommandsService({ store, broadcast, isChannelOwner: (login) => follower.isChannelOwner(login) });

// --- Express app ---
const app = express();
// Nécessaire pour que req.secure reflète le vrai protocole (HTTPS) derrière le proxy Railway,
// sinon le cookie admin marqué "Secure" ne serait jamais envoyé par le navigateur en production.
app.set('trust proxy', 1);
app.use(express.json());

app.use(createAdminAuthRouter({
  isAdmin: (req) => auth.isAdmin(req, ADMIN_TOKEN),
  safePasswordEquals,
  ADMIN_TOKEN,
  ADMIN_COOKIE: auth.ADMIN_COOKIE,
  loginRateLimit,
}));

// no-cache : évite qu'OBS/le navigateur affiche une version périmée d'overlay.js après un déploiement
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
}));

// --- Sons des alertes (upload par l'admin, stockés sur le volume persistant) ---
const SOUNDS_DIR = path.join(store.DATA_DIR, 'sounds');
fs.mkdirSync(SOUNDS_DIR, { recursive: true });
app.use('/sounds', express.static(SOUNDS_DIR, { maxAge: '1y' }));
app.use(createSoundsRouter({ store, requireAdmin, broadcast, soundsDir: SOUNDS_DIR }));

// --- Médias des commandes de chat personnalisées (sons et vidéos, upload par l'admin) ---
const MEDIA_DIR = path.join(store.DATA_DIR, 'media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });
app.use('/media', express.static(MEDIA_DIR, { maxAge: '1y' }));
app.use(createCustomCommandsRouter({ store, requireAdmin, broadcast, broadcastToPreview, mediaDir: MEDIA_DIR }));

// --- Sprites des avatars personnalisés (upload par l'admin, en plus du catalogue codé en dur) ---
const AVATAR_SPRITES_DIR = path.join(store.DATA_DIR, 'avatar-sprites');
fs.mkdirSync(AVATAR_SPRITES_DIR, { recursive: true });
app.use('/avatar-sprites', express.static(AVATAR_SPRITES_DIR, { maxAge: '1y' }));
app.use(createSpeciesAdminRouter({ store, requireAdmin, speciesCatalog, spritesDir: AVATAR_SPRITES_DIR }));

app.use(createSettingsRouter({ store, requireAdmin, broadcast }));
app.use(createAvatarsRouter({ store, publicApiRateLimit, broadcast, follower, speciesCatalog }));
app.use(createCanvasRouter({ store, requireAdmin, publicApiRateLimit, broadcast, follower, speciesCatalog }));

const { router: timersRouter, activeTimers } = createTimersRouter({ store, requireAdmin, broadcast });
app.use(timersRouter);

app.use(createSocialRouter({ store, requireAdmin }));
app.use(createViewerNotesRouter({ store, requireAdmin, twitchEvents, CLIENT_ID, CLIENT_SECRET, logError: logger.logError }));
app.use(createHealthRouter({ requireAdmin, chatTracker, botHealth, overlayClients, logger }));

const { router: testSandboxRouter, getTestAvatars } = createTestSandboxRouter({
  requireAdmin, broadcast, broadcastToPreview, follower, tamagotchi, store, speciesCatalog,
});
const testSandbox = { getTestAvatars };
app.use(testSandboxRouter);

const { router: spotifyRouter, startPolling: startSpotifyPolling, getLastTrack: getLastNowPlayingTrack } = createSpotifyRouter({
  store, requireAdmin, broadcast, logError: logger.logError,
  clientId: SPOTIFY_CLIENT_ID, clientSecret: SPOTIFY_CLIENT_SECRET, redirectUri: SPOTIFY_REDIRECT_URI,
});
app.use(spotifyRouter);

const { router: twitchAuthRouter, startEventSub, getRecentActivity } = createTwitchAuthRouter({
  store, broadcast, follower, tamagotchi, botHealth, logError: logger.logError,
  CHANNEL, CLIENT_ID, CLIENT_SECRET, REDIRECT_URI,
});
app.use(twitchAuthRouter);

app.use(createFollowListSyncRouter({
  store, requireAdmin, broadcast, follower, getRecentActivity, logError: logger.logError, CLIENT_ID, CLIENT_SECRET,
}));

// --- WebSocket ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  ws.isPreview = new URL(req.url, 'http://internal').searchParams.get('preview') === '1';
  overlayClients.add(ws);
  ws.send(JSON.stringify({ type: 'settings', settings: store.getSettings() }));
  ws.send(JSON.stringify(follower.buildState(ws.isPreview)));
  for (const [id, endAt] of Object.entries(activeTimers)) {
    if (endAt > Date.now()) {
      ws.send(JSON.stringify({ type: 'timer', id, action: 'start', endAt, cfg: store.getSettings().timers[id] }));
    }
  }
  ws.send(JSON.stringify({ type: 'canvas-init', ...store.getCanvas() }));
  ws.send(JSON.stringify({ type: 'activity', recent: getRecentActivity(), people: store.getPeople() }));
  ws.send(JSON.stringify({ type: 'last-events', data: store.getLastEvents() }));
  ws.send(JSON.stringify({ type: 'tamagotchi', mood: tamagotchi.getMood() }));
  ws.send(JSON.stringify({ type: 'now-playing', track: getLastNowPlayingTrack() }));
  ws.on('close', () => overlayClients.delete(ws));
});

server.listen(PORT, () => {
  console.log(`Serveur lancé sur http://localhost:${PORT}`);
  console.log(`Overlay OBS: http://localhost:${PORT}/overlay/`);
  console.log(`Page personnalisation: http://localhost:${PORT}/customize/`);
  console.log(`Réglages overlay: http://localhost:${PORT}/settings/`);
  chatTracker.connect().catch((err) => console.error('[twitchChat] échec connexion:', err.message));
  startEventSub();
  startSpotifyPolling();
});
