// Mascotte "Tamagotchi" : humeur, réactions, actions déclenchables par les followers via le chat.
// Regroupé en un seul module indépendant — le reste du serveur n'a besoin que de boostTamagotchi(),
// broadcastReaction() et handleChatMessage() pour l'intégrer, sans connaître les détails internes.
function createTamagotchiService({ store, broadcast }) {
  let mood = store.getTamagotchiState().mood;

  function boost(amount) {
    mood = Math.max(0, Math.min(100, mood + amount));
    store.setTamagotchiState({ mood, updatedAt: Date.now() });
    broadcast({ type: 'tamagotchi', mood });
  }

  function broadcastReaction(reaction) {
    if (!reaction || reaction === 'none') return;
    broadcast({ type: 'tamagotchi-reaction', reaction });
  }

  setInterval(() => {
    boost(-store.getSettings().tamagotchi.decayPerMinute);
  }, 60 * 1000).unref();

  // clé "action:login" -> dernier déclenchement, pour le cooldown des actions de chat par viewer
  const actionCooldowns = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, ts] of actionCooldowns) {
      if (now - ts > 60 * 60 * 1000) actionCooldowns.delete(key);
    }
  }, 30 * 60 * 1000).unref();

  // Appelé pour chaque message de chat reçu : boost passif + commandes !caresse/!nourrir/!jouer.
  // isFollower doit avoir été déterminé par l'appelant (seuls les followers peuvent déclencher une action).
  function handleChatMessage(login, message, isFollower) {
    const t = store.getSettings().tamagotchi;
    boost(t.boostChat);
    if (!isFollower) return;

    const text = message.trim().toLowerCase();
    for (const [actionId, action] of Object.entries(t.chatActions)) {
      if (!action.enabled || text !== action.command) continue;
      const cooldownKey = `${actionId}:${login}`;
      const lastUse = actionCooldowns.get(cooldownKey) || 0;
      if (Date.now() - lastUse < action.cooldownSeconds * 1000) break;
      actionCooldowns.set(cooldownKey, Date.now());
      boost(action.boost);
      broadcastReaction(action.reaction);
      break;
    }
  }

  function handleTwitchEvent(kind) {
    const t = store.getSettings().tamagotchi;
    const boostByKind = { follow: t.boostFollow, subscribe: t.boostSub, cheer: t.boostCheer, raid: t.boostRaid };
    boost(boostByKind[kind] || 0);
    broadcastReaction(t.eventReactions[kind]);
  }

  return {
    getMood: () => mood,
    boost,
    broadcastReaction,
    handleChatMessage,
    handleTwitchEvent,
  };
}

module.exports = { createTamagotchiService };
