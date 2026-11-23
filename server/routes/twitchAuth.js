const express = require('express');
const crypto = require('crypto');
const twitchEvents = require('../twitchEvents');

const RECENT_ACTIVITY_MAX = 40;

// OAuth Twitch, démarrage d'EventSub, et le fil d'activité (follow/sub/cheer/raid) qui en découle.
// startEventSub() réutilise follower.ensureBroadcasterId() au lieu de refaire son propre lookup —
// avant cette extraction, une variable locale masquait par erreur le cache partagé du broadcasterId,
// causant un appel Twitch redondant à chaque tout premier check de follower après le démarrage.
function createTwitchAuthRouter({ store, broadcast, follower, tamagotchi, botHealth, logError, speciesCatalog, onRaid, CHANNEL, CLIENT_ID, CLIENT_SECRET, REDIRECT_URI }) {
  const router = express.Router();
  const recentActivity = []; // { kind, displayName, login, extra, ts } — remis à zéro à chaque redémarrage

  let oauthState = null;

  router.get('/auth', (req, res) => {
    oauthState = crypto.randomBytes(16).toString('hex');
    const url = twitchEvents.getAuthUrl({ clientId: CLIENT_ID, redirectUri: REDIRECT_URI, state: oauthState });
    res.redirect(url);
  });

  router.get('/auth/callback', async (req, res) => {
    const { code, state } = req.query;
    if (!code || state !== oauthState) return res.status(400).send('État OAuth invalide.');
    try {
      const tokens = await twitchEvents.exchangeCode({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, redirectUri: REDIRECT_URI, code });
      store.setTokens(tokens);
      res.send('Autorisation Twitch réussie. Redémarre le serveur pour activer les events (follow/sub/cheer/raid). Tu peux fermer cet onglet.');
      console.log('[auth] token obtenu et sauvegardé, redémarre le serveur pour activer EventSub.');
    } catch (err) {
      logError('auth-callback', err);
      res.status(500).send(`Échec de l'autorisation Twitch : ${err.message}`);
    }
  });

  // Alimente le fil "activité récente" (session en cours) + la liste persistante des followers/subs,
  // boost/réaction de la mascotte, et fiche mémoire pour les raids — puis diffuse aux overlays.
  // manual: ajout à la main depuis le dashboard → met à jour les listes et "derniers événements",
  // sans réaction de la mascotte ni shoutout de raid (l'événement est déjà passé).
  function recordActivity(type, event, { manual = false } = {}) {
    let kind, displayName, login, extra = null;
    if (type === 'channel.follow') {
      kind = 'follow';
      displayName = event.user_name;
      login = event.user_login;
      store.addPerson('followers', login, displayName);
      follower.markFollower(login);
    } else if (type === 'channel.subscribe') {
      kind = 'subscribe';
      displayName = event.user_name;
      login = event.user_login;
      if (event.is_resub) {
        // Re-sub : remonte en tête de la liste des subs du dashboard, avec son ancienneté.
        extra = event.cumulative_months ? `${event.cumulative_months} mois` : 're-sub';
        store.addPerson('subs', login, displayName, undefined, extra, { bump: true });
      } else {
        store.addPerson('subs', login, displayName);
      }
    } else if (type === 'channel.cheer') {
      kind = 'cheer';
      displayName = event.user_name;
      login = event.user_login;
      extra = event.bits;
      store.addPerson('cheers', login, displayName, undefined, extra);
    } else if (type === 'channel.raid') {
      kind = 'raid';
      displayName = event.from_broadcaster_user_name;
      login = event.from_broadcaster_user_login;
      extra = event.viewers;
      store.addPerson('raids', login, displayName, undefined, extra);
    } else if (type === 'streamlabs.donation') {
      // Pas de store.addPerson ici : un don Streamlabs n'est pas forcément lié à un compte Twitch
      // (nom libre saisi sur la page de don), donc pas de pseudo fiable pour la liste followers/subs.
      kind = 'donation';
      displayName = event.user_name;
      login = null;
      extra = `${event.amount}${event.currency || ''}`;
      const total = store.addDonationAmount(event.amount);
      broadcast({ type: 'donation-total', total });
    } else {
      return;
    }
    recentActivity.unshift({ kind, displayName, login, extra, ts: Date.now() });
    if (recentActivity.length > RECENT_ACTIVITY_MAX) recentActivity.length = RECENT_ACTIVITY_MAX;
    broadcast({ type: 'activity', recent: recentActivity, people: store.getPeople() });

    // Persisté sur disque (contrairement à recentActivity ci-dessus) pour que l'affichage
    // permanent "Dernier follow/sub/bits/raid" survive aux redémarrages du serveur. Diffusé via
    // son propre message (pas 'event' ci-dessus, volontairement réservé aux alertes/tests) pour
    // que les overlays déjà connectés se mettent à jour tout de suite, sans attendre une reconnexion.
    store.setLastEvent(kind, { eventType: type, event, ts: Date.now() });
    broadcast({ type: 'last-event-preview', eventType: type, event });

    if (manual) return;
    tamagotchi.handleTwitchEvent(kind);

    if (kind === 'raid' && login) {
      twitchEvents.getChannelInfo({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, login })
        .then((info) => broadcast({ type: 'raid-card', ...info, viewers: extra }))
        .catch((err) => logError('raid-card', err));
      if (onRaid) onRaid(login);
    }
  }

  // Débloque un avatar saisonnier quand le viewer échange la récompense à points correspondante.
  // Ignore silencieusement les redemptions d'autres récompenses (le streamer peut en avoir
  // d'autres, sans rapport avec les avatars) — ne touche que celles qu'on a nous-même créées.
  //
  // Le viewer a déjà l'avatar → échange remboursé (CANCELED) + message dans le tchat.
  // Sinon → avatar débloqué, échange validé (FULFILLED) + message de confirmation.
  // Un échange déjà "fulfilled" à l'arrivée (ancienne récompense encore en validation automatique)
  // ne peut plus être remboursé : on prévient juste le viewer.
  const customizeUrl = process.env.PUBLIC_URL
    ? `${process.env.PUBLIC_URL.replace(/\/+$/, '')}/customize/`
    : (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/customize/` : null);

  async function handleRewardRedemption(event) {
    const rewards = store.getSpeciesRewards();
    const entry = Object.entries(rewards).find(([, r]) => r.rewardId === event.reward.id);
    if (!entry) return;
    const [speciesId] = entry;
    const login = event.user_login;
    const name = event.user_name || login;
    const label = speciesCatalog?.getById(speciesId)?.label || speciesId;
    const pending = event.status === 'unfulfilled';
    const alreadyOwned = store.getUnlockedAvatars(login).includes(speciesId);

    let message;
    if (alreadyOwned) {
      let refunded = false;
      if (pending) {
        refunded = await setRedemptionStatus(event, 'CANCELED');
      }
      message = refunded
        ? `@${name} tu as déjà l'avatar ${label}, tes ${event.reward.cost} points t'ont été remboursés.`
        : `@${name} tu avais déjà l'avatar ${label}.`;
      console.log(`[avatars] ${login} a réclamé "${speciesId}" déjà débloqué (${refunded ? 'remboursé' : 'non remboursé'}).`);
    } else {
      store.unlockAvatarForUser(login, speciesId);
      if (pending) await setRedemptionStatus(event, 'FULFILLED');
      message = `@${name} a débloqué l'avatar ${label} ! 🎉 ${customizeUrl ? `Choisis-le ici : ${customizeUrl}` : 'Tu peux le choisir sur la page de personnalisation.'}`;
      console.log(`[avatars] ${login} a débloqué l'avatar "${speciesId}" contre des points.`);
    }

    try {
      const broadcasterId = await follower.ensureBroadcasterId();
      await twitchEvents.sendChatMessage({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, broadcasterId, message });
    } catch (err) {
      logError('avatar-reward-chat', err);
    }
  }

  async function setRedemptionStatus(event, status) {
    try {
      await twitchEvents.updateRedemptionStatus({
        clientId: CLIENT_ID, clientSecret: CLIENT_SECRET,
        broadcasterId: event.broadcaster_user_id, rewardId: event.reward.id, redemptionId: event.id, status,
      });
      return true;
    } catch (err) {
      logError('avatar-reward-status', err);
      return false;
    }
  }

  // Les récompenses créées avant le remboursement automatique étaient en validation automatique
  // (impossible à rembourser) : on les repasse en "en attente" au démarrage. Sans effet si déjà fait.
  async function migrateAvatarRewards(broadcasterId) {
    for (const [speciesId, reward] of Object.entries(store.getSpeciesRewards())) {
      try {
        await twitchEvents.updateCustomReward({
          clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, broadcasterId, rewardId: reward.rewardId,
          fields: { should_redemptions_skip_request_queue: false },
        });
      } catch (err) {
        console.error(`[avatars] impossible de mettre à jour la récompense de "${speciesId}":`, err.message);
      }
    }
  }

  // --- Re-subs : EventSub (channel.subscription.message) + secours par l'annonce dans le tchat ---
  // Les deux arrivent normalement pour le même re-sub : on n'en traite qu'un par viewer et par
  // fenêtre de 10 minutes. Le tchat attend 20 s pour laisser la priorité à EventSub.
  const RESUB_DEDUP_MS = 10 * 60 * 1000;
  const recentResubs = new Map(); // login -> timestamp du re-sub déjà traité
  function alreadyHandledResub(login) {
    const ts = recentResubs.get(login);
    return ts && Date.now() - ts < RESUB_DEDUP_MS;
  }

  function handleChatResub({ login, displayName, months, message }) {
    setTimeout(() => {
      if (alreadyHandledResub(login)) return;
      recentResubs.set(login, Date.now());
      console.log(`[twitchChat] re-sub de ${login} capté par le tchat (EventSub ne l'a pas envoyé)`);
      const event = {
        user_login: login, user_name: displayName, cumulative_months: months,
        is_gift: false, is_resub: true, message_text: message, source: 'chat',
      };
      broadcast({ type: 'event', eventType: 'channel.subscribe', event, cast: follower.buildCast() });
      recordActivity('channel.subscribe', event);
    }, 20 * 1000);
  }

  async function startEventSub() {
    const tokens = store.getTokens();
    if (!tokens) {
      console.log('[twitchEvents] pas encore autorisé — ouvre /auth pour connecter les events follow/sub/cheer/raid.');
      return;
    }
    try {
      const broadcasterId = await follower.ensureBroadcasterId();
      await twitchEvents.connectEventSub({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        broadcasterId,
        onEvent: (rawType, rawEvent) => {
          console.log(`[twitchEvents] event reçu: ${rawType}`);
          // Un re-sub est traité exactement comme un sub (même alerte, "dernier sub", fil d'activité,
          // liste des subs) : on le convertit en channel.subscribe, en gardant ses infos de re-sub.
          const isResub = rawType === 'channel.subscription.message';
          const type = isResub ? 'channel.subscribe' : rawType;
          const event = isResub
            ? { ...rawEvent, is_gift: false, is_resub: true, message_text: rawEvent.message?.text || '' }
            : rawEvent;
          if (isResub) {
            const login = (rawEvent.user_login || '').toLowerCase();
            if (alreadyHandledResub(login)) return; // déjà affiché via le tchat
            recentResubs.set(login, Date.now());
          }
          if (type === 'channel.channel_points_custom_reward_redemption.add') {
            handleRewardRedemption(event).catch((err) => logError('avatar-reward', err));
            return;
          }
          broadcast({ type: 'event', eventType: type, event, cast: follower.buildCast() });
          recordActivity(type, event);
        },
        onStatusChange: (connected) => {
          botHealth.eventSubConnected = connected;
          if (!connected) logError('twitchEvents', new Error("Déconnecté d'EventSub"));
        },
      });
      migrateAvatarRewards(broadcasterId);
    } catch (err) {
      console.error('[twitchEvents] échec démarrage EventSub:', err.message);
    }
  }

  return { router, startEventSub, getRecentActivity: () => recentActivity, recordActivity, handleChatResub };
}

module.exports = { createTwitchAuthRouter };
