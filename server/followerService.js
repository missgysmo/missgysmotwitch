// Vérification "followers uniquement" + construction de l'état des avatars affichés sur l'overlay.
// Regroupés dans un seul module car intrinsèquement couplés : buildState() a besoin de savoir qui
// suit la chaîne, et isFollowerCached() a besoin de rediffuser buildState() quand un statut change.
//
// createFollowerService() prend ses dépendances en paramètres (plutôt que de les importer
// directement) pour ne pas dépendre de l'ordre de création des autres modules dans index.js —
// getActiveLogins()/getTestAvatars() ne sont appelés qu'au moment réel de la requête.
function createFollowerService({ store, species, twitchEvents, CHANNEL, CLIENT_ID, CLIENT_SECRET, broadcast, getActiveLogins, getTestAvatars }) {
  const FOLLOWER_TTL_MS = 5 * 60 * 1000;

  let broadcasterId = null;
  const followerCache = new Map(); // login (lowercase) -> { follows, checkedAt }
  const followerChecksInFlight = new Map(); // login (lowercase) -> Promise en cours, évite les doublons d'appels Twitch

  function isChannelOwner(login) {
    return login.toLowerCase() === CHANNEL.toLowerCase();
  }

  async function ensureBroadcasterId() {
    if (broadcasterId) return broadcasterId;
    if (!store.getTokens()) return null;
    broadcasterId = await twitchEvents.getUserId({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, login: CHANNEL });
    return broadcasterId;
  }

  async function checkAndCacheFollower(login) {
    if (isChannelOwner(login)) return true;
    const key = login.toLowerCase();
    try {
      const bId = await ensureBroadcasterId();
      if (!store.getTokens() || !bId) throw new Error('app pas encore autorisée via /auth');
      const userId = await twitchEvents.getUserId({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, login });
      const follows = await twitchEvents.checkFollower({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, broadcasterId: bId, userId });
      followerCache.set(key, { follows, checkedAt: Date.now() });
      return follows;
    } catch (err) {
      console.error(`[followers] échec vérification pour ${login}:`, err.message);
      followerCache.set(key, { follows: false, checkedAt: Date.now() });
      return false;
    }
  }

  // Lecture synchrone pour buildState() : renvoie la dernière valeur connue (false si jamais vérifié)
  // et relance une vérification en arrière-plan si absente ou périmée (une seule à la fois par pseudo,
  // même si buildState() est appelé plusieurs fois avant que la première vérification ne réponde).
  function isFollowerCached(login) {
    if (isChannelOwner(login)) return true;
    const key = login.toLowerCase();
    const cached = followerCache.get(key);
    if ((!cached || Date.now() - cached.checkedAt > FOLLOWER_TTL_MS) && !followerChecksInFlight.has(key)) {
      const promise = checkAndCacheFollower(login)
        .then((follows) => {
          const prev = cached?.follows;
          if (follows !== prev) broadcast(buildState());
        })
        .finally(() => followerChecksInFlight.delete(key));
      followerChecksInFlight.set(key, promise);
    }
    return cached ? cached.follows : false;
  }

  function getSkin(login) {
    if (isChannelOwner(login)) return { species: 'mon-avatar', hue: 0 };
    return store.getAvatar(login) || defaultSkin(login);
  }

  function defaultSkin(login) {
    const selectable = species.getSelectable();
    const hash = [...login].reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return { species: selectable[hash % selectable.length].id, hue: 0 };
  }

  // includeTest: les avatars de test (onglet "Test avatars") ne doivent jamais apparaître
  // sur le stream réel — seulement dans l'aperçu sandbox (/overlay/?preview=1).
  function buildState(includeTest = false) {
    const active = getActiveLogins().filter((login) => !isChannelOwner(login));
    const real = active.filter(isFollowerCached).map((login) => ({ login, skin: getSkin(login) }));
    const test = includeTest ? [...getTestAvatars().entries()].map(([login, skin]) => ({ login, skin })) : [];
    const owner = { login: CHANNEL, skin: getSkin(CHANNEL) };
    return { type: 'state', viewers: [owner, ...real, ...test] };
  }

  // Liste complète des avatars connus, utilisée pour les réactions "tout le monde apparaît" (ex: rebond de raid).
  function buildCast() {
    const cast = species.getSelectable().map((s) => ({ login: `cast-${s.id}`, skin: { species: s.id, hue: 0 } }));
    cast.push({ login: CHANNEL, skin: getSkin(CHANNEL) });
    return cast;
  }

  // Purge périodique du cache follower, pour ne pas grossir indéfiniment sur une chaîne avec
  // beaucoup de viewers différents au fil du temps.
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of followerCache) {
      if (now - entry.checkedAt > FOLLOWER_TTL_MS * 6) followerCache.delete(key);
    }
  }, 30 * 60 * 1000).unref();

  // Utilisé par le handler de messages de chat : le streamer et les followers connus (même via
  // un cache légèrement périmé) ont une bulle de chat au-dessus de leur avatar et peuvent déclencher
  // les commandes de la mascotte. Rafraîchit le cache en arrière-plan au passage si besoin.
  function isFollowerRightNow(login) {
    return isChannelOwner(login) || isFollowerCached(login);
  }

  return {
    isChannelOwner,
    ensureBroadcasterId,
    checkAndCacheFollower,
    isFollowerCached,
    isFollowerRightNow,
    getSkin,
    buildState,
    buildCast,
  };
}

module.exports = { createFollowerService };
