// Shoutout ("!so @pseudo") : message dans le tchat + shoutout officiel Twitch + fiche sur l'overlay
// (même fiche visuelle que pour les raids, réglée dans l'onglet "Fiche raid"). Réservé au streamer
// et, si activé, aux modérateurs et/ou aux VIP. Peut aussi se déclencher automatiquement à chaque raid reçu.
//
// Scopes Twitch nécessaires : user:write:chat (message) et moderator:manage:shoutouts (officiel).
// Les deux envois sont indépendants : si l'un échoue (ex. shoutout officiel hors live, ou
// limite Twitch d'un shoutout toutes les 2 min), l'autre part quand même.
const { firstWord, argsAfterCommand } = require('./lib/chatCommand');

const LOGIN_RE = /^[a-zA-Z0-9_]{1,25}$/;

function fillTemplate(template, info) {
  return template
    .replace(/\{name\}/g, info.displayName || info.login)
    .replace(/\{login\}/g, info.login)
    .replace(/\{url\}/g, `https://twitch.tv/${info.login}`)
    .replace(/\{game\}/g, info.game || 'un jeu mystère')
    .replace(/\{title\}/g, info.title || '');
}

function createShoutoutService({ store, broadcast, twitchEvents, follower, logError, CLIENT_ID, CLIENT_SECRET }) {
  let lastShoutoutAt = 0;

  // Renvoie un compte rendu de chaque étape (pour le bouton "Tester" du dashboard), sans jamais
  // lever d'erreur pour un échec partiel : seule une cible introuvable/invalide fait échouer.
  async function triggerShoutout(rawLogin) {
    const login = String(rawLogin || '').trim().replace(/^@/, '').toLowerCase();
    if (!LOGIN_RE.test(login)) throw new Error('Pseudo Twitch invalide.');
    const broadcasterId = await follower.ensureBroadcasterId();
    if (!store.getTokens() || !broadcasterId) {
      throw new Error('App Twitch pas encore autorisée — repasse par /auth.');
    }

    const cfg = store.getSettings().shoutout;
    const info = await twitchEvents.getChannelInfo({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, login });
    const report = { target: info.displayName, chat: 'désactivé', official: 'désactivé', card: 'désactivée' };

    if (cfg.sendChatMessage) {
      try {
        await twitchEvents.sendChatMessage({
          clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, broadcasterId, message: fillTemplate(cfg.message, info),
        });
        report.chat = 'envoyé';
      } catch (err) {
        report.chat = `échec : ${err.message}`;
        logError('shoutout-chat', err);
      }
    }

    if (cfg.officialShoutout) {
      try {
        await twitchEvents.sendShoutout({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, broadcasterId, targetId: info.id });
        report.official = 'envoyé';
      } catch (err) {
        report.official = `échec : ${err.message}`;
        logError('shoutout-official', err);
      }
    }

    if (cfg.showCard) {
      broadcast({ type: 'shoutout-card', ...info });
      report.card = 'affichée';
    }
    return report;
  }

  // "!so pseudo" ou "!so @pseudo" depuis le tchat
  async function handleChatMessage(login, message, meta = {}) {
    const cfg = store.getSettings().shoutout;
    if (!cfg.enabled) return;
    const [target] = argsAfterCommand(message);
    if (firstWord(message) !== cfg.command || !target) return;
    const allowed = follower.isChannelOwner(login) || meta.isBroadcaster
      || (cfg.modsAllowed && meta.isMod)
      || (cfg.vipsAllowed && meta.isVip);
    if (!allowed) return;
    if (Date.now() - lastShoutoutAt < cfg.cooldownSeconds * 1000) return;
    lastShoutoutAt = Date.now();

    try {
      await triggerShoutout(target);
    } catch (err) {
      logError('shoutout-command', err);
    }
  }

  // Shoutout automatique à la réception d'un raid (si activé). Petit délai pour laisser passer
  // l'alerte de raid avant, plutôt que d'afficher les deux en même temps.
  function handleRaid(raiderLogin) {
    if (!store.getSettings().shoutout.autoOnRaid || !raiderLogin) return;
    setTimeout(() => {
      triggerShoutout(raiderLogin).catch((err) => logError('shoutout-raid', err));
    }, 8000);
  }

  return { triggerShoutout, handleChatMessage, handleRaid };
}

module.exports = { createShoutoutService, fillTemplate };
