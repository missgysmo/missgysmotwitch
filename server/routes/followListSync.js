const express = require('express');
const twitchEvents = require('../twitchEvents');

// Reconstitue la liste followers/subs à partir de l'API Twitch (elle ne se remplit sinon
// qu'au fil des nouveaux follows/subs à venir, en partant d'une liste vide).
function createFollowListSyncRouter({ store, requireAdmin, broadcast, follower, getRecentActivity, logError, CLIENT_ID, CLIENT_SECRET }) {
  const router = express.Router();

  router.post('/api/admin/people/resync', requireAdmin, async (req, res) => {
    try {
      const bId = await follower.ensureBroadcasterId();
      if (!store.getTokens() || !bId) throw new Error('app pas encore autorisée via /auth');

      const [followers, subs] = await Promise.all([
        twitchEvents.getAllFollowers({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, broadcasterId: bId }),
        twitchEvents.getAllSubscribers({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, broadcasterId: bId }),
      ]);
      for (const f of followers) store.addPerson('followers', f.login, f.displayName, f.since);
      for (const s of subs) store.addPerson('subs', s.login, s.displayName, s.since);

      // Rétro-remplit "Dernier follow" avec le vrai plus récent trouvé — possible seulement pour les
      // follows (Twitch fournit followed_at). Impossible pour les subs : l'API Helix ne renvoie
      // aucune date d'abonnement, donc "dernier sub" ne peut démarrer qu'au prochain sub réel.
      if (followers.length) {
        const latest = followers.reduce((a, b) => (b.since > a.since ? b : a));
        store.setLastEvent('follow', { eventType: 'channel.follow', event: { user_name: latest.displayName, user_login: latest.login }, ts: latest.since }, true);
      }

      const people = store.getPeople();
      broadcast({ type: 'activity', recent: getRecentActivity(), people });
      broadcast({ type: 'last-events', data: store.getLastEvents() });
      res.json({ ok: true, followers: followers.length, subs: subs.length });
    } catch (err) {
      logError('people-resync', err);
      res.status(500).json({ error: err.message || 'Échec de la synchronisation avec Twitch.' });
    }
  });

  return router;
}

module.exports = { createFollowListSyncRouter };
