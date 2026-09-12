const express = require('express');
const path = require('path');

// Connexion/déconnexion au dashboard + service de la bonne page HTML selon l'état de session.
function createAdminAuthRouter({ isAdmin, safePasswordEquals, ADMIN_TOKEN, ADMIN_COOKIE, loginRateLimit }) {
  const router = express.Router();

  router.get(['/settings', '/settings/'], (req, res) => {
    const file = isAdmin(req) ? 'panel.html' : 'login.html';
    res.sendFile(path.join(__dirname, '..', '..', 'public', 'settings', file));
  });

  router.post('/api/admin/login', loginRateLimit, (req, res) => {
    if (!safePasswordEquals(req.body?.password)) return res.status(401).json({ error: 'mot de passe incorrect' });
    res.cookie(ADMIN_COOKIE, ADMIN_TOKEN, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ ok: true });
  });

  router.post('/api/admin/logout', (req, res) => {
    res.clearCookie(ADMIN_COOKIE);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createAdminAuthRouter };
