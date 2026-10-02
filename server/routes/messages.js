const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const MAX_BOARDS = 20;
const MAX_ITEMS_PER_BOARD = 50;
const TEXT_MAX_LEN = 300;
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const SAFE_IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const MESSAGE_FONTS = ['system-ui', 'Bangers', 'Permanent Marker', 'Pacifico', 'Press Start 2P', 'Russo One', 'Caveat', 'Creepster'];
const BOARD_STYLES = ['ticker', 'panel'];
const BOARD_DISPLAY_MODES = ['always', 'interval'];
const BOARD_ROTATION_MODES = ['sequential', 'random'];
const clamp = (v, min, max, d) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);

const ITEM_DEFAULTS = {
  textColor: '#ffffff', fontFamily: 'system-ui', fontSize: 18, bgColor: '#000000', bgOpacity: 60, rotation: 0, tilt: 0,
};

function sanitizeItemFields(input, fallback) {
  return {
    text: typeof input?.text === 'string' ? input.text.trim().slice(0, TEXT_MAX_LEN) : fallback.text,
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : fallback.enabled,
    textColor: HEX_COLOR.test(input?.textColor) ? input.textColor : fallback.textColor,
    fontFamily: MESSAGE_FONTS.includes(input?.fontFamily) ? input.fontFamily : fallback.fontFamily,
    fontSize: clamp(input?.fontSize, 8, 60, fallback.fontSize),
    bgColor: HEX_COLOR.test(input?.bgColor) ? input.bgColor : fallback.bgColor,
    bgOpacity: clamp(input?.bgOpacity, 0, 100, fallback.bgOpacity),
    // rotation = inclinaison à plat (rotateZ) ; tilt = bascule en profondeur (rotateX, effet 3D "vers le fond")
    rotation: clamp(input?.rotation, -180, 180, fallback.rotation),
    tilt: clamp(input?.tilt, -90, 90, fallback.tilt),
  };
}

function sanitizeBoardFields(input, fallback) {
  return {
    label: typeof input?.label === 'string' && input.label.trim() ? input.label.trim().slice(0, 40) : fallback.label,
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : fallback.enabled,
    style: BOARD_STYLES.includes(input?.style) ? input.style : fallback.style,
    displayMode: BOARD_DISPLAY_MODES.includes(input?.displayMode) ? input.displayMode : fallback.displayMode,
    rotationMode: BOARD_ROTATION_MODES.includes(input?.rotationMode) ? input.rotationMode : fallback.rotationMode,
    intervalSeconds: clamp(input?.intervalSeconds, 10, 7200, fallback.intervalSeconds),
    showDurationSeconds: clamp(input?.showDurationSeconds, 3, 600, fallback.showDurationSeconds),
    speedSeconds: clamp(input?.speedSeconds, 3, 300, fallback.speedSeconds),
    position: {
      x: clamp(input?.position?.x, 0, 100, fallback.position.x),
      y: clamp(input?.position?.y, 0, 100, fallback.position.y),
      width: clamp(input?.position?.width, 5, 100, fallback.position.width),
      height: clamp(input?.position?.height, 5, 100, fallback.position.height),
    },
  };
}

