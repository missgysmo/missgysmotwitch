const WebSocket = require('ws');
const store = require('./store');

const EVENTSUB_WS_URL = 'wss://eventsub.wss.twitch.tv/ws';
const SCOPES = ['moderator:read:followers', 'channel:read:subscriptions', 'bits:read'];

function getAuthUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    state,
  });
  return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
}

async function exchangeCode({ clientId, clientSecret, redirectUri, code }) {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });
  const res = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', body: params });
  if (!res.ok) throw new Error(`exchangeCode failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function refreshAccessToken({ clientId, clientSecret, refreshToken }) {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const res = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', body: params });
  if (!res.ok) throw new Error(`refreshAccessToken failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// Refait la requête avec un token rafraîchi si la première tentative échoue en 401
// (token expiré — Twitch n'indique pas de date d'expiration exploitable côté client).
async function withFreshToken({ clientId, clientSecret }, doFetch) {
  const tokens = store.getTokens();
  if (!tokens) throw new Error('Pas de token Twitch — passe par /auth pour autoriser l\'app.');
  let res = await doFetch(tokens.access_token);
  if (res.status === 401 && tokens.refresh_token) {
    console.log('[twitchEvents] token expiré, rafraîchissement...');
    const refreshed = await refreshAccessToken({ clientId, clientSecret, refreshToken: tokens.refresh_token });
    store.setTokens(refreshed);
    res = await doFetch(refreshed.access_token);
  }
  return res;
}

async function getUserId({ clientId, clientSecret, login }) {
  const res = await withFreshToken({ clientId, clientSecret }, (accessToken) => fetch(
    `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`,
    { headers: { 'Client-Id': clientId, Authorization: `Bearer ${accessToken}` } },
  ));
  if (!res.ok) throw new Error(`getUserId failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  if (!body.data || !body.data.length) throw new Error(`Utilisateur Twitch introuvable: ${login}`);
  return body.data[0].id;
}

async function checkFollower({ clientId, clientSecret, broadcasterId, userId }) {
  const params = new URLSearchParams({ broadcaster_id: broadcasterId, user_id: userId });
  const res = await withFreshToken({ clientId, clientSecret }, (accessToken) => fetch(
    `https://api.twitch.tv/helix/channels/followers?${params.toString()}`,
    { headers: { 'Client-Id': clientId, Authorization: `Bearer ${accessToken}` } },
  ));
  if (!res.ok) throw new Error(`checkFollower failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  return (body.total || 0) > 0;
}

// Fiche mémoire raid : avatar + dernier jeu/titre du canal qui raid, pour l'afficher sur l'overlay.
async function getChannelInfo({ clientId, clientSecret, login }) {
  const userRes = await withFreshToken({ clientId, clientSecret }, (accessToken) => fetch(
    `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`,
    { headers: { 'Client-Id': clientId, Authorization: `Bearer ${accessToken}` } },
  ));
  if (!userRes.ok) throw new Error(`getChannelInfo (users) failed: ${userRes.status} ${await userRes.text()}`);
  const userBody = await userRes.json();
  const user = userBody.data?.[0];
  if (!user) throw new Error(`Utilisateur Twitch introuvable: ${login}`);

  const channelRes = await withFreshToken({ clientId, clientSecret }, (accessToken) => fetch(
    `https://api.twitch.tv/helix/channels?broadcaster_id=${encodeURIComponent(user.id)}`,
    { headers: { 'Client-Id': clientId, Authorization: `Bearer ${accessToken}` } },
  ));
  if (!channelRes.ok) throw new Error(`getChannelInfo (channels) failed: ${channelRes.status} ${await channelRes.text()}`);
  const channelBody = await channelRes.json();
  const channel = channelBody.data?.[0] || {};

  return {
    login: user.login,
    displayName: user.display_name,
    avatar: user.profile_image_url,
    game: channel.game_name || null,
    title: channel.title || null,
  };
}

async function subscribe({ clientId, clientSecret, type, version, condition, sessionId }) {
  const res = await withFreshToken({ clientId, clientSecret }, (accessToken) => fetch(
    'https://api.twitch.tv/helix/eventsub/subscriptions',
    {
      method: 'POST',
      headers: {
        'Client-Id': clientId,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type,
        version,
        condition,
        transport: { method: 'websocket', session_id: sessionId },
      }),
    },
  ));
  if (!res.ok) {
    console.error(`[twitchEvents] échec abonnement ${type}: ${res.status} ${await res.text()}`);
  }
}

// Connecte le websocket EventSub et s'abonne aux events follow/sub/cheer/raid.
// onEvent(type, event) est appelé à chaque notification.
async function connectEventSub({ clientId, clientSecret, broadcasterId, onEvent }) {
  if (!store.getTokens()) throw new Error('Pas de token Twitch — passe par /auth pour autoriser l\'app.');

  function connectSocket() {
    const ws = new WebSocket(EVENTSUB_WS_URL);

    ws.on('message', async (raw) => {
      const msg = JSON.parse(raw.toString());
      const type = msg.metadata?.message_type;

      if (type === 'session_welcome') {
        const sessionId = msg.payload.session.id;
        console.log('[twitchEvents] EventSub connecté, abonnement aux events...');
        const condition = { broadcaster_user_id: broadcasterId };
        const moderatorCondition = { broadcaster_user_id: broadcasterId, moderator_user_id: broadcasterId };

        await subscribe({ clientId, clientSecret, type: 'channel.follow', version: '2', condition: moderatorCondition, sessionId });
        await subscribe({ clientId, clientSecret, type: 'channel.subscribe', version: '1', condition, sessionId });
        await subscribe({ clientId, clientSecret, type: 'channel.cheer', version: '1', condition, sessionId });
        await subscribe({ clientId, clientSecret, type: 'channel.raid', version: '1', condition: { to_broadcaster_user_id: broadcasterId }, sessionId });
      }

      if (type === 'notification') {
        const subType = msg.payload.subscription.type;
        onEvent(subType, msg.payload.event);
      }

      if (type === 'session_reconnect') {
        const reconnectUrl = msg.payload.session.reconnect_url;
        ws.close();
        const newWs = new WebSocket(reconnectUrl);
        newWs.on('open', () => console.log('[twitchEvents] reconnecté à EventSub'));
      }
    });

    ws.on('close', () => {
      console.log('[twitchEvents] connexion EventSub fermée, nouvelle tentative dans 5s...');
      setTimeout(connectSocket, 5000);
    });

    ws.on('error', (err) => {
      console.error('[twitchEvents] erreur websocket EventSub:', err.message);
    });
  }

  connectSocket();
}

module.exports = { getAuthUrl, exchangeCode, refreshAccessToken, getUserId, checkFollower, getChannelInfo, connectEventSub };
