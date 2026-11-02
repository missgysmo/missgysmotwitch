const express = require('express');

function createClipsRouter({ requireAdmin, clipService }) {
  const router = express.Router();

  // Pas de simulation possible ici — ça crée un vrai clip Twitch (mais sans conséquence,
  // supprimable depuis le Créateur de Contenu Twitch si besoin).
  router.post('/api/admin/clip', requireAdmin, async (req, res) => {
    try {
      const clip = await clipService.triggerClip();
      res.json({ ok: true, ...clip });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { createClipsRouter };
