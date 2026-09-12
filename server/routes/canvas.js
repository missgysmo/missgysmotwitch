const express = require('express');
const species = require('../species');

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const GRAFFITI_COLORS = {
  rouge: '#ff4757', red: '#ff4757',
  bleu: '#3742fa', blue: '#3742fa',
  vert: '#2ed573', green: '#2ed573',
  jaune: '#ffd633', yellow: '#ffd633',
  violet: '#9147ff', purple: '#9147ff',
  blanc: '#ffffff', white: '#ffffff',
  noir: '#17171d', black: '#17171d',
  orange: '#ff9f43',
  rose: '#ff6ec7', pink: '#ff6ec7',
  cyan: '#18dcff',
};

function resolveGraffitiColor(arg) {
  const named = GRAFFITI_COLORS[arg.toLowerCase()];
  if (named) return named;
  const hex = arg.startsWith('#') ? arg : `#${arg}`;
  return HEX_COLOR.test(hex) ? hex : null;
}

// Graffiti collectif (page /canvas/, réservée aux followers comme les avatars) + statut de suivi public.
function createCanvasRouter({ store, requireAdmin, publicApiRateLimit, broadcast, follower }) {
  const router = express.Router();

  // login (lowercase) -> timestamp du dernier pixel/sticker placé
  const graffitiCooldowns = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [key, ts] of graffitiCooldowns) {
      if (now - ts > 60 * 60 * 1000) graffitiCooldowns.delete(key);
    }
  }, 30 * 60 * 1000).unref();

  router.get('/api/canvas', (req, res) => {
    const settings = store.getSettings();
    const canvas = store.getCanvas();
    res.json({ ...canvas, cooldownSeconds: settings.graffiti.cooldownSeconds, enabled: settings.graffiti.enabled });
  });

  router.get('/api/follow-status/:login', publicApiRateLimit, async (req, res) => {
    const login = req.params.login;
    const follows = follower.isChannelOwner(login) ? true : await follower.checkAndCacheFollower(login);
    res.json({ follows });
  });

  router.post('/api/canvas/place', publicApiRateLimit, async (req, res) => {
    const settings = store.getSettings();
    if (!settings.graffiti.enabled) return res.status(403).json({ error: 'Le graffiti est désactivé pour le moment.' });

    const login = (req.body.login || '').toLowerCase().trim();
    if (!login) return res.status(400).json({ error: 'pseudo manquant' });

    const follows = follower.isChannelOwner(login) ? true : await follower.checkAndCacheFollower(login);
    if (!follows) return res.status(403).json({ error: 'Tu dois suivre la chaîne sur Twitch pour participer au graffiti.' });

    const now = Date.now();
    const last = graffitiCooldowns.get(login) || 0;
    const cooldownMs = settings.graffiti.cooldownSeconds * 1000;
    if (now - last < cooldownMs) {
      return res.status(429).json({ error: 'Doucement !', retryInMs: cooldownMs - (now - last) });
    }

    const { cols, rows } = settings.graffiti;
    const x = Number(req.body.x);
    const y = Number(req.body.y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= cols || y < 0 || y >= rows) {
      return res.status(400).json({ error: 'coordonnées invalides' });
    }

    let cell;
    if (req.body.type === 'pixel') {
      const color = resolveGraffitiColor(String(req.body.color || ''));
      if (!color) return res.status(400).json({ error: 'couleur invalide' });
      cell = { type: 'pixel', color, login };
    } else if (req.body.type === 'sticker') {
      const match = species.getById(String(req.body.species || '').toLowerCase());
      if (!match || match.reserved) return res.status(400).json({ error: 'personnage invalide' });
      cell = { type: 'sticker', species: match.id, login };
    } else if (req.body.type === 'erase') {
      const existing = store.getCanvas().cells[`${x},${y}`];
      if (!existing) return res.status(400).json({ error: 'Cette case est déjà vide.' });
      if (existing.login !== login) return res.status(403).json({ error: 'Tu ne peux effacer que tes propres pixels.' });
      cell = null;
    } else {
      return res.status(400).json({ error: 'type invalide' });
    }

    store.setCanvasCell(x, y, cell);
    broadcast({ type: 'canvas-update', x, y, cell });
    graffitiCooldowns.set(login, now);
    res.json({ ok: true, cooldownMs });
  });

  router.post('/api/admin/canvas/reset', requireAdmin, (req, res) => {
    const settings = store.getSettings();
    const canvas = store.resetCanvas(settings.graffiti.cols, settings.graffiti.rows);
    broadcast({ type: 'canvas-init', ...canvas });
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createCanvasRouter };
