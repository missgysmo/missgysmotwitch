const express = require('express');
const { generateTitleIdeas } = require('../titleIdeas');
const { generateSocialPosts } = require('../socialPosts');

// Générateurs 100% locaux (titres de stream, posts réseaux sociaux) — aucune API externe.
function createSocialRouter({ store, requireAdmin }) {
  const router = express.Router();

  router.post('/api/admin/title-ideas', requireAdmin, (req, res) => {
    const { game, keywords, mood } = req.body || {};
    if (typeof game !== 'string' || typeof keywords !== 'string' || game.length > 80 || keywords.length > 200) {
      return res.status(400).json({ error: 'entrée invalide' });
    }
    res.json(generateTitleIdeas({ game, keywords, mood }));
  });

  router.post('/api/admin/social-posts', requireAdmin, (req, res) => {
    const { game, message, mood, moment } = req.body || {};
    if ([game, message, mood, moment].some((v) => v !== undefined && typeof v !== 'string')) {
      return res.status(400).json({ error: 'entrée invalide' });
    }
    if ((game || '').length > 80 || (message || '').length > 200) {
      return res.status(400).json({ error: 'entrée invalide' });
    }
    const { socialLinks, socialPlatforms } = store.getSettings();
    res.json(generateSocialPosts({ game, message, mood, moment, links: socialLinks, platforms: socialPlatforms }));
  });

  return router;
}

module.exports = { createSocialRouter };
