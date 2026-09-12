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

      const people = store.getPeople();
      broadcast({ type: 'activity', recent: getRecentActivity(), people });
      res.json({ ok: true, followers: followers.length, subs: subs.length });
    } catch (err) {
      logError('people-resync', err);
      res.status(500).json({ error: err.message || 'Échec de la synchronisation avec Twitch.' });
    }
  });

  return router;
}

module.exports = { createFollowListSyncRouter };
