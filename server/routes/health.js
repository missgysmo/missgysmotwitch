const express = require('express');

// Moniteur de santé du bot : statut chat/EventSub, overlays connectés, dernières erreurs.
function createHealthRouter({ requireAdmin, chatTracker, botHealth, overlayClients, logger }) {
  const router = express.Router();

  router.get('/api/admin/health', requireAdmin, (req, res) => {
    res.json({
      chat: chatTracker.getStatus(),
      eventSub: { connected: botHealth.eventSubConnected },
      overlayClients: overlayClients.size,
      uptimeSeconds: Math.floor((Date.now() - botHealth.startedAt) / 1000),
      recentErrors: logger.readRecentErrors(10),
    });
  });

  router.delete('/api/admin/debug-log', requireAdmin, (req, res) => {
    logger.clearLog();
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createHealthRouter };
