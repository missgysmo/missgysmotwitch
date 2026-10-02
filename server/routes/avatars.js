const express = require('express');

// Personnalisation d'avatar (page /customize/) : consultation + choix d'un skin, réservé aux followers.
function createAvatarsRouter({ store, publicApiRateLimit, broadcast, follower, speciesCatalog }) {
  const router = express.Router();

  router.get('/api/species', (req, res) => {
    const login = typeof req.query.login === 'string' ? req.query.login.trim().toLowerCase() : '';
    if (!login) {
      // Pas de viewer précis : uniquement les avatars gratuits (jamais un verrouillé par erreur).
      return res.json(speciesCatalog.getSelectable().map((s) => ({ id: s.id, label: s.label, src: s.src })));
    }
    const unlocked = new Set(store.getUnlockedAvatars(login));
    const list = speciesCatalog.getAll()
      .filter((s) => !s.reserved && s.enabled)
      .map((s) => ({
        id: s.id, label: s.label, src: s.src,
        locked: !!s.reward, cost: s.reward?.cost || null, unlocked: !s.reward || unlocked.has(s.id),
      }));
    res.json(list);
  });

  router.get('/api/avatar/:login', publicApiRateLimit, async (req, res) => {
    const login = req.params.login;
    const skin = follower.getSkin(login);
    const follows = follower.isChannelOwner(login) ? true : await follower.checkAndCacheFollower(login);
    res.json({ ...skin, follows });
  });

  router.post('/api/avatar/:login', publicApiRateLimit, async (req, res) => {
    const login = req.params.login;
    if (follower.isChannelOwner(login)) {
      return res.status(403).json({ error: 'Cet avatar est réservé, il ne peut pas être personnalisé.' });
    }

    const follows = await follower.checkAndCacheFollower(login);
    if (!follows) {
      return res.status(403).json({ error: 'Tu dois suivre la chaîne sur Twitch pour personnaliser un avatar.' });
    }

    const { speciesId, hue } = req.body;
    if (!speciesCatalog.isAvailableFor(login, speciesId)) {
      return res.status(400).json({ error: 'species invalide ou pas encore débloqué' });
    }

    const hueValue = Number.isFinite(hue) ? ((hue % 360) + 360) % 360 : 0;
    const skin = store.setAvatar(login, { species: speciesId, hue: hueValue });
    broadcast(follower.buildState());
    res.json(skin);
  });

  return router;
}

module.exports = { createAvatarsRouter };
