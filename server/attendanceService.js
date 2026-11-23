// Allées et venues des viewers, stream par stream.
//
// Source : les arrivées/départs du salon que Twitch envoie au tchat (les mêmes que Twitchat
// affiche), plus les messages. Un viewer qui écrit sans qu'on ait encore vu son arrivée (Twitch
// envoie les arrivées par paquets, en retard) est compté comme arrivé à ce moment-là ; l'arrivée
// en retard qui suit est alors ignorée. Une arrivée = passage d'absent à présent, un départ =
// passage de présent à absent, pour ne jamais compter deux fois le même mouvement.
//
// Début/fin de stream : détectés en interrogeant Twitch chaque minute (survit aux redémarrages
// du serveur : on reprend le même stream grâce à son identifiant Twitch).

const crypto = require('crypto');

const POLL_MS = 60 * 1000;
const OFFLINE_CONFIRMATIONS = 2; // 2 réponses "hors ligne" d'affilée avant de clore le stream
const RECONNECT_GRACE_MS = 2 * 60 * 1000;
const MAX_STREAMS_KEPT = 200;
const SAVE_DELAY_MS = 5000;

const DEFAULT_IGNORED = [
  'streamelements', 'nightbot', 'moobot', 'streamlabs', 'fossabot', 'wizebot', 'sery_bot',
  'soundalerts', 'commanderroot', 'lurxx', 'drapsnatt', 'kofistreambot', 'pokemoncommunitygame',
  'streamstickers', 'tangiabot', 'own3d', 'creatisbot', 'frostytoolsdotcom', 'blerp',
];

