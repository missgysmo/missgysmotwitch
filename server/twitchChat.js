const tmi = require('tmi.js');

function createChatTracker(channel, { onChange, getInactivityMs } = {}) {
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

  client.on('message', (_channel, tags) => {
    const login = (tags.username || '').toLowerCase();
    if (login) touch(login);
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
