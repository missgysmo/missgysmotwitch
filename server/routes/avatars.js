const express = require('express');
const species = require('../species');

// Personnalisation d'avatar (page /customize/) : consultation + choix d'un skin, réservé aux followers.
function createAvatarsRouter({ store, publicApiRateLimit, broadcast, follower }) {
  const router = express.Router();

  router.get('/api/species', (req, res) => {
    res.json(species.getSelectable().map((s) => ({ id: s.id, label: s.label, file: s.file })));
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
    const match = species.getById(speciesId);
    if (!match || match.reserved) return res.status(400).json({ error: 'species invalide' });

    const hueValue = Number.isFinite(hue) ? ((hue % 360) + 360) % 360 : 0;
    const skin = store.setAvatar(login, { species: speciesId, hue: hueValue });
    broadcast(follower.buildState());
    res.json(skin);
  });

  return router;
}

module.exports = { createAvatarsRouter };