// Zones de messages personnalisés (bandeau défilant / panneau) : plusieurs zones indépendantes
// ("boards"), chacune avec son propre style/affichage/position et sa propre liste de messages.
// Volontairement à l'écart de lib/sanitizeSettings.js — géré uniquement par ces routes dédiées,
// jamais par le formulaire de réglages classique (même principe que customCommands).
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

  function findBoard(settings, boardId) {
    return settings.messageBoards.find((b) => b.id === boardId);
  }

  function findItem(board, itemId) {
    return board?.items.find((m) => m.id === itemId);
  }

  router.post('/api/admin/message-boards', requireAdmin, (req, res) => {
    const settings = store.getSettings();
    if (settings.messageBoards.length >= MAX_BOARDS) {
      return res.status(400).json({ error: `Maximum ${MAX_BOARDS} zones.` });
    }
    const label = typeof req.body?.label === 'string' && req.body.label.trim() ? req.body.label.trim().slice(0, 40) : 'Nouvelle zone';
    const newBoard = {
      id: crypto.randomBytes(8).toString('hex'),
      label,
      enabled: false,
      style: 'ticker',
      displayMode: 'always',
      rotationMode: 'sequential',
      intervalSeconds: 300,
      showDurationSeconds: 15,
      speedSeconds: 20,
      position: { x: 10, y: 90, width: 80, height: 8 },
      items: [],
    };
    settings.messageBoards.push(newBoard);
    store.setSettings(settings);
    broadcast({ type: 'settings', settings });
    res.json(newBoard);
  });

  router.patch('/api/admin/message-boards/:boardId', requireAdmin, (req, res) => {
    const settings = store.getSettings();
    const board = findBoard(settings, req.params.boardId);
    if (!board) return res.status(404).json({ error: 'zone introuvable' });

    Object.assign(board, sanitizeBoardFields(req.body, board));
    store.setSettings(settings);
    broadcast({ type: 'settings', settings });
    res.json(board);
  });

  router.delete('/api/admin/message-boards/:boardId', requireAdmin, (req, res) => {
    const settings = store.getSettings();
    const board = findBoard(settings, req.params.boardId);
    if (!board) return res.status(404).json({ error: 'zone introuvable' });

    for (const item of board.items) {
      if (item.image) fs.rm(path.join(mediaDir, item.image), { force: true }, () => {});
    }
    settings.messageBoards = settings.messageBoards.filter((b) => b.id !== board.id);
    store.setSettings(settings);
    broadcast({ type: 'settings', settings });
    res.json({ ok: true });
  });

  router.post('/api/admin/message-boards/:boardId/items', requireAdmin, (req, res) => {
    const settings = store.getSettings();
    const board = findBoard(settings, req.params.boardId);
    if (!board) return res.status(404).json({ error: 'zone introuvable' });
    if (board.items.length >= MAX_ITEMS_PER_BOARD) {
      return res.status(400).json({ error: `Maximum ${MAX_ITEMS_PER_BOARD} messages par zone.` });
    }
    const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, TEXT_MAX_LEN) : '';
    if (!text) return res.status(400).json({ error: 'Texte manquant.' });

    const newItem = { id: crypto.randomBytes(8).toString('hex'), text, enabled: true, image: null, ...ITEM_DEFAULTS };
    board.items.push(newItem);
    store.setSettings(settings);
    broadcast({ type: 'settings', settings });
    res.json(newItem);
  });

  router.patch('/api/admin/message-boards/:boardId/items/:itemId', requireAdmin, (req, res) => {
    const settings = store.getSettings();
    const board = findBoard(settings, req.params.boardId);
    const item = findItem(board, req.params.itemId);
    if (!item) return res.status(404).json({ error: 'message introuvable' });

    Object.assign(item, sanitizeItemFields(req.body, item));
    store.setSettings(settings);
    broadcast({ type: 'settings', settings });
    res.json(item);
  });

  router.delete('/api/admin/message-boards/:boardId/items/:itemId', requireAdmin, (req, res) => {
    const settings = store.getSettings();
    const board = findBoard(settings, req.params.boardId);
    const item = findItem(board, req.params.itemId);
    if (!item) return res.status(404).json({ error: 'message introuvable' });

    if (item.image) fs.rm(path.join(mediaDir, item.image), { force: true }, () => {});
    board.items = board.items.filter((m) => m.id !== item.id);
    store.setSettings(settings);
    broadcast({ type: 'settings', settings });
    res.json({ ok: true });
  });

  router.post('/api/admin/message-boards/:boardId/items/:itemId/image', requireAdmin, (req, res) => {
    upload.single('image')(req, res, (err) => {
      if (err) {
        const message = err.code === 'LIMIT_FILE_SIZE' ? `Image trop volumineuse (${IMAGE_MAX_BYTES / 1024 / 1024} Mo max)` : err.message;
        return res.status(400).json({ error: message });
      }
      const settings = store.getSettings();
      const board = findBoard(settings, req.params.boardId);
      const item = findItem(board, req.params.itemId);
      if (!item) return res.status(404).json({ error: 'message introuvable' });
      if (!req.file) return res.status(400).json({ error: 'fichier manquant ou format invalide' });

      const rawExt = path.extname(req.file.originalname).toLowerCase();
      const ext = SAFE_IMAGE_EXT.has(rawExt) ? rawExt : '.png';
      const filename = `msg-${item.id}-${Date.now()}${ext}`;
      fs.writeFileSync(path.join(mediaDir, filename), req.file.buffer);

      const oldFile = item.image;
      item.image = filename;
      store.setSettings(settings);
      if (oldFile) fs.rm(path.join(mediaDir, oldFile), { force: true }, () => {});

      broadcast({ type: 'settings', settings });
      res.json({ ok: true, image: filename });
    });
  });

  router.delete('/api/admin/message-boards/:boardId/items/:itemId/image', requireAdmin, (req, res) => {
    const settings = store.getSettings();
    const board = findBoard(settings, req.params.boardId);
    const item = findItem(board, req.params.itemId);
    if (!item) return res.status(404).json({ error: 'message introuvable' });

    const oldFile = item.image;
    item.image = null;
    store.setSettings(settings);
    if (oldFile) fs.rm(path.join(mediaDir, oldFile), { force: true }, () => {});

    broadcast({ type: 'settings', settings });
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createMessagesRouter };
