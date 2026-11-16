const express = require('express');

function createShoutoutRouter({ requireAdmin, shoutoutService, broadcastToPreview }) {
  const router = express.Router();

  // Test depuis le dashboard : fait un vrai shoutout (message tchat + officiel + fiche overlay),
  // selon ce qui est activé dans les réglages.
  router.post('/api/admin/shoutout', requireAdmin, express.json(), async (req, res) => {
    try {
      const report = await shoutoutService.triggerShoutout(req.body?.login);
      res.json({ ok: true, ...report });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Aperçu de la fiche seule, sur l'overlay sandbox (/overlay/?preview=1) — jamais sur le vrai stream.
  router.post('/api/admin/test-shoutout-card', requireAdmin, (req, res) => {
    broadcastToPreview({
      type: 'shoutout-card',
      login: 'chaine_amie',
      displayName: 'ChaineAmie',
      avatar: '/overlay/sprites/cat.png',
      game: 'Just Chatting',
      title: 'Un stream de test bien sympa',
    });
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createShoutoutRouter };
