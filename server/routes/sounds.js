const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Upload/suppression des sons d'alerte (follow/sub/cheer/raid, son du tchat...).
// Les sons ne sont pas tous rangés au même endroit dans les réglages : ce helper renvoie l'objet
// qui porte le champ "sound" pour un "type" donné.
function getSoundSlot(settings, type) {
  if (type === 'chatSound') return settings.chatSound;
  return settings.events[type];
}

const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const SAFE_IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

function createSoundsRouter({ store, requireAdmin, broadcast, soundsDir, eventImagesDir }) {
  const router = express.Router();

  const soundUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.startsWith('audio/')) return cb(new Error('Le fichier doit être un son (audio).'));
      cb(null, true);
    },
  });

  const imageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: IMAGE_MAX_BYTES },
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) return cb(new Error('Le fichier doit être une image.'));
      cb(null, true);
    },
  });

  function handleUpload(req, res) {
    const type = req.params.type;
    const settings = store.getSettings();
    const slot = getSoundSlot(settings, type);
    if (!slot) return res.status(400).json({ error: 'type invalide' });
    if (!req.file) return res.status(400).json({ error: 'fichier audio manquant ou format invalide' });

    // Extension prise sur le nom d'origine mais restreinte à une liste connue, pour ne jamais
    // écrire un nom de fichier inattendu à partir d'une valeur envoyée par le navigateur.
    const SAFE_SOUND_EXT = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.webm', '.aac', '.flac']);
    const rawExt = path.extname(req.file.originalname).toLowerCase();
    const ext = SAFE_SOUND_EXT.has(rawExt) ? rawExt : '.mp3';
    const filename = `${type}-${Date.now()}${ext}`;
    fs.writeFileSync(path.join(soundsDir, filename), req.file.buffer);

    const oldFile = slot.sound;
    slot.sound = filename;
    store.setSettings(settings);
    if (oldFile) fs.rm(path.join(soundsDir, oldFile), { force: true }, () => {});

    broadcast({ type: 'settings', settings });
    res.json({ ok: true, sound: filename });
  }

  router.post('/api/admin/sound/:type', requireAdmin, (req, res) => {
    soundUpload.single('sound')(req, res, (err) => {
      if (err) {
        const message = err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux (8 Mo max)' : err.message;
        return res.status(400).json({ error: message });
      }
      handleUpload(req, res);
    });
  });

  router.delete('/api/admin/sound/:type', requireAdmin, (req, res) => {
    const type = req.params.type;
    const settings = store.getSettings();
    const slot = getSoundSlot(settings, type);
    if (!slot) return res.status(400).json({ error: 'type invalide' });

    const oldFile = slot.sound;
    slot.sound = null;
    store.setSettings(settings);
    if (oldFile) fs.rm(path.join(soundsDir, oldFile), { force: true }, () => {});

    broadcast({ type: 'settings', settings });
    res.json({ ok: true });
  });

  // Image affichée dans le popup d'alerte (follow/sub/cheer/raid/don) — même slot settings.events[type]
  // que le son ci-dessus, juste un champ différent (image / sound).
  router.post('/api/admin/event-image/:type', requireAdmin, (req, res) => {
    imageUpload.single('image')(req, res, (err) => {
      if (err) {
        const message = err.code === 'LIMIT_FILE_SIZE' ? `Image trop volumineuse (${IMAGE_MAX_BYTES / 1024 / 1024} Mo max)` : err.message;
        return res.status(400).json({ error: message });
      }

      const type = req.params.type;
      const settings = store.getSettings();
      const slot = getSoundSlot(settings, type);
      if (!slot) return res.status(400).json({ error: 'type invalide' });
      if (!req.file) return res.status(400).json({ error: 'image manquante ou format invalide' });

      const rawExt = path.extname(req.file.originalname).toLowerCase();
      const ext = SAFE_IMAGE_EXT.has(rawExt) ? rawExt : '.png';
      const filename = `${type}-${Date.now()}${ext}`;
      fs.writeFileSync(path.join(eventImagesDir, filename), req.file.buffer);

      const oldFile = slot.image;
      slot.image = filename;
      store.setSettings(settings);
      if (oldFile) fs.rm(path.join(eventImagesDir, oldFile), { force: true }, () => {});

      broadcast({ type: 'settings', settings });
      res.json({ ok: true, image: filename });
    });
  });

  router.delete('/api/admin/event-image/:type', requireAdmin, (req, res) => {
    const type = req.params.type;
    const settings = store.getSettings();
    const slot = getSoundSlot(settings, type);
    if (!slot) return res.status(400).json({ error: 'type invalide' });

    const oldFile = slot.image;
    slot.image = null;
    store.setSettings(settings);
    if (oldFile) fs.rm(path.join(eventImagesDir, oldFile), { force: true }, () => {});

    broadcast({ type: 'settings', settings });
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createSoundsRouter };
