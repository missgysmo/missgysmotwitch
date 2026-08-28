const tmi = require('tmi.js');

function createChatTracker(channel, { onChange, getInactivityMs, onMessage, onMessageDeleted, onClearChat } = {}) {
  const inactivityMs = getInactivityMs || (() => 10 * 60 * 1000);
  const active = new Map(); // login -> lastSeen timestamp

  const client = new tmi.Client({
    channels: [channel],
  });

  function touch(login) {
    const isNew = !active.has(login);
    active.set(login, Date.now());
    if (isNew && onChange) onChange();
  }

  client.on('message', (_channel, tags, message) => {
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
    console.log(`[twitchChat] connecté au chat #${channel}`);
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

  return { connect, getActiveLogins };
}

module.exports = { createChatTracker };
