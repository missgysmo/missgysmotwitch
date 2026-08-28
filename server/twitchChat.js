const tmi = require('tmi.js');

function createChatTracker(channel, { onChange, getInactivityMs, onMessage, onMessageDeleted, onClearChat, onStatusChange } = {}) {
  const inactivityMs = getInactivityMs || (() => 10 * 60 * 1000);
  const active = new Map(); // login -> lastSeen timestamp
  let connected = false;
  let lastMessageAt = null;

  const client = new tmi.Client({
    channels: [channel],
    connection: { reconnect: true, secure: true },
  });

  function touch(login) {
    const isNew = !active.has(login);
    active.set(login, Date.now());
    if (isNew && onChange) onChange();
  }

  client.on('message', (_channel, tags, message) => {
    lastMessageAt = Date.now();
    const login = (tags.username || '').toLowerCase();
    if (login) touch(login);
    if (login && onMessage) {
      onMessage(login, message, {
        id: tags.id || null,
        displayName: tags['display-name'] || login,
        color: tags.color || null,
      });
    }
  });

  // Suppression d'un message précis par un modérateur/le streamer
  client.on('messagedeleted', (_channel, _username, _deletedMessage, userstate) => {
    const id = userstate?.['target-msg-id'];
    if (id && onMessageDeleted) onMessageDeleted(id);
  });

  // Chat entièrement effacé, ou timeout/ban (Twitch efface aussi les messages de la personne)
  client.on('clearchat', () => {
    if (onClearChat) onClearChat();
  });
  client.on('timeout', (_channel, username) => {
    if (onClearChat) onClearChat(username.toLowerCase());
  });
  client.on('ban', (_channel, username) => {
    if (onClearChat) onClearChat(username.toLowerCase());
  });

  client.on('connected', () => {
    connected = true;
    console.log(`[twitchChat] connecté au chat #${channel}`);
    if (onStatusChange) onStatusChange(true);
  });

  client.on('disconnected', (reason) => {
    connected = false;
    console.error(`[twitchChat] déconnecté du chat #${channel}: ${reason}`);
    if (onStatusChange) onStatusChange(false);
  });

  setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [login, lastSeen] of active) {
      if (now - lastSeen > inactivityMs()) {
        active.delete(login);
        changed = true;
      }
    }
    if (changed && onChange) onChange();
  }, 30 * 1000);

  function getActiveLogins() {
    return [...active.keys()];
  }

  function connect() {
    return client.connect();
  }

  function getStatus() {
    return { connected, lastMessageAt };
  }

  return { connect, getActiveLogins, getStatus };
}

module.exports = { createChatTracker };
