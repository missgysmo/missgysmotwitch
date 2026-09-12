const express = require('express');

// Chronomètres (intro / pause) : état éphémère en mémoire, pas persisté sur disque.
// activeTimers est retourné en plus du router car index.js en a besoin pour renvoyer l'état
// courant aux overlays qui se (re)connectent en WebSocket.
function createTimersRouter({ store, requireAdmin, broadcast }) {
  const router = express.Router();
  const activeTimers = {}; // id -> endAt (ms epoch)

  router.post('/api/admin/timer/:id/start', requireAdmin, (req, res) => {
    const id = req.params.id;
    const settings = store.getSettings();
    if (!settings.timers[id]) return res.status(400).json({ error: 'chronomètre invalide' });
    const endAt = Date.now() + settings.timers[id].durationSeconds * 1000;
    activeTimers[id] = endAt;
    broadcast({ type: 'timer', id, action: 'start', endAt, cfg: settings.timers[id] });
    res.json({ ok: true, endAt });
  });

  router.post('/api/admin/timer/:id/stop', requireAdmin, (req, res) => {
    const id = req.params.id;
    delete activeTimers[id];
    broadcast({ type: 'timer', id, action: 'stop' });
    res.json({ ok: true });
  });

  return { router, activeTimers };
}

module.exports = { createTimersRouter };
