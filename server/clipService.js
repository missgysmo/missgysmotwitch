// Clips à la demande via la fonction native de Twitch (scope clips:edit) : pas d'OBS, pas de tunnel,
// pas de logiciel à lancer — Twitch génère le clip côté serveur à partir de son propre buffer vidéo.
// Remplace une première tentative basée sur OBS WebSocket, abandonnée car elle demandait un tunnel
// (ngrok) pour que le serveur (hébergé sur Railway) atteigne OBS sur le PC de la streameuse.
function createClipService({ store, broadcast, twitchEvents, follower, logError, CLIENT_ID, CLIENT_SECRET }) {
  let lastClipAt = 0;

  async function triggerClip() {
    const broadcasterId = await follower.ensureBroadcasterId();
    if (!store.getTokens() || !broadcasterId) {
      throw new Error('App Twitch pas encore autorisée (ou autorisation trop ancienne) — repasse par /auth.');
    }
    const clip = await twitchEvents.createClip({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, broadcasterId });
    broadcast({ type: 'clip-created', id: clip.id, editUrl: clip.editUrl });
    return clip;
  }

  // Déclenché depuis le tchat (ex: "!clip"), avec un cooldown global (pas par viewer) pour ne pas
  // enchaîner des créations de clip en rafale si plusieurs viewers tapent la commande.
  async function handleChatMessage(login, message, isFollower) {
    const cfg = store.getSettings().clipCommand;
    if (!cfg.enabled || message.trim().toLowerCase() !== cfg.command) return;
    const allowed = follower.isChannelOwner(login) || (cfg.followersAllowed && isFollower);
    if (!allowed) return;
    if (Date.now() - lastClipAt < cfg.cooldownSeconds * 1000) return;
    lastClipAt = Date.now();

    try {
      await triggerClip();
    } catch (err) {
      logError('clip-chat', err);
    }
  }

  return { triggerClip, handleChatMessage };
}

module.exports = { createClipService };
