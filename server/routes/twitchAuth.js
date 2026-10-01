const express = require('express');
const crypto = require('crypto');
const twitchEvents = require('../twitchEvents');

const RECENT_ACTIVITY_MAX = 40;

// OAuth Twitch, démarrage d'EventSub, et le fil d'activité (follow/sub/cheer/raid) qui en découle.
// startEventSub() réutilise follower.ensureBroadcasterId() au lieu de refaire son propre lookup —
// avant cette extraction, une variable locale masquait par erreur le cache partagé du broadcasterId,
// causant un appel Twitch redondant à chaque tout premier check de follower après le démarrage.
function createTwitchAuthRouter({ store, broadcast, follower, tamagotchi, botHealth, logError, CHANNEL, CLIENT_ID, CLIENT_SECRET, REDIRECT_URI }) {
  const router = express.Router();
  const recentActivity = []; // { kind, displayName, login, extra, ts } — remis à zéro à chaque redémarrage

  let oauthState = null;

  router.get('/auth', (req, res) => {
    oauthState = crypto.randomBytes(16).toString('hex');
    const url = twitchEvents.getAuthUrl({ clientId: CLIENT_ID, redirectUri: REDIRECT_URI, state: oauthState });
    res.redirect(url);
  });

  router.get('/auth/callback', async (req, res) => {
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

  // Alimente le fil "activité récente" (session en cours) + la liste persistante des followers/subs,
  // boost/réaction de la mascotte, et fiche mémoire pour les raids — puis diffuse aux overlays.
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

    // Persisté sur disque (contrairement à recentActivity ci-dessus) pour que l'affichage
    // permanent "Dernier follow/sub/bits/raid" survive aux redémarrages du serveur.
    store.setLastEvent(kind, { eventType: type, event });

    tamagotchi.handleTwitchEvent(kind);

    if (kind === 'raid' && login) {
      twitchEvents.getChannelInfo({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, login })
        .then((info) => broadcast({ type: 'raid-card', ...info, viewers: extra }))
        .catch((err) => logError('raid-card', err));
    }
  }

  async function startEventSub() {
    const tokens = store.getTokens();
    if (!tokens) {
      console.log('[twitchEvents] pas encore autorisé — ouvre /auth pour connecter les events follow/sub/cheer/raid.');
      return;
    }
    try {
      const broadcasterId = await follower.ensureBroadcasterId();
      await twitchEvents.connectEventSub({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        broadcasterId,
        onEvent: (type, event) => {
          console.log(`[twitchEvents] event reçu: ${type}`);
          broadcast({ type: 'event', eventType: type, event, cast: follower.buildCast() });
          recordActivity(type, event);
        },
        onStatusChange: (connected) => {
          botHealth.eventSubConnected = connected;
          if (!connected) logError('twitchEvents', new Error("Déconnecté d'EventSub"));
        },
      });
    } catch (err) {
      console.error('[twitchEvents] échec démarrage EventSub:', err.message);
    }
  }

  return { router, startEventSub, getRecentActivity: () => recentActivity };
}

module.exports = { createTwitchAuthRouter };
