const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const MAX_COMMANDS = 100;
const COMMAND_RE = /^!\S{1,20}$/;
const SOUND_MAX_BYTES = 8 * 1024 * 1024;
const VIDEO_MAX_BYTES = 25 * 1024 * 1024;
const SAFE_SOUND_EXT = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.webm', '.aac', '.flac']);
const SAFE_VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.m4v']);

function sanitizeCommandFields(input, fallback) {
  const clamp = (v, min, max, d) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
  return {
    label: typeof input?.label === 'string' && input.label.trim() ? input.label.trim().slice(0, 40) : fallback.label,
    command: typeof input?.command === 'string' && COMMAND_RE.test(input.command.trim()) ? input.command.trim().toLowerCase() : fallback.command,
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : fallback.enabled,
    followersAllowed: typeof input?.followersAllowed === 'boolean' ? input.followersAllowed : fallback.followersAllowed,
    type: ['sound', 'video'].includes(input?.type) ? input.type : fallback.type,
    cooldownSeconds: clamp(input?.cooldownSeconds, 0, 300, fallback.cooldownSeconds),
  };
}

// Commandes personnalisées de chat (soundboard) : CRUD + upload du média associé (son ou vidéo).
// Volontairement à l'écart de lib/sanitizeSettings.js — cette liste ne se modifie que par ces
// routes dédiées, jamais par le formulaire de réglages classique (voir store.js).
function createCustomCommandsRouter({ store, requireAdmin, broadcast, broadcastToPreview, mediaDir }) {
  const router = express.Router();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: VIDEO_MAX_BYTES },
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.startsWith('audio/') && !file.mimetype.startsWith('video/')) {
        return cb(new Error('Le fichier doit être un son ou une vidéo.'));
      }
      cb(null, true);
    },
  });

  function findCommand(settings, id) {
    return settings.customCommands.find((c) => c.id === id);
  }

  function commandWordTaken(settings, command, excludeId) {
    return settings.customCommands.some((c) => c.id !== excludeId && c.command === command);
  }

  router.post('/api/admin/custom-commands', requireAdmin, (req, res) => {
    const settings = store.getSettings();
    if (settings.customCommands.length >= MAX_COMMANDS) {
      return res.status(400).json({ error: `Maximum ${MAX_COMMANDS} commandes.` });
    }
    const command = typeof req.body?.command === 'string' ? req.body.command.trim().toLowerCase() : '';
    if (!COMMAND_RE.test(command)) return res.status(400).json({ error: 'Commande invalide (doit commencer par ! et faire moins de 21 caractères).' });
    if (commandWordTaken(settings, command, null)) return res.status(400).json({ error: 'Cette commande existe déjà.' });

    const fallback = { label: command, command, enabled: false, followersAllowed: true, type: 'sound', cooldownSeconds: 10 };
    const fields = sanitizeCommandFields({ ...req.body, command }, fallback);
    const newCommand = { id: crypto.randomBytes(8).toString('hex'), media: null, ...fields };

    settings.customCommands.push(newCommand);
    store.setSettings(settings);
    broadcast({ type: 'settings', settings });
    res.json(newCommand);
  });

  router.patch('/api/admin/custom-commands/:id', requireAdmin, (req, res) => {
    const settings = store.getSettings();
    const cmd = findCommand(settings, req.params.id);
    if (!cmd) return res.status(404).json({ error: 'commande introuvable' });

    if (typeof req.body?.command === 'string') {
      const word = req.body.command.trim().toLowerCase();
      if (!COMMAND_RE.test(word)) return res.status(400).json({ error: 'Commande invalide.' });
      if (commandWordTaken(settings, word, cmd.id)) return res.status(400).json({ error: 'Cette commande existe déjà.' });
    }

    Object.assign(cmd, sanitizeCommandFields(req.body, cmd));
    store.setSettings(settings);
    broadcast({ type: 'settings', settings });
    res.json(cmd);
  });

  router.delete('/api/admin/custom-commands/:id', requireAdmin, (req, res) => {
    const settings = store.getSettings();
    const cmd = findCommand(settings, req.params.id);
    if (!cmd) return res.status(404).json({ error: 'commande introuvable' });

    if (cmd.media) fs.rm(path.join(mediaDir, cmd.media), { force: true }, () => {});
    settings.customCommands = settings.customCommands.filter((c) => c.id !== cmd.id);
    store.setSettings(settings);
    broadcast({ type: 'settings', settings });
    res.json({ ok: true });
  });

  router.post('/api/admin/custom-commands/:id/media', requireAdmin, (req, res) => {
    upload.single('media')(req, res, (err) => {
      if (err) {
        const message = err.code === 'LIMIT_FILE_SIZE' ? `Fichier trop volumineux (${VIDEO_MAX_BYTES / 1024 / 1024} Mo max)` : err.message;
        return res.status(400).json({ error: message });
      }

      const settings = store.getSettings();
      const cmd = findCommand(settings, req.params.id);
      if (!cmd) return res.status(404).json({ error: 'commande introuvable' });
      if (!req.file) return res.status(400).json({ error: 'fichier manquant ou format invalide' });

      const isVideo = req.file.mimetype.startsWith('video/');
      if ((cmd.type === 'sound' && isVideo) || (cmd.type === 'video' && !isVideo)) {
        return res.status(400).json({ error: `Cette commande attend un fichier ${cmd.type === 'sound' ? 'audio' : 'vidéo'}.` });
      }
      const maxBytes = cmd.type === 'video' ? VIDEO_MAX_BYTES : SOUND_MAX_BYTES;
      if (req.file.size > maxBytes) {
        return res.status(400).json({ error: `Fichier trop volumineux (${maxBytes / 1024 / 1024} Mo max pour ce type).` });
      }

      const rawExt = path.extname(req.file.originalname).toLowerCase();
      const safeExt = cmd.type === 'video' ? SAFE_VIDEO_EXT : SAFE_SOUND_EXT;
      const ext = safeExt.has(rawExt) ? rawExt : (cmd.type === 'video' ? '.mp4' : '.mp3');
      const filename = `cmd-${cmd.id}-${Date.now()}${ext}`;
      fs.writeFileSync(path.join(mediaDir, filename), req.file.buffer);

      const oldFile = cmd.media;
      cmd.media = filename;
      store.setSettings(settings);
      if (oldFile) fs.rm(path.join(mediaDir, oldFile), { force: true }, () => {});

      broadcast({ type: 'settings', settings });
      res.json({ ok: true, media: filename });
    });
  });

  router.delete('/api/admin/custom-commands/:id/media', requireAdmin, (req, res) => {
    const settings = store.getSettings();
    const cmd = findCommand(settings, req.params.id);
    if (!cmd) return res.status(404).json({ error: 'commande introuvable' });

    const oldFile = cmd.media;
    cmd.media = null;
    store.setSettings(settings);
    if (oldFile) fs.rm(path.join(mediaDir, oldFile), { force: true }, () => {});

    broadcast({ type: 'settings', settings });
    res.json({ ok: true });
  });

  // Sandbox uniquement : jamais visible sur le vrai stream (voir routes/testSandbox.js pour le même principe).
  router.post('/api/admin/custom-commands/:id/test', requireAdmin, (req, res) => {
    const settings = store.getSettings();
    const cmd = findCommand(settings, req.params.id);
    if (!cmd) return res.status(404).json({ error: 'commande introuvable' });
    if (!cmd.media) return res.status(400).json({ error: 'Ajoute un média avant de tester.' });

    broadcastToPreview({ type: 'custom-command', id: cmd.id, mediaType: cmd.type, media: cmd.media, label: cmd.label });
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createCustomCommandsRouter };
