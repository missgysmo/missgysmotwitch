const express = require('express');

// Carnet de bord des réguliers (notes privées admin, jamais exposées côté overlay/viewer)
// + carte de remerciement (avatar Twitch d'un viewer, pour générer une image côté dashboard).
function createViewerNotesRouter({ store, requireAdmin, twitchEvents, CLIENT_ID, CLIENT_SECRET, logError }) {
  const router = express.Router();

  router.get('/api/admin/viewer-notes', requireAdmin, (req, res) => {
    res.json(store.getViewerNotes());
  });

  router.post('/api/admin/viewer-notes/:login', requireAdmin, (req, res) => {
    const { note, tags } = req.body || {};
    if (typeof note !== 'string' || note.length > 2000) return res.status(400).json({ error: 'note invalide' });
    if (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string' || t.length > 30) || tags.length > 10) {
      return res.status(400).json({ error: 'tags invalides' });
    }
    const saved = store.setViewerNote(req.params.login, { note, tags });
    res.json(saved);
  });

  router.delete('/api/admin/viewer-notes/:login', requireAdmin, (req, res) => {
    store.deleteViewerNote(req.params.login);
    res.json({ ok: true });
  });

  router.get('/api/admin/thank-you-card/:login', requireAdmin, async (req, res) => {
    try {
      const profile = await twitchEvents.getUserProfile({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, login: req.params.login });
      res.json(profile);
    } catch (err) {
      logError('thank-you-card', err);
      res.status(404).json({ error: 'Viewer introuvable sur Twitch' });
    }
  });

  return router;
}

module.exports = { createViewerNotesRouter };
