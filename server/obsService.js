const { OBSWebSocket } = require('obs-websocket-js');

// Connexion au WebSocket d'OBS (natif depuis OBS 28+, à activer dans Outils > Paramètres du
// serveur WebSocket) pour déclencher un clip à la demande via le "Replay Buffer" d'OBS : Sauvegarder
// le replay buffer sauvegarde en fait les N dernières secondes déjà enregistrées en continu, donc il
// doit être activé et démarré dans OBS (Paramètres > Sortie > Replay Buffer) pour que ça fonctionne.
function createObsService({ store, broadcast, logError, isChannelOwner }) {
  const obs = new OBSWebSocket();
  let connected = false;
  let lastClipAt = 0;

  obs.on('ConnectionClosed', () => { connected = false; });
  obs.on('ConnectionError', (err) => {
    connected = false;
    logError('obs', new Error(`connexion échouée : ${err.message}`));
  });
  obs.on('ReplayBufferSaved', (data) => {
    broadcast({ type: 'clip-created', path: data.savedReplayPath });
  });

  async function connect() {
    const cfg = store.getObsConfig();
    if (!cfg) return;
    try {
      await obs.connect(`ws://${cfg.host}:${cfg.port}`, cfg.password || undefined);
      connected = true;
    } catch (err) {
      connected = false;
      logError('obs', new Error(`connexion échouée : ${err.message}`));
    }
  }

  async function disconnect() {
    try { await obs.disconnect(); } catch { /* déjà déconnecté, rien à faire */ }
    connected = false;
  }

  function isConnected() {
    return connected;
  }

  async function triggerClip() {
    if (!connected) throw new Error("OBS n'est pas connecté.");
    const status = await obs.call('GetReplayBufferStatus');
    if (!status.outputActive) {
      throw new Error('Le "Replay Buffer" n\'est pas activé dans OBS (Paramètres > Sortie > Replay Buffer).');
    }
    await obs.call('SaveReplayBuffer');
  }

  // Déclenché depuis le tchat (ex: "!clip"), avec un cooldown global (pas par viewer) pour ne pas
  // enchaîner des sauvegardes de replay buffer en rafale si plusieurs viewers tapent la commande.
  async function handleChatMessage(login, message, isFollower) {
    const cfg = store.getSettings().clipCommand;
    if (!cfg.enabled || message.trim().toLowerCase() !== cfg.command) return;
    const allowed = isChannelOwner(login) || (cfg.followersAllowed && isFollower);
    if (!allowed) return;
    if (Date.now() - lastClipAt < cfg.cooldownSeconds * 1000) return;
    lastClipAt = Date.now();

    try {
      await triggerClip();
    } catch (err) {
      logError('obs-clip', err);
    }
  }

  // Démarre la connexion si une config a déjà été enregistrée avant ce redémarrage du serveur.
  connect();

  return { connect, disconnect, isConnected, triggerClip, handleChatMessage };
}

module.exports = { createObsService };
