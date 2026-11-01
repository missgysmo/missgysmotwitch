const express = require('express');

// Le test d'alerte "don" lui-même réutilise la route générique /api/admin/test-event/donation
// (testSandbox.js) comme les autres types d'events — ce routeur ne gère que la connexion au
// Socket API Streamlabs (token).
function createStreamlabsRouter({ store, requireAdmin, broadcast, streamlabs }) {
  const router = express.Router();

  router.get('/api/admin/streamlabs/status', requireAdmin, (req, res) => {
    res.json({ hasToken: !!store.getStreamlabsToken(), connected: streamlabs.isConnected() });
  });

  router.get('/api/admin/donation-total', requireAdmin, (req, res) => {
    res.json({ total: store.getDonationTotal() });
  });

  // Correction manuelle (ex: total d'une plateforme externe, ou remise à zéro pour un nouvel event).
  router.post('/api/admin/donation-total', requireAdmin, (req, res) => {
    const total = store.setDonationTotal(req.body?.total);
    broadcast({ type: 'donation-total', total });
    res.json({ ok: true, total });
  });

  router.post('/api/admin/streamlabs/token', requireAdmin, (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!token) return res.status(400).json({ error: 'token manquant' });
    store.setStreamlabsToken(token);
    streamlabs.connect();
    res.json({ ok: true });
  });

  router.delete('/api/admin/streamlabs/token', requireAdmin, (req, res) => {
    store.setStreamlabsToken(null);
    streamlabs.disconnect();
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createStreamlabsRouter };
