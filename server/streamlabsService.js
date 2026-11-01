const io = require('socket.io-client');

// Connexion au Socket API de Streamlabs (don caritatif) : écoute les donations en temps réel et les
// relaie vers le même pipeline que les events Twitch (alerte + activité récente + mascotte), pour
// réutiliser toute l'infra existante (textes/couleurs/son configurables, "dernier don" permanent...).
// Le token Streamlabs est un secret statique collé par la streameuse (pas d'OAuth ici), donc gardé à
// part de settings.json (comme les tokens Twitch/Spotify) plutôt que renvoyé par /api/settings.
function createStreamlabsService({ store, broadcast, follower, recordActivity, logError }) {
  let socket = null;

  function isConnected() {
    return !!(socket && socket.connected);
  }

  function disconnect() {
    if (socket) {
      socket.removeAllListeners();
      socket.close();
      socket = null;
    }
  }

  function connect() {
    disconnect();
    const token = store.getStreamlabsToken();
    if (!token) return;

    socket = io(`https://sockets.streamlabs.com?token=${token}`, { transports: ['websocket'] });

    socket.on('event', (eventData) => {
      if (eventData?.type !== 'donation' || !Array.isArray(eventData.message)) return;
      for (const donation of eventData.message) {
        const event = {
          user_name: donation.name || 'Quelqu\'un',
          amount: donation.amount,
          currency: donation.currency || '',
          message: donation.message || '',
        };
        broadcast({ type: 'event', eventType: 'streamlabs.donation', event, cast: follower.buildCast() });
        recordActivity('streamlabs.donation', event);
      }
    });

    socket.on('connect_error', (err) => {
      logError('streamlabs', new Error(`connexion échouée : ${err.message}`));
    });
  }

  // Démarre la connexion si un token a déjà été enregistré avant ce redémarrage du serveur.
  connect();

  return { connect, disconnect, isConnected };
}

module.exports = { createStreamlabsService };
