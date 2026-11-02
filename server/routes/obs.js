const express = require('express');

function createObsRouter({ store, requireAdmin, obs }) {
  const router = express.Router();

  router.get('/api/admin/obs/status', requireAdmin, (req, res) => {
    const cfg = store.getObsConfig();
    res.json({ hasConfig: !!cfg, host: cfg?.host || '', port: cfg?.port || '', connected: obs.isConnected() });
  });

  router.post('/api/admin/obs/config', requireAdmin, (req, res) => {
    const host = typeof req.body?.host === 'string' ? req.body.host.trim() : '';
    const port = Number(req.body?.port);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!host) return res.status(400).json({ error: 'adresse manquante' });
    if (!Number.isFinite(port) || port <= 0) return res.status(400).json({ error: 'port invalide' });

    store.setObsConfig({ host, port, password });
    obs.connect();
    res.json({ ok: true });
  });

  router.delete('/api/admin/obs/config', requireAdmin, async (req, res) => {
    store.setObsConfig(null);
    await obs.disconnect();
    res.json({ ok: true });
  });

  // Sandbox : déclenche un vrai clip (contrairement aux autres routes de test, il n'y a pas de
  // simulation possible ici — ça parle à OBS pour de vrai, mais sans conséquence sur le stream).
  router.post('/api/admin/obs/clip', requireAdmin, async (req, res) => {
    try {
      await obs.triggerClip();
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { createObsRouter };
