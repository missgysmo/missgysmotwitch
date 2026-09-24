// Commandes de chat personnalisées (soundboard) : le streamer définit des mots-déclencheurs,
// chacun jouant soit un son seul, soit une vidéo+son visible de tout le monde sur l'overlay.
// Chaque commande peut être réservée au streamer ou ouverte à tous les followers.
function createCustomCommandsService({ store, broadcast, isChannelOwner }) {
  // commande.id -> dernier déclenchement (cooldown global par commande, pas par viewer — une vidéo
  // qui se déclenche en rafale à cause de plusieurs followers différents serait bien plus gênante
  // qu'un simple son, donc un seul cooldown partagé protège mieux qu'un cooldown par personne).
  const cooldowns = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [id, ts] of cooldowns) {
      if (now - ts > 60 * 60 * 1000) cooldowns.delete(id);
    }
  }, 30 * 60 * 1000).unref();

  function handleChatMessage(login, message, isFollower) {
    const text = message.trim().toLowerCase();
    const commands = store.getSettings().customCommands;
    for (const cmd of commands) {
      if (!cmd.enabled || !cmd.media || text !== cmd.command) continue;
      const allowed = isChannelOwner(login) || (cmd.followersAllowed && isFollower);
      if (!allowed) continue;

      const last = cooldowns.get(cmd.id) || 0;
      if (Date.now() - last < cmd.cooldownSeconds * 1000) return;
      cooldowns.set(cmd.id, Date.now());

      broadcast({ type: 'custom-command', id: cmd.id, mediaType: cmd.type, media: cmd.media, label: cmd.label });
      return;
    }
  }

  return { handleChatMessage };
}

module.exports = { createCustomCommandsService };
