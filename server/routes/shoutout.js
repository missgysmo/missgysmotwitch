const express = require('express');

function createShoutoutRouter({ requireAdmin, shoutoutService }) {
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

  return router;
}

module.exports = { createShoutoutRouter };
