const { firstWord } = require('./lib/chatCommand');

// Commandes de chat personnalisées (soundboard) : le streamer définit des mots-déclencheurs,
// chacun jouant soit un son seul, soit une vidéo+son visible de tout le monde sur l'overlay.
// Chaque commande peut être réservée au streamer ou ouverte aux followers (+ VIP et modos).
function createCustomCommandsService({ store, broadcast, follower }) {
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

  // Les VIP et modos passent même s'ils ne suivent pas la chaîne. Pour les autres, on attend la
  // réponse de Twitch si le statut follower n'est pas encore connu (avant : refusé d'office au
  // premier message d'un viewer, le temps que la vérification en arrière-plan se termine).
  async function isAllowed(cmd, login, meta) {
    if (follower.isChannelOwner(login) || meta.isBroadcaster) return true;
    if (!cmd.followersAllowed) return false;
    if (meta.isVip || meta.isMod) return true;
    return follower.isFollowerFresh(login);
  }

  async function handleChatMessage(login, message, meta = {}) {
    const word = firstWord(message);
    if (!word.startsWith('!')) return;
    const cmd = store.getSettings().customCommands.find((c) => c.enabled && c.media && c.command === word);
    if (!cmd) return;
    if (!(await isAllowed(cmd, login, meta))) return;

    const last = cooldowns.get(cmd.id) || 0;
    if (Date.now() - last < cmd.cooldownSeconds * 1000) return;
    cooldowns.set(cmd.id, Date.now());

    broadcast({
      type: 'custom-command', id: cmd.id, mediaType: cmd.type, media: cmd.media, label: cmd.label, volume: cmd.volume ?? 100,
    });
  }

  return { handleChatMessage };
}

module.exports = { createCustomCommandsService };
