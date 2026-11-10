// Détecte les unfollows Twitch en comparant périodiquement la liste complète des followers à
// celle déjà connue — Twitch ne fournit aucun événement officiel "channel.unfollow" (EventSub
// n'a que channel.follow), donc c'est la seule méthode possible.
const POLL_MS = 3 * 60 * 1000;

function createUnfollowService({ store, twitchEvents, follower, CLIENT_ID, CLIENT_SECRET, broadcast, getRecentActivity, logError }) {
  async function poll() {
    try {
      if (!store.getTokens()) return; // app pas encore autorisée via /auth
      const bId = await follower.ensureBroadcasterId();
      if (!bId) return;

      const current = await twitchEvents.getAllFollowers({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, broadcasterId: bId });
      const currentLogins = new Set(current.map((f) => f.login));

      const known = store.getPeople().followers || [];

      if (!known.length) {
        // Rien de connu encore (jamais resynchronisé) : pas de référence fiable pour comparer —
        // on attend que /api/admin/people/resync ait tourné au moins une fois.
        return;
      }

      const partis = known.filter((p) => !currentLogins.has(p.login));
      if (!partis.length) return;

      for (const p of partis) {
        store.removePerson('followers', p.login);
        store.addUnfollow({ login: p.login, displayName: p.displayName, detectedAt: Date.now() });
      }
      broadcast({ type: 'activity', recent: getRecentActivity(), people: store.getPeople() });
      broadcast({ type: 'unfollows', list: store.getUnfollows() });
    } catch (err) {
      logError('unfollow-poll', err);
    }
  }

  function start() {
    setInterval(poll, POLL_MS).unref();
  }

  return { start };
}

module.exports = { createUnfollowService };
