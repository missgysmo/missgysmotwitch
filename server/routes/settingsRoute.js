const express = require('express');
const { sanitizeSettings } = require('../lib/sanitizeSettings');

// GET/POST /api/settings : toute la validation vit dans lib/sanitizeSettings.js, ce router
// ne fait que le point d'entrée HTTP + la diffusion aux overlays + le cas particulier de la
// grille de graffiti (dont les coordonnées existantes ne veulent plus rien dire si elle change de taille).
function createSettingsRouter({ store, requireAdmin, broadcast }) {
  const router = express.Router();

  router.get('/api/settings', requireAdmin, (req, res) => {
    res.json(store.getSettings());
  });

  router.post('/api/settings', requireAdmin, (req, res) => {
    const d = store.getSettings();
    const settings = sanitizeSettings(req.body, d);

    store.setSettings(settings);
    broadcast({ type: 'settings', settings });

    if (settings.graffiti.cols !== d.graffiti.cols || settings.graffiti.rows !== d.graffiti.rows) {
      const canvas = store.resetCanvas(settings.graffiti.cols, settings.graffiti.rows);
      broadcast({ type: 'canvas-init', ...canvas });
    }

    res.json(settings);
  });

  return router;
}

module.exports = { createSettingsRouter };
