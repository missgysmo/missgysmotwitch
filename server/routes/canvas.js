const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

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

const TEMPLATE_MAX_BYTES = 4 * 1024 * 1024;
const SAFE_TEMPLATE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const MAX_TEMPLATES = 20;

// Graffiti collectif (page /canvas/, réservée aux followers comme les avatars) + statut de suivi public.
function createCanvasRouter({ store, requireAdmin, publicApiRateLimit, broadcast, follower, speciesCatalog, templatesDir }) {
  const router = express.Router();

  const templateUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: TEMPLATE_MAX_BYTES },
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) return cb(new Error('Le fichier doit être une image.'));
      cb(null, true);
    },
  });

  function findTemplate(settings, id) {
    return settings.graffitiTemplates.find((t) => t.id === id);
  }

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
    const activeTemplate = settings.activeGraffitiTemplateId
      ? findTemplate(settings, settings.activeGraffitiTemplateId) || null
      : null;
    res.json({
      ...canvas,
      cooldownSeconds: settings.graffiti.cooldownSeconds,
      enabled: settings.graffiti.enabled,
      activeTemplate,
    });
  });

  // Modèles de dessin (images de référence que les viewers peuvent reproduire sur le graffiti) :
  // gérés par la streameuse, partagés par tout le monde sur /canvas (contrairement au "modèle perso"
  // que chaque viewer peut aussi charger localement, qui lui reste propre et n'est jamais envoyé ici).
  router.get('/api/admin/graffiti-templates', requireAdmin, (req, res) => {
    const settings = store.getSettings();
    res.json({ templates: settings.graffitiTemplates, activeId: settings.activeGraffitiTemplateId });
  });

  router.post('/api/admin/graffiti-templates', requireAdmin, (req, res) => {
    templateUpload.single('image')(req, res, (err) => {
      if (err) {
        const message = err.code === 'LIMIT_FILE_SIZE' ? `Image trop volumineuse (${TEMPLATE_MAX_BYTES / 1024 / 1024} Mo max)` : err.message;
        return res.status(400).json({ error: message });
      }
      const settings = store.getSettings();
      if (settings.graffitiTemplates.length >= MAX_TEMPLATES) return res.status(400).json({ error: `Maximum ${MAX_TEMPLATES} modèles.` });
      if (!req.file) return res.status(400).json({ error: 'image manquante ou format invalide' });

      const label = typeof req.body?.label === 'string' && req.body.label.trim() ? req.body.label.trim().slice(0, 60) : 'Sans titre';
      const rawExt = path.extname(req.file.originalname).toLowerCase();
      const ext = SAFE_TEMPLATE_EXT.has(rawExt) ? rawExt : '.png';
      const id = crypto.randomBytes(8).toString('hex');
      const filename = `template-${id}${ext}`;
      fs.writeFileSync(path.join(templatesDir, filename), req.file.buffer);

      settings.graffitiTemplates.push({ id, label, image: filename });
      store.setSettings(settings);
      broadcast({ type: 'settings', settings });
      res.json({ ok: true, templates: settings.graffitiTemplates });
    });
  });

  router.delete('/api/admin/graffiti-templates/:id', requireAdmin, (req, res) => {
    const settings = store.getSettings();
    const tpl = findTemplate(settings, req.params.id);
    if (!tpl) return res.status(404).json({ error: 'modèle introuvable' });

    fs.rm(path.join(templatesDir, tpl.image), { force: true }, () => {});
    settings.graffitiTemplates = settings.graffitiTemplates.filter((t) => t.id !== tpl.id);
    if (settings.activeGraffitiTemplateId === tpl.id) {
      settings.activeGraffitiTemplateId = null;
      broadcast({ type: 'graffiti-template', template: null });
    }
    store.setSettings(settings);
    broadcast({ type: 'settings', settings });
    res.json({ ok: true, templates: settings.graffitiTemplates });
  });

  router.post('/api/admin/graffiti-templates/:id/activate', requireAdmin, (req, res) => {
    const settings = store.getSettings();
    const tpl = findTemplate(settings, req.params.id);
    if (!tpl) return res.status(404).json({ error: 'modèle introuvable' });

    settings.activeGraffitiTemplateId = tpl.id;
    store.setSettings(settings);
    broadcast({ type: 'settings', settings });
    broadcast({ type: 'graffiti-template', template: tpl });
    res.json({ ok: true });
  });

  router.post('/api/admin/graffiti-templates/active/clear', requireAdmin, (req, res) => {
    const settings = store.getSettings();
    settings.activeGraffitiTemplateId = null;
    store.setSettings(settings);
    broadcast({ type: 'settings', settings });
    broadcast({ type: 'graffiti-template', template: null });
    res.json({ ok: true });
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
      const match = speciesCatalog.getById(String(req.body.species || '').toLowerCase());
      if (!match || match.reserved || !match.enabled) return res.status(400).json({ error: 'personnage invalide' });
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
