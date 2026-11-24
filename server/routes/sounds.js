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

  // Galerie d'images (contrairement à "event-image" ci-dessus qui ne garde qu'une seule image) :
  // à chaque alerte, l'overlay en tire une au hasard — voir showEvent() dans overlay.js.
  const MAX_IMAGES = 12;

  router.post('/api/admin/event-images/:type', requireAdmin, (req, res) => {
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
      if (slot.images.length >= MAX_IMAGES) return res.status(400).json({ error: `Maximum ${MAX_IMAGES} images.` });

      const rawExt = path.extname(req.file.originalname).toLowerCase();
      const ext = SAFE_IMAGE_EXT.has(rawExt) ? rawExt : '.png';
      const filename = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      fs.writeFileSync(path.join(eventImagesDir, filename), req.file.buffer);

      slot.images.push(filename);
      store.setSettings(settings);

      broadcast({ type: 'settings', settings });
      res.json({ ok: true, images: slot.images });
    });
  });

  router.delete('/api/admin/event-images/:type/:filename', requireAdmin, (req, res) => {
    const { type, filename } = req.params;
    // Pas de retrait de fichier hors du dossier prévu : le nom doit être exactement celui généré
    // par l'upload ci-dessus (aucun séparateur de chemin), jamais une valeur construite par le client.
    if (!/^[a-zA-Z0-9._-]+$/.test(filename)) return res.status(400).json({ error: 'nom de fichier invalide' });
    const settings = store.getSettings();
    const slot = getSoundSlot(settings, type);
    if (!slot) return res.status(400).json({ error: 'type invalide' });

    slot.images = slot.images.filter((f) => f !== filename);
    store.setSettings(settings);
    fs.rm(path.join(eventImagesDir, filename), { force: true }, () => {});

    broadcast({ type: 'settings', settings });
    res.json({ ok: true, images: slot.images });
  });

  // Plusieurs sons par alerte (follow/sub/cheer/raid/don) : l'overlay en tire un au hasard à chaque
  // alerte. L'ancien son unique (slot.sound) est versé dans la liste au premier ajout, pour ne pas le perdre.
  const MAX_SOUNDS = 20;
  const allSounds = (slot) => [...(slot.sounds || []), ...(slot.sound ? [slot.sound] : [])];

  router.post('/api/admin/event-sounds/:type', requireAdmin, (req, res) => {
    soundUpload.single('sound')(req, res, (err) => {
      if (err) {
        const message = err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux (8 Mo max)' : err.message;
        return res.status(400).json({ error: message });
      }
      const type = req.params.type;
      const settings = store.getSettings();
      const slot = settings.events[type];
      if (!slot) return res.status(400).json({ error: 'type invalide' });
      if (!req.file) return res.status(400).json({ error: 'fichier audio manquant ou format invalide' });
      slot.sounds = slot.sounds || [];
      if (slot.sound) {
        slot.sounds.push(slot.sound);
        slot.sound = null;
      }
      if (slot.sounds.length >= MAX_SOUNDS) return res.status(400).json({ error: `Maximum ${MAX_SOUNDS} sons.` });

      const SAFE_SOUND_EXT = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.webm', '.aac', '.flac']);
      const rawExt = path.extname(req.file.originalname).toLowerCase();
      const ext = SAFE_SOUND_EXT.has(rawExt) ? rawExt : '.mp3';
      const filename = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      fs.writeFileSync(path.join(soundsDir, filename), req.file.buffer);

      slot.sounds.push(filename);
      store.setSettings(settings);
      broadcast({ type: 'settings', settings });
      res.json({ ok: true, sounds: allSounds(slot) });
    });
  });

  router.delete('/api/admin/event-sounds/:type/:filename', requireAdmin, (req, res) => {
    const { type, filename } = req.params;
    // Nom exactement tel que généré à l'upload (pas de séparateur de chemin).
    if (!/^[a-zA-Z0-9._-]+$/.test(filename)) return res.status(400).json({ error: 'nom de fichier invalide' });
    const settings = store.getSettings();
    const slot = settings.events[type];
    if (!slot) return res.status(400).json({ error: 'type invalide' });
    if (!allSounds(slot).includes(filename)) return res.status(404).json({ error: 'son introuvable' });

    if (slot.sound === filename) slot.sound = null;
    slot.sounds = (slot.sounds || []).filter((f) => f !== filename);
    store.setSettings(settings);
    fs.rm(path.join(soundsDir, filename), { force: true }, () => {});

    broadcast({ type: 'settings', settings });
    res.json({ ok: true, sounds: allSounds(slot) });
  });

  return router;
}

module.exports = { createSoundsRouter };
