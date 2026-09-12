const express = require('express');
const crypto = require('crypto');
const spotifyEvents = require('../spotifyEvents');

// OAuth Spotify + sondage périodique du titre en cours (module "musique en cours").
// Le router expose getLastTrack() car index.js en a besoin pour l'envoi initial aux overlays
// qui se (re)connectent en WebSocket.
function createSpotifyRouter({ store, requireAdmin, broadcast, logError, clientId, clientSecret, redirectUri }) {
  const router = express.Router();
  const spotifyStore = { getTokens: store.getSpotifyTokens, setTokens: store.setSpotifyTokens };

  let oauthState = null;
  let lastTrackKey;
  let lastTrack = null;

  router.get('/api/admin/spotify-status', requireAdmin, (req, res) => {
    res.json({ connected: !!store.getSpotifyTokens(), configured: !!(clientId && clientSecret) });
  });

  router.get('/auth/spotify', requireAdmin, (req, res) => {
    if (!clientId || !clientSecret) {
      return res.status(500).send("SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET manquant(s) dans les variables d'environnement.");
    }
    oauthState = crypto.randomBytes(16).toString('hex');
    const url = spotifyEvents.getAuthUrl({ clientId, redirectUri, state: oauthState });
    res.redirect(url);
  });

  router.get('/auth/spotify/callback', async (req, res) => {
    const { code, state } = req.query;
    if (!code || state !== oauthState) return res.status(400).send('État OAuth invalide.');
    try {
      const tokens = await spotifyEvents.exchangeCode({ clientId, clientSecret, redirectUri, code });
      store.setSpotifyTokens(tokens);
      res.send("Spotify connecté ! Le titre en cours apparaîtra sur l'overlay si le module est activé. Tu peux fermer cet onglet.");
      console.log('[spotify] token obtenu et sauvegardé.');
    } catch (err) {
      console.error('[spotify] échec échange de code:', err.message);
      res.status(500).send("Échec de l'autorisation Spotify, voir les logs serveur.");
    }
  });

  // Interroge Spotify toutes les 8s pour savoir ce qui est en écoute, et ne diffuse
  // que lorsque ça change (nouveau titre, pause/lecture) pour ne pas spammer l'overlay.
  async function poll() {
    const settings = store.getSettings();
    if (!settings.nowPlaying.enabled || !clientId || !clientSecret || !store.getSpotifyTokens()) return;
    try {
      const track = await spotifyEvents.getCurrentlyPlaying(spotifyStore, { clientId, clientSecret });
      const key = track ? `${track.trackId}:${track.isPlaying}` : null;
      if (key !== lastTrackKey) {
        lastTrackKey = key;
        lastTrack = track;
        broadcast({ type: 'now-playing', track });
      }
    } catch (err) {
      logError('spotify-poll', err);
    }
  }

  function startPolling() {
    setInterval(poll, 8000).unref();
  }

  return { router, startPolling, getLastTrack: () => lastTrack };
}

module.exports = { createSpotifyRouter };