function createAttendanceService({ store, twitchEvents, follower, CHANNEL, CLIENT_ID, CLIENT_SECRET, logError }) {
  const data = store.getAttendance();
  data.streams = data.streams || [];
  data.viewers = data.viewers || {};
  if (!Array.isArray(data.ignored)) data.ignored = [...DEFAULT_IGNORED];
  // Clé secrète de l'adresse de réception Twitchat (déclencheurs "requête HTTP")
  if (!data.twitchatKey) {
    data.twitchatKey = crypto.randomBytes(16).toString('hex');
    store.setAttendance(data);
  }

  const channelLogin = String(CHANNEL || '').toLowerCase();
  const present = new Map(); // login -> depuis quand il est dans le salon (live ou pas)
  const displayNames = new Map();
  let offlineCount = 0;
  let reconnectedAt = 0;
  let saveTimer = null;
  let pollErrorLogged = false;

  const currentStream = () => {
    const last = data.streams[data.streams.length - 1];
    return last && !last.endedAt ? last : null;
  };

  function save() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      store.setAttendance(data);
    }, SAVE_DELAY_MS);
  }

  function isIgnored(login) {
    return !login || login === channelLogin || login.startsWith('justinfan') || data.ignored.includes(login);
  }

  function entryFor(login, stream) {
    const viewer = data.viewers[login] || (data.viewers[login] = { displayName: login, perStream: {} });
    if (displayNames.has(login)) viewer.displayName = displayNames.get(login);
    return viewer.perStream[stream.id] || (viewer.perStream[stream.id] = {
      joins: 0, parts: 0, messages: 0, presenceMs: 0, firstAt: null, lastAt: null,
    });
  }

  function countArrival(login, at) {
    const stream = currentStream();
    if (!stream) return;
    const e = entryFor(login, stream);
    e.joins += 1;
    e.firstAt = e.firstAt || at;
    e.lastAt = at;
    save();
  }

  function closePresence(login, at, { countDeparture }) {
    const since = present.get(login);
    const stream = currentStream();
    if (stream && since != null) {
      const e = entryFor(login, stream);
      e.presenceMs += Math.max(0, at - Math.max(since, stream.startedAt));
      e.lastAt = at;
      if (countDeparture) e.parts += 1;
      save();
    }
  }

  // --- Événements du tchat ---
  function handleJoin(login) {
    login = (login || '').toLowerCase();
    if (isIgnored(login) || present.has(login)) return;
    const now = Date.now();
    present.set(login, now);
    const stream = currentStream();
    // Juste après une reconnexion du bot, Twitch renvoie les gens déjà là : pas une nouvelle arrivée
    // s'ils étaient déjà comptés sur ce stream.
    if (stream && now - reconnectedAt < RECONNECT_GRACE_MS && data.viewers[login]?.perStream[stream.id]) return;
    countArrival(login, now);
  }

  function handlePart(login) {
    login = (login || '').toLowerCase();
    if (isIgnored(login) || !present.has(login)) return;
    closePresence(login, Date.now(), { countDeparture: true });
    present.delete(login);
  }

  function handleMessage(login, displayName) {
    login = (login || '').toLowerCase();
    if (isIgnored(login)) return;
    if (displayName) displayNames.set(login, displayName);
    if (!present.has(login)) handleJoin(login);
    const stream = currentStream();
    if (!stream) return;
    const e = entryFor(login, stream);
    e.messages += 1;
    e.lastAt = Date.now();
    e.firstAt = e.firstAt || e.lastAt;
    save();
  }

  function handleConnected() {
    reconnectedAt = Date.now();
  }

  // Bot déconnecté du tchat : on ne verra pas les départs pendant la coupure, donc on arrête les
  // compteurs de présence là (sans compter de départ) et on repart de zéro à la reconnexion.
  function handleDisconnected() {
    const now = Date.now();
    for (const login of present.keys()) closePresence(login, now, { countDeparture: false });
    present.clear();
  }

  // --- Début / fin de stream ---
  function startStream({ id, startedAt, title }) {
    const now = Date.now();
    data.streams.push({ id, startedAt, endedAt: null, title: title || '' });
    if (data.streams.length > MAX_STREAMS_KEPT) {
      const removed = data.streams.splice(0, data.streams.length - MAX_STREAMS_KEPT);
      for (const viewer of Object.values(data.viewers)) {
        for (const s of removed) delete viewer.perStream[s.id];
      }
    }
    // Ceux déjà dans le salon au lancement du live comptent comme arrivés au début du stream.
    for (const login of present.keys()) {
      present.set(login, Math.max(present.get(login), startedAt));
      countArrival(login, now);
    }
    console.log(`[attendance] début du stream ${id}`);
    save();
  }

  function endStream() {
    const stream = currentStream();
    if (!stream) return;
    const now = Date.now();
    for (const login of present.keys()) {
      closePresence(login, now, { countDeparture: false });
      present.set(login, now);
    }
    stream.endedAt = now;
    console.log(`[attendance] fin du stream ${stream.id}`);
    save();
  }

  async function poll() {
    try {
      const broadcasterId = await follower.ensureBroadcasterId();
      const live = await twitchEvents.getStream({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, broadcasterId });
      pollErrorLogged = false;
      const stream = currentStream();
      if (live) {
        offlineCount = 0;
        if (stream && stream.id === live.id) {
          if (live.title) stream.title = live.title;
          return;
        }
        if (stream) endStream(); // nouveau stream alors que l'ancien n'avait pas été clos
        startStream({ id: live.id, startedAt: Date.parse(live.started_at) || Date.now(), title: live.title });
      } else if (stream) {
        offlineCount += 1;
        if (offlineCount >= OFFLINE_CONFIRMATIONS) endStream();
      }
    } catch (err) {
      if (!pollErrorLogged) logError('attendance-stream', err);
      pollErrorLogged = true;
    }
  }

  function start() {
    poll();
    setInterval(poll, POLL_MS);
  }

  // --- Lecture pour le dashboard ---
  function getState() {
    const now = Date.now();
    const stream = currentStream();
    const viewers = Object.entries(data.viewers).map(([login, v]) => {
      const perStream = {};
      for (const [sid, e] of Object.entries(v.perStream)) {
        // Présence en cours ajoutée à la volée (pas encore enregistrée)
        const live = stream && sid === stream.id && present.has(login)
          ? now - Math.max(present.get(login), stream.startedAt) : 0;
        perStream[sid] = { ...e, presenceMs: e.presenceMs + live };
      }
      return { login, displayName: v.displayName, perStream, here: !!stream && present.has(login) };
    }).filter((v) => Object.keys(v.perStream).length);
    return {
      live: !!stream,
      currentStreamId: stream?.id || null,
      streams: [...data.streams].reverse(),
      viewers,
      ignored: data.ignored,
      twitchatKey: data.twitchatKey,
    };
  }

  function setIgnored(list) {
    data.ignored = [...new Set(list.map((l) => String(l).trim().toLowerCase()).filter(Boolean))].slice(0, 500);
    for (const login of data.ignored) {
      delete data.viewers[login];
      present.delete(login);
    }
    save();
  }

  function removeViewer(login) {
    delete data.viewers[String(login).toLowerCase()];
    save();
  }

  function checkTwitchatKey(key) {
    const a = Buffer.from(String(key || ''));
    const b = Buffer.from(data.twitchatKey);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  return {
    start, checkTwitchatKey, handleJoin, handlePart, handleMessage, handleConnected, handleDisconnected,
    getState, setIgnored, removeViewer,
  };
}

module.exports = { createAttendanceService };
