const express = require('express');

const JOIN_WORDS = ['join', 'joined', 'arrive', 'arrivee', 'arrivée', 'enter', 'in'];
const PART_WORDS = ['part', 'leave', 'left', 'quit', 'depart', 'départ', 'exit', 'out'];

// Dashboard "Allées et venues" + adresse de réception pour Twitchat.
function createAttendanceRouter({ requireAdmin, attendance }) {
  const router = express.Router();

  router.get('/api/admin/attendance', requireAdmin, (req, res) => {
    res.json(attendance.getState());
  });

  router.post('/api/admin/attendance/ignored', requireAdmin, (req, res) => {
    const { list } = req.body || {};
    if (!Array.isArray(list)) return res.status(400).json({ error: 'liste invalide' });
    attendance.setIgnored(list);
    res.json(attendance.getState());
  });

  router.delete('/api/admin/attendance/viewer/:login', requireAdmin, (req, res) => {
    attendance.removeViewer(req.params.login);
    res.json(attendance.getState());
  });

  // Twitchat (déclencheur → action "requête HTTP") : GET ou POST, paramètres dans l'URL ou en JSON.
  //   ...?key=CLÉ&event=join&user=pseudo   (event : join / part)
  // Passe par le même compteur que le tchat du bot : une arrivée déjà vue n'est pas recomptée.
  function handleTwitchat(req, res) {
    const p = { ...req.query, ...(req.body && typeof req.body === 'object' ? req.body : {}) };
    if (!attendance.checkTwitchatKey(p.key)) return res.status(403).json({ error: 'clé invalide' });
    const login = String(p.user || p.login || p.pseudo || '').trim().replace(/^@/, '').toLowerCase();
    const event = String(p.event || p.type || '').trim().toLowerCase();
    if (!/^[a-z0-9_]{1,25}$/.test(login)) return res.status(400).json({ error: 'pseudo invalide' });
    if (JOIN_WORDS.includes(event)) attendance.handleJoin(login);
    else if (PART_WORDS.includes(event)) attendance.handlePart(login);
    else return res.status(400).json({ error: 'event doit valoir join ou part' });
    res.json({ ok: true });
  }
  router.get('/api/attendance/twitchat', handleTwitchat);
  router.post('/api/attendance/twitchat', express.urlencoded({ extended: false }), handleTwitchat);

  return router;
}

module.exports = { createAttendanceRouter };
