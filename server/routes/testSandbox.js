const express = require('express');
const species = require('../species');
const { TAMAGOTCHI_REACTIONS } = require('../lib/sanitizeSettings');

// Tout ce qui sert aux boutons "Tester" du dashboard. testAvatars est créé ici et exposé (via
// getTestAvatars) car buildState() du followerService en a besoin pour lister les avatars de test.
// Exception : test-event (follow/sub/cheer/raid + "Derniers événements") diffuse sur le vrai stream
// (broadcast), pas seulement vers l'aperçu sandbox — demandé explicitement pour pouvoir vérifier le
// rendu directement dans OBS. Donc visible des viewers pendant le test, contrairement aux autres.
function createTestSandboxRouter({ requireAdmin, broadcast, broadcastToPreview, follower, tamagotchi }) {
  const router = express.Router();
  const testAvatars = new Map(); // login -> { species, hue }

  const TEST_EVENTS = {
    follow: { type: 'channel.follow', event: { user_name: 'TestFollower', user_login: 'testfollower' } },
    subscribe: { type: 'channel.subscribe', event: { user_name: 'TestSub', user_login: 'testsub' } },
    cheer: { type: 'channel.cheer', event: { user_name: 'TestCheerer', user_login: 'testcheerer', bits: 100 } },
    raid: { type: 'channel.raid', event: { from_broadcaster_user_name: 'TestRaider', from_broadcaster_user_login: 'testraider', viewers: 25 } },
  };

  router.post('/api/admin/test-event/:type', requireAdmin, (req, res) => {
    const test = TEST_EVENTS[req.params.type];
    if (!test) return res.status(400).json({ error: 'type invalide' });
    // La diffusion normale de l'événement (ci-dessous) met déjà à jour "Derniers événements" à
    // l'écran chez tout le monde (overlay.js appelle updateLastEvent sur tout message 'event').
    // Volontairement PAS persisté sur disque (store.setLastEvent) : "TestFollower" ne doit jamais
    // écraser le vrai dernier follower en base — seul l'affichage en mémoire change le temps du test,
    // et redeviendra correct tout seul à la prochaine reconnexion/au prochain vrai événement.
    broadcast({ type: 'event', eventType: test.type, event: test.event, cast: follower.buildCast() });
    res.json({ ok: true });
  });

  // Dédié à l'onglet "Derniers événements" : met juste à jour le texte permanent avec des données
  // factices, sans déclencher le popup/son/réaction d'avatar de l'alerte (contrairement à
  // test-event ci-dessus). Même principe de non-persistance : jamais écrit sur disque.
  router.post('/api/admin/test-last-event/:type', requireAdmin, (req, res) => {
    const test = TEST_EVENTS[req.params.type];
    if (!test) return res.status(400).json({ error: 'type invalide' });
    broadcast({ type: 'last-event-preview', eventType: test.type, event: test.event });
    res.json({ ok: true });
  });

  router.post('/api/admin/test-last-event/:type/clear', requireAdmin, (req, res) => {
    if (!TEST_EVENTS[req.params.type]) return res.status(400).json({ error: 'type invalide' });
    broadcast({ type: 'last-event-clear', kind: req.params.type });
    res.json({ ok: true });
  });

  router.post('/api/admin/test-avatar/:speciesId', requireAdmin, (req, res) => {
    const match = species.getById(req.params.speciesId);
    if (!match) return res.status(400).json({ error: 'species invalide' });
    testAvatars.set(`test-${req.params.speciesId}`, { species: req.params.speciesId, hue: 0 });
    broadcastToPreview(follower.buildState(true));
    res.json({ ok: true });
  });

  router.delete('/api/admin/test-avatar/:speciesId', requireAdmin, (req, res) => {
    testAvatars.delete(`test-${req.params.speciesId}`);
    broadcastToPreview(follower.buildState(true));
    res.json({ ok: true });
  });

  router.delete('/api/admin/test-avatar', requireAdmin, (req, res) => {
    testAvatars.clear();
    broadcastToPreview(follower.buildState(true));
    res.json({ ok: true });
  });

  router.post('/api/admin/test-raid-card', requireAdmin, (req, res) => {
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

  router.post('/api/admin/test-tamagotchi-reaction/:reaction', requireAdmin, (req, res) => {
    const { reaction } = req.params;
    if (!TAMAGOTCHI_REACTIONS.includes(reaction) || reaction === 'none') {
      return res.status(400).json({ error: 'réaction invalide' });
    }
    broadcastToPreview({ type: 'tamagotchi-reaction', reaction });
    res.json({ ok: true });
  });

  router.post('/api/admin/tamagotchi/feed', requireAdmin, (req, res) => {
    tamagotchi.boost(15);
    res.json({ ok: true, mood: tamagotchi.getMood() });
  });

  return { router, getTestAvatars: () => testAvatars };
}

module.exports = { createTestSandboxRouter };
