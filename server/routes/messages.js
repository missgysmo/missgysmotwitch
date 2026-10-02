const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const MAX_MESSAGES = 50;
const TEXT_MAX_LEN = 300;
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const SAFE_IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

function sanitizeMessageFields(input, fallback) {
  return {
    text: typeof input?.text === 'string' ? input.text.trim().slice(0, TEXT_MAX_LEN) : fallback.text,
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : fallback.enabled,
  };
}

// Messages personnalisés (bandeau défilant / panneau) : CRUD + upload d'image associée.
// Volontairement à l'écart de lib/sanitizeSettings.js — cette liste ne se modifie que par ces
// routes dédiées, jamais par le formulaire de réglages classique (voir store.js).
function createMessagesRouter({ store, requireAdmin, broadcast, mediaDir }) {
  const router = express.Router();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: IMAGE_MAX_BYTES },
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) return cb(new Error('Le fichier doit être une image.'));
      cb(null, true);
    },
  });

  function findMessage(settings, id) {
    return settings.messages.items.find((m) => m.id === id);
  }

  router.post('/api/admin/messages', requireAdmin, (req, res) => {
    const settings = store.getSettings();
    if (settings.messages.items.length >= MAX_MESSAGES) {
      return res.status(400).json({ error: `Maximum ${MAX_MESSAGES} messages.` });
    }
    const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, TEXT_MAX_LEN) : '';
    if (!text) return res.status(400).json({ error: 'Texte manquant.' });

    const newMessage = { id: crypto.randomBytes(8).toString('hex'), text, enabled: true, image: null };
    settings.messages.items.push(newMessage);
    store.setSettings(settings);
    broadcast({ type: 'settings', settings });
    res.json(newMessage);
  });

  router.patch('/api/admin/messages/:id', requireAdmin, (req, res) => {
    const settings = store.getSettings();
    const msg = findMessage(settings, req.params.id);
    if (!msg) return res.status(404).json({ error: 'message introuvable' });

    Object.assign(msg, sanitizeMessageFields(req.body, msg));
    store.setSettings(settings);
    broadcast({ type: 'settings', settings });
    res.json(msg);
  });

  router.delete('/api/admin/messages/:id', requireAdmin, (req, res) => {
    const settings = store.getSettings();
    const msg = findMessage(settings, req.params.id);
    if (!msg) return res.status(404).json({ error: 'message introuvable' });

    if (msg.image) fs.rm(path.join(mediaDir, msg.image), { force: true }, () => {});
    settings.messages.items = settings.messages.items.filter((m) => m.id !== msg.id);
    store.setSettings(settings);
    broadcast({ type: 'settings', settings });
    res.json({ ok: true });
  });

  router.post('/api/admin/messages/:id/image', requireAdmin, (req, res) => {
    upload.single('image')(req, res, (err) => {
      if (err) {
        const message = err.code === 'LIMIT_FILE_SIZE' ? `Image trop volumineuse (${IMAGE_MAX_BYTES / 1024 / 1024} Mo max)` : err.message;
        return res.status(400).json({ error: message });
      }
      const settings = store.getSettings();
      const msg = findMessage(settings, req.params.id);
      if (!msg) return res.status(404).json({ error: 'message introuvable' });
      if (!req.file) return res.status(400).json({ error: 'fichier manquant ou format invalide' });

      const rawExt = path.extname(req.file.originalname).toLowerCase();
      const ext = SAFE_IMAGE_EXT.has(rawExt) ? rawExt : '.png';
      const filename = `msg-${msg.id}-${Date.now()}${ext}`;
      fs.writeFileSync(path.join(mediaDir, filename), req.file.buffer);

      const oldFile = msg.image;
      msg.image = filename;
      store.setSettings(settings);
      if (oldFile) fs.rm(path.join(mediaDir, oldFile), { force: true }, () => {});

      broadcast({ type: 'settings', settings });
      res.json({ ok: true, image: filename });
    });
  });

  router.delete('/api/admin/messages/:id/image', requireAdmin, (req, res) => {
    const settings = store.getSettings();
    const msg = findMessage(settings, req.params.id);
    if (!msg) return res.status(404).json({ error: 'message introuvable' });

    const oldFile = msg.image;
    msg.image = null;
    store.setSettings(settings);
    if (oldFile) fs.rm(path.join(mediaDir, oldFile), { force: true }, () => {});

    broadcast({ type: 'settings', settings });
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createMessagesRouter };
