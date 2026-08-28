const SCOPES = ['user-read-currently-playing', 'user-read-playback-state'];

function getAuthUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    state,
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

function basicAuthHeader(clientId, clientSecret) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

async function exchangeCode({ clientId, clientSecret, redirectUri, code }) {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: basicAuthHeader(clientId, clientSecret), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  if (!res.ok) throw new Error(`exchangeCode failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function refreshAccessToken({ clientId, clientSecret, refreshToken }) {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: basicAuthHeader(clientId, clientSecret), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  if (!res.ok) throw new Error(`refreshAccessToken failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  // Spotify ne renvoie pas toujours un nouveau refresh_token — on garde l'ancien si absent.
  return { refresh_token: refreshToken, ...body };
}

// store: petit adaptateur { getTokens, setTokens } fourni par l'appelant (fichier dédié, séparé des tokens Twitch)
async function withFreshToken(store, { clientId, clientSecret }, doFetch) {
  const tokens = store.getTokens();
  if (!tokens) throw new Error('Spotify pas encore connecté — passe par /auth/spotify.');
  let res = await doFetch(tokens.access_token);
  if (res.status === 401) {
    const refreshed = await refreshAccessToken({ clientId, clientSecret, refreshToken: tokens.refresh_token });
    store.setTokens(refreshed);
    res = await doFetch(refreshed.access_token);
  }
  return res;
}

// Renvoie { isPlaying, title, artist, album, art, progressMs, durationMs } ou null si rien n'est en lecture.
async function getCurrentlyPlaying(store, { clientId, clientSecret }) {
  const res = await withFreshToken(store, { clientId, clientSecret }, (accessToken) => fetch(
    'https://api.spotify.com/v1/me/player/currently-playing?additional_types=track',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  ));
  if (res.status === 204) return null; // rien en lecture
  if (!res.ok) throw new Error(`getCurrentlyPlaying failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  if (!body || !body.item || body.currently_playing_type !== 'track') return null;

  const track = body.item;
  return {
    isPlaying: !!body.is_playing,
    title: track.name,
    artist: (track.artists || []).map((a) => a.name).join(', '),
    album: track.album?.name || null,
    art: track.album?.images?.[0]?.url || null,
    progressMs: body.progress_ms || 0,
    durationMs: track.duration_ms || 0,
    trackId: track.id,
  };
}

module.exports = { getAuthUrl, exchangeCode, refreshAccessToken, getCurrentlyPlaying };
