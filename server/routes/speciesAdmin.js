const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const twitchEvents = require('../twitchEvents');

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const SAFE_IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

// Gestion du catalogue d'avatars depuis le panneau : ajout d'avatars personnalisés (upload d'un
// sprite + un nom) et activer/désactiver n'importe quel avatar (natif ou personnalisé). Les avatars
// natifs (species.js) ne peuvent pas être supprimés, seulement désactivés.
function createSpeciesAdminRouter({ store, requireAdmin, speciesCatalog, spritesDir, follower, broadcast, CHANNEL, CLIENT_ID, CLIENT_SECRET }) {
  const router = express.Router();
  const ownerLogin = (CHANNEL || '').toLowerCase();
  // Avatar perso de la streameuse : réservé à elle seule (géré dans l'onglet "Mon avatar").
  const isOwnerOnly = (s) => s.owners.length === 1 && s.owners[0] === ownerLogin;

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_BYTES },
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) return cb(new Error('Le fichier doit être une image.'));
      cb(null, true);
    },
  });

  router.get('/api/admin/species', requireAdmin, (req, res) => {
    res.json(speciesCatalog.getAll().map((s) => ({ ...s, ownerOnly: isOwnerOnly(s) })));
  });

  // --- Avatars de la streameuse (onglet "Mon avatar") : "mon-avatar" + ceux qu'elle ajoute pour elle ---
  router.get('/api/admin/owner-avatars', requireAdmin, (req, res) => {
    const current = follower.getSkin(ownerLogin).species;
    const list = speciesCatalog.getAll().filter((s) => s.id === 'mon-avatar' || (s.custom && isOwnerOnly(s)))
      .map((s) => ({ id: s.id, label: s.label, src: s.src, custom: !!s.custom, worn: s.id === current }));
    res.json({ list });
  });

  router.post('/api/admin/owner-avatars/wear', requireAdmin, (req, res) => {
    const id = req.body?.speciesId;
    const match = speciesCatalog.getById(id);
    if (id !== 'mon-avatar' && !(match && match.custom && isOwnerOnly(match))) {
      return res.status(400).json({ error: 'avatar introuvable' });
    }
    if (id === 'mon-avatar') store.removeAvatar(ownerLogin);
    else store.setAvatar(ownerLogin, { species: id, hue: 0 });
    broadcast(follower.buildState());
    res.json({ ok: true });
  });

  router.post('/api/admin/species', requireAdmin, (req, res) => {
    upload.single('sprite')(req, res, (err) => {
      if (err) {
        const message = err.code === 'LIMIT_FILE_SIZE' ? `Image trop volumineuse (${MAX_IMAGE_BYTES / 1024 / 1024} Mo max)` : err.message;
        return res.status(400).json({ error: message });
      }
      if (!req.file) return res.status(400).json({ error: 'image manquante ou format invalide' });

      const label = typeof req.body?.label === 'string' ? req.body.label.trim().slice(0, 40) : '';
      if (!label) return res.status(400).json({ error: 'nom manquant' });

      const slugBase = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'avatar';
      let id = slugBase;
      let n = 2;
      while (speciesCatalog.getById(id)) { id = `${slugBase}-${n}`; n += 1; }

      const rawExt = path.extname(req.file.originalname).toLowerCase();
      const ext = SAFE_IMAGE_EXT.has(rawExt) ? rawExt : '.png';
      const filename = `${id}-${crypto.randomBytes(4).toString('hex')}${ext}`;
      fs.writeFileSync(path.join(spritesDir, filename), req.file.buffer);

      store.addCustomSpecies({ id, label, file: filename });
      // forOwner : ajouté depuis l'onglet "Mon avatar", réservé à la streameuse seule.
      const owners = req.body?.forOwner === '1' ? ownerLogin
        : (typeof req.body?.owners === 'string' ? req.body.owners : '');
      if (owners.trim()) setOwners(speciesCatalog.getById(id), owners);
      res.json(speciesCatalog.getById(id));
    });
  });

  router.patch('/api/admin/species/:id', requireAdmin, (req, res) => {
    const match = speciesCatalog.getById(req.params.id);
    if (!match) return res.status(404).json({ error: 'avatar introuvable' });
    if (match.reserved) return res.status(400).json({ error: "cet avatar ne peut pas être désactivé" });
    const { enabled, collection, owners } = req.body || {};
    if (typeof enabled !== 'boolean' && typeof collection !== 'string' && typeof owners !== 'string') {
      return res.status(400).json({ error: 'enabled, collection ou owners manquant' });
    }

    if (typeof enabled === 'boolean') store.setSpeciesEnabled(match.id, enabled);
    if (typeof collection === 'string') store.setSpeciesCollection(match.id, collection.trim().slice(0, 30));
    if (typeof owners === 'string') setOwners(match, owners);
    res.json(speciesCatalog.getById(match.id));
  });

  // Avatar exclusif : réservé aux pseudos donnés (séparés par des virgules ou des espaces, "@" accepté).
  // Ces viewers le voient dans leur page /customize/ et le choisissent s'ils le veulent (rien n'est
  // imposé). Ceux qui le portaient sans y avoir droit (avatar ouvert à tous jusque-là, ou
  // propriétaire retiré) retombent sur leur avatar par défaut.
  function setOwners(match, raw) {
    const logins = [...new Set(raw.split(/[\s,;]+/)
      .map((l) => l.replace(/^@/, '').trim().toLowerCase())
      .filter((l) => /^[a-z0-9_]{1,25}$/.test(l)))];
    store.setSpeciesOwners(match.id, logins);
    if (logins.length) {
      const allowed = new Set(logins);
      for (const [login, skin] of Object.entries(store.getAllAvatars())) {
        if (skin?.species === match.id && !allowed.has(login)) store.removeAvatar(login);
      }
    }
    broadcast(follower.buildState());
  }

  router.delete('/api/admin/species/:id', requireAdmin, async (req, res) => {
    const match = speciesCatalog.getById(req.params.id);
    if (!match) return res.status(404).json({ error: 'avatar introuvable' });
    if (!match.custom) return res.status(400).json({ error: 'seuls les avatars personnalisés peuvent être supprimés' });

    if (match.reward) {
      try {
        const broadcasterId = await follower.ensureBroadcasterId();
        await twitchEvents.deleteCustomReward({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, broadcasterId, rewardId: match.reward.rewardId });
      } catch (err) {
        console.error('[species] échec suppression récompense Twitch:', err.message);
      }
      store.removeSpeciesReward(match.id);
    }
    store.removeCustomSpecies(match.id);
    store.setSpeciesCollection(match.id, '');
    store.setSpeciesOwners(match.id, []);
    if (store.getAvatar(ownerLogin)?.species === match.id) {
      store.removeAvatar(ownerLogin); // elle portait cet avatar : retour à "mon-avatar"
      broadcast(follower.buildState());
    }
    fs.rm(path.join(spritesDir, match.file), { force: true }, () => {});
    res.json({ ok: true });
  });

  // Verrouille un avatar contre des points de chaîne : crée la récompense correspondante sur
  // Twitch (nécessite que l'app ait été autorisée avec le scope channel:manage:redemptions, via
  // /auth) et la relie à cet avatar. Jamais pour "mon avatar" (réservé, pas sélectionnable de toute façon).
  router.post('/api/admin/species/:id/reward', requireAdmin, async (req, res) => {
    const match = speciesCatalog.getById(req.params.id);
    if (!match) return res.status(404).json({ error: 'avatar introuvable' });
    if (match.reserved) return res.status(400).json({ error: 'cet avatar ne peut pas être verrouillé' });

    const cost = Number(req.body?.cost);
    if (!Number.isInteger(cost) || cost < 1 || cost > 1000000) {
      return res.status(400).json({ error: 'coût invalide (entre 1 et 1 000 000 points)' });
    }
    if (!store.getTokens()) {
      return res.status(400).json({ error: "l'app n'est pas encore autorisée sur Twitch — passe par /auth d'abord" });
    }

    try {
      const broadcasterId = await follower.ensureBroadcasterId();
      const title = `Avatar overlay : ${match.label}`.slice(0, 45);
      const reward = await twitchEvents.createCustomReward({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, broadcasterId, title, cost });
      store.setSpeciesReward(match.id, { rewardId: reward.id, cost, title });
      res.json(speciesCatalog.getById(match.id));
    } catch (err) {
      console.error('[species] échec création récompense Twitch:', err.message);
      res.status(500).json({ error: "Échec de la création de la récompense sur Twitch. Vérifie que l'app a bien le droit channel:manage:redemptions (réautorise via /auth si besoin)." });
    }
  });

  router.delete('/api/admin/species/:id/reward', requireAdmin, async (req, res) => {
    const match = speciesCatalog.getById(req.params.id);
    if (!match || !match.reward) return res.status(404).json({ error: 'pas de récompense liée' });

    try {
      const broadcasterId = await follower.ensureBroadcasterId();
      await twitchEvents.deleteCustomReward({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, broadcasterId, rewardId: match.reward.rewardId });
    } catch (err) {
      console.error('[species] échec suppression récompense Twitch:', err.message);
    }
    store.removeSpeciesReward(match.id);
    res.json(speciesCatalog.getById(match.id));
  });

  return router;
}

module.exports = { createSpeciesAdminRouter };
