// Toute la validation des réglages en un seul endroit : chaque champ envoyé par le dashboard est
// borné/vérifié avant d'être enregistré, avec repli sur la valeur actuellement enregistrée (jamais
// sur les valeurs d'usine) pour qu'un champ absent du payload ne réinitialise rien d'autre.
const species = require('../species');

const MOVEMENT_PATTERNS = ['random', 'horizontal', 'vertical', 'circular'];
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const EVENT_REACTIONS = ['none', 'pulse', 'jump', 'shake', 'spin', 'rain', 'bounce'];
const TAMAGOTCHI_REACTIONS = ['none', 'pulse', 'jump', 'shake', 'spin', 'bounce', 'awaken'];
const EVENT_FONTS = ['system-ui', 'Bangers', 'Permanent Marker', 'Pacifico', 'Press Start 2P', 'Russo One', 'Caveat', 'Creepster'];

const clamp = (v, min, max, d) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);

function sanitizeEventConfig(input, fallback) {
  return {
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : fallback.enabled,
    showText: typeof input?.showText === 'boolean' ? input.showText : fallback.showText,
    text: typeof input?.text === 'string' && input.text.trim() ? input.text.slice(0, 200) : fallback.text,
    color: HEX_COLOR.test(input?.color) ? input.color : fallback.color,
    fontFamily: EVENT_FONTS.includes(input?.fontFamily) ? input.fontFamily : fallback.fontFamily,
    fontSize: clamp(input?.fontSize, 8, 40, fallback.fontSize),
    reaction: EVENT_REACTIONS.includes(input?.reaction) ? input.reaction : fallback.reaction,
    position: {
      x: clamp(input?.position?.x, 0, 100, fallback.position.x),
      y: clamp(input?.position?.y, 0, 100, fallback.position.y),
    },
    // pas envoyé par le formulaire de réglages classique — géré à part par l'upload de son,
    // donc on garde la valeur existante tant qu'on ne reçoit pas explicitement une string ou null
    sound: (typeof input?.sound === 'string' || input?.sound === null) ? input.sound : fallback.sound,
  };
}

function sanitizeLastEventConfig(input, fallback) {
  return {
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : fallback.enabled,
    text: typeof input?.text === 'string' && input.text.trim() ? input.text.slice(0, 200) : fallback.text,
    color: HEX_COLOR.test(input?.color) ? input.color : fallback.color,
    fontFamily: EVENT_FONTS.includes(input?.fontFamily) ? input.fontFamily : fallback.fontFamily,
    fontSize: clamp(input?.fontSize, 8, 40, fallback.fontSize),
    position: {
      x: clamp(input?.position?.x, 0, 100, fallback.position.x),
      y: clamp(input?.position?.y, 0, 100, fallback.position.y),
    },
  };
}

function sanitizeTimerConfig(input, fallback) {
  return {
    label: typeof input?.label === 'string' && input.label.trim() ? input.label.slice(0, 100) : fallback.label,
    durationSeconds: clamp(input?.durationSeconds, 5, 7200, fallback.durationSeconds),
    color: HEX_COLOR.test(input?.color) ? input.color : fallback.color,
    fontSize: clamp(input?.fontSize, 12, 80, fallback.fontSize),
    position: {
      x: clamp(input?.position?.x, 0, 100, fallback.position.x),
      y: clamp(input?.position?.y, 0, 100, fallback.position.y),
    },
  };
}

function sanitizeGraffitiConfig(input, fallback) {
  return {
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : fallback.enabled,
    cols: clamp(input?.cols, 10, 150, fallback.cols),
    rows: clamp(input?.rows, 10, 150, fallback.rows),
    cooldownSeconds: clamp(input?.cooldownSeconds, 1, 120, fallback.cooldownSeconds),
    position: {
      x: clamp(input?.position?.x, 0, 100, fallback.position.x),
      y: clamp(input?.position?.y, 0, 100, fallback.position.y),
      width: clamp(input?.position?.width, 5, 100, fallback.position.width),
      height: clamp(input?.position?.height, 5, 100, fallback.position.height),
    },
  };
}

function sanitizeChatOverlayConfig(input, fallback) {
  return {
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : fallback.enabled,
    maxMessages: clamp(input?.maxMessages, 1, 30, fallback.maxMessages),
    fontSize: clamp(input?.fontSize, 8, 40, fallback.fontSize),
    textColor: HEX_COLOR.test(input?.textColor) ? input.textColor : fallback.textColor,
    colorMode: ['twitch', 'palette', 'off'].includes(input?.colorMode) ? input.colorMode : fallback.colorMode,
    style: ['list', 'bubbles'].includes(input?.style) ? input.style : fallback.style,
    rotation: clamp(input?.rotation, -45, 45, fallback.rotation),
    bgColor: HEX_COLOR.test(input?.bgColor) ? input.bgColor : fallback.bgColor,
    bgOpacity: clamp(input?.bgOpacity, 0, 100, fallback.bgOpacity),
    fadeSeconds: clamp(input?.fadeSeconds, 0, 86400, fallback.fadeSeconds),
    position: {
      x: clamp(input?.position?.x, 0, 100, fallback.position.x),
      y: clamp(input?.position?.y, 0, 100, fallback.position.y),
      width: clamp(input?.position?.width, 5, 100, fallback.position.width),
      height: clamp(input?.position?.height, 5, 100, fallback.position.height),
    },
  };
}

function sanitizeChatSoundConfig(input, fallback) {
  return {
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : fallback.enabled,
    cooldownSeconds: clamp(input?.cooldownSeconds, 0, 60, fallback.cooldownSeconds),
    sound: (typeof input?.sound === 'string' || input?.sound === null) ? input.sound : fallback.sound,
  };
}

function sanitizeActivityFeedConfig(input, fallback) {
  return {
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : fallback.enabled,
    fontSize: clamp(input?.fontSize, 8, 40, fallback.fontSize),
    textColor: HEX_COLOR.test(input?.textColor) ? input.textColor : fallback.textColor,
    bgColor: HEX_COLOR.test(input?.bgColor) ? input.bgColor : fallback.bgColor,
    bgOpacity: clamp(input?.bgOpacity, 0, 100, fallback.bgOpacity),
    speedSeconds: clamp(input?.speedSeconds, 3, 120, fallback.speedSeconds),
    position: {
      x: clamp(input?.position?.x, 0, 100, fallback.position.x),
      y: clamp(input?.position?.y, 0, 100, fallback.position.y),
      width: clamp(input?.position?.width, 5, 100, fallback.position.width),
      height: clamp(input?.position?.height, 2, 100, fallback.position.height),
    },
  };
}

function sanitizeFollowListConfig(input, fallback) {
  return {
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : fallback.enabled,
    mode: ['followers', 'subs', 'both'].includes(input?.mode) ? input.mode : fallback.mode,
    fontSize: clamp(input?.fontSize, 8, 40, fallback.fontSize),
    textColor: HEX_COLOR.test(input?.textColor) ? input.textColor : fallback.textColor,
    bgColor: HEX_COLOR.test(input?.bgColor) ? input.bgColor : fallback.bgColor,
    bgOpacity: clamp(input?.bgOpacity, 0, 100, fallback.bgOpacity),
    speedSeconds: clamp(input?.speedSeconds, 3, 300, fallback.speedSeconds),
    position: {
      x: clamp(input?.position?.x, 0, 100, fallback.position.x),
      y: clamp(input?.position?.y, 0, 100, fallback.position.y),
      width: clamp(input?.position?.width, 5, 100, fallback.position.width),
      height: clamp(input?.position?.height, 5, 100, fallback.position.height),
    },
  };
}

const URL_LIKE = /^$|^[^\s<>"]{1,200}$/;

function sanitizeSocialLinks(input, fallback) {
  const out = {};
  for (const key of Object.keys(fallback)) {
    const v = input?.[key];
    out[key] = typeof v === 'string' && URL_LIKE.test(v) ? v : fallback[key];
  }
  return out;
}

function sanitizeSocialPlatforms(input, fallback) {
  const out = {};
  for (const key of Object.keys(fallback)) {
    out[key] = typeof input?.[key] === 'boolean' ? input[key] : fallback[key];
  }
  return out;
}

function sanitizeRaidCardConfig(input, fallback) {
  return {
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : fallback.enabled,
    durationSeconds: clamp(input?.durationSeconds, 3, 60, fallback.durationSeconds),
    fontSize: clamp(input?.fontSize, 8, 40, fallback.fontSize),
    textColor: HEX_COLOR.test(input?.textColor) ? input.textColor : fallback.textColor,
    bgColor: HEX_COLOR.test(input?.bgColor) ? input.bgColor : fallback.bgColor,
    bgOpacity: clamp(input?.bgOpacity, 0, 100, fallback.bgOpacity),
    position: {
      x: clamp(input?.position?.x, 0, 100, fallback.position.x),
      y: clamp(input?.position?.y, 0, 100, fallback.position.y),
    },
  };
}

function sanitizeNowPlayingConfig(input, fallback) {
  return {
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : fallback.enabled,
    showArt: typeof input?.showArt === 'boolean' ? input.showArt : fallback.showArt,
    fontSize: clamp(input?.fontSize, 8, 40, fallback.fontSize),
    textColor: HEX_COLOR.test(input?.textColor) ? input.textColor : fallback.textColor,
    bgColor: HEX_COLOR.test(input?.bgColor) ? input.bgColor : fallback.bgColor,
    bgOpacity: clamp(input?.bgOpacity, 0, 100, fallback.bgOpacity),
    position: {
      x: clamp(input?.position?.x, 0, 100, fallback.position.x),
      y: clamp(input?.position?.y, 0, 100, fallback.position.y),
      width: clamp(input?.position?.width, 5, 100, fallback.position.width),
      height: clamp(input?.position?.height, 5, 100, fallback.position.height),
    },
  };
}

const MESSAGE_STYLES = ['ticker', 'panel'];
const MESSAGE_DISPLAY_MODES = ['always', 'interval'];

// "items" jamais accepté ici (voir plus bas où il est repris de d.messages.items, jamais de
// l'input) : mutés uniquement via server/routes/messages.js, même principe que customCommands.
function sanitizeMessagesConfig(input, fallback) {
  return {
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : fallback.enabled,
    style: MESSAGE_STYLES.includes(input?.style) ? input.style : fallback.style,
    displayMode: MESSAGE_DISPLAY_MODES.includes(input?.displayMode) ? input.displayMode : fallback.displayMode,
    intervalSeconds: clamp(input?.intervalSeconds, 10, 7200, fallback.intervalSeconds),
    showDurationSeconds: clamp(input?.showDurationSeconds, 3, 600, fallback.showDurationSeconds),
    fontFamily: EVENT_FONTS.includes(input?.fontFamily) ? input.fontFamily : fallback.fontFamily,
    fontSize: clamp(input?.fontSize, 8, 60, fallback.fontSize),
    textColor: HEX_COLOR.test(input?.textColor) ? input.textColor : fallback.textColor,
    bgColor: HEX_COLOR.test(input?.bgColor) ? input.bgColor : fallback.bgColor,
    bgOpacity: clamp(input?.bgOpacity, 0, 100, fallback.bgOpacity),
    speedSeconds: clamp(input?.speedSeconds, 3, 300, fallback.speedSeconds),
    rotation: clamp(input?.rotation, -180, 180, fallback.rotation),
    position: {
      x: clamp(input?.position?.x, 0, 100, fallback.position.x),
      y: clamp(input?.position?.y, 0, 100, fallback.position.y),
      width: clamp(input?.position?.width, 5, 100, fallback.position.width),
      height: clamp(input?.position?.height, 5, 100, fallback.position.height),
    },
  };
}

function sanitizeCustomCommandsPlayerConfig(input, fallback) {
  return {
    position: {
      x: clamp(input?.position?.x, 0, 100, fallback.position.x),
      y: clamp(input?.position?.y, 0, 100, fallback.position.y),
      width: clamp(input?.position?.width, 5, 100, fallback.position.width),
      height: clamp(input?.position?.height, 5, 100, fallback.position.height),
    },
  };
}

function sanitizeTamagotchiChatAction(input, fallback) {
  return {
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : fallback.enabled,
    command: typeof input?.command === 'string' && /^!\S{1,20}$/.test(input.command.trim()) ? input.command.trim().toLowerCase() : fallback.command,
    boost: Number.isFinite(input?.boost) ? Math.min(100, Math.max(0, input.boost)) : fallback.boost,
    cooldownSeconds: Number.isFinite(input?.cooldownSeconds) ? Math.min(600, Math.max(0, input.cooldownSeconds)) : fallback.cooldownSeconds,
    reaction: TAMAGOTCHI_REACTIONS.includes(input?.reaction) ? input.reaction : fallback.reaction,
  };
}

// Si deux actions activées partagent la même commande de chat, seule la première (dans cet ordre)
// resterait déclenchable — on désactive silencieusement les suivantes plutôt que de laisser
// une action configurée mais qui ne se déclenchera jamais sans que personne ne le sache.
function dedupeTamagotchiCommands(actions) {
  const seen = new Set();
  for (const id of ['pet', 'feed', 'play']) {
    const action = actions[id];
    if (!action.enabled) continue;
    if (seen.has(action.command)) action.enabled = false;
    else seen.add(action.command);
  }
  return actions;
}

function sanitizeTamagotchiConfig(input, fallback) {
  return {
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : fallback.enabled,
    species: input?.species === 'mascot' || species.getById(input?.species) ? input.species : fallback.species,
    size: clamp(input?.size, 24, 300, fallback.size),
    showBar: typeof input?.showBar === 'boolean' ? input.showBar : fallback.showBar,
    decayPerMinute: clamp(input?.decayPerMinute, 0, 20, fallback.decayPerMinute),
    boostChat: clamp(input?.boostChat, 0, 20, fallback.boostChat),
    boostFollow: clamp(input?.boostFollow, 0, 100, fallback.boostFollow),
    boostSub: clamp(input?.boostSub, 0, 100, fallback.boostSub),
    boostCheer: clamp(input?.boostCheer, 0, 100, fallback.boostCheer),
    boostRaid: clamp(input?.boostRaid, 0, 100, fallback.boostRaid),
    position: {
      x: clamp(input?.position?.x, 0, 100, fallback.position.x),
      y: clamp(input?.position?.y, 0, 100, fallback.position.y),
    },
    walkRadius: clamp(input?.walkRadius, 0, 40, fallback.walkRadius),
    eventReactions: {
      follow: TAMAGOTCHI_REACTIONS.includes(input?.eventReactions?.follow) ? input.eventReactions.follow : fallback.eventReactions.follow,
      subscribe: TAMAGOTCHI_REACTIONS.includes(input?.eventReactions?.subscribe) ? input.eventReactions.subscribe : fallback.eventReactions.subscribe,
      cheer: TAMAGOTCHI_REACTIONS.includes(input?.eventReactions?.cheer) ? input.eventReactions.cheer : fallback.eventReactions.cheer,
      raid: TAMAGOTCHI_REACTIONS.includes(input?.eventReactions?.raid) ? input.eventReactions.raid : fallback.eventReactions.raid,
    },
    chatActions: dedupeTamagotchiCommands({
      pet: sanitizeTamagotchiChatAction(input?.chatActions?.pet, fallback.chatActions.pet),
      feed: sanitizeTamagotchiChatAction(input?.chatActions?.feed, fallback.chatActions.feed),
      play: sanitizeTamagotchiChatAction(input?.chatActions?.play, fallback.chatActions.play),
    }),
  };
}

// Point d'entrée unique : construit l'objet réglages complet à partir du payload reçu (body) et
// des réglages actuellement enregistrés (current, utilisé comme repli champ par champ).
function sanitizeSettings(body, current) {
  const {
    avatarSize, zone, moveIntervalMs, moveVarianceMs, transitionSeconds,
    movementPattern, corridorPosition, mirrorOnDirection, inactivityMinutes, transitionEffect,
    nameTag, events, lastEvents, spriteFlip, ownerNameColor, ownerSize, timers, graffiti, chatOverlay, chatSound,
    activityFeed, followList, tamagotchi, raidCard, nowPlaying, socialLinks, socialPlatforms, customCommandsPlayer, messages,
  } = body;
  const d = current;

  const settings = {
    avatarSize: clamp(avatarSize, 24, 200, d.avatarSize),
    zone: {
      top: clamp(zone?.top, 0, 45, d.zone.top),
      right: clamp(zone?.right, 0, 45, d.zone.right),
      bottom: clamp(zone?.bottom, 0, 45, d.zone.bottom),
      left: clamp(zone?.left, 0, 45, d.zone.left),
    },
    moveIntervalMs: clamp(moveIntervalMs, 500, 20000, d.moveIntervalMs),
    moveVarianceMs: clamp(moveVarianceMs, 0, 10000, d.moveVarianceMs),
    transitionSeconds: clamp(transitionSeconds, 0.5, 15, d.transitionSeconds),
    movementPattern: MOVEMENT_PATTERNS.includes(movementPattern) ? movementPattern : d.movementPattern,
    corridorPosition: clamp(corridorPosition, 0, 100, d.corridorPosition),
    mirrorOnDirection: typeof mirrorOnDirection === 'boolean' ? mirrorOnDirection : d.mirrorOnDirection,
    inactivityMinutes: clamp(inactivityMinutes, 1, 120, d.inactivityMinutes),
    transitionEffect: typeof transitionEffect === 'boolean' ? transitionEffect : d.transitionEffect,
    nameTag: {
      show: typeof nameTag?.show === 'boolean' ? nameTag.show : d.nameTag.show,
      fontSize: clamp(nameTag?.fontSize, 8, 32, d.nameTag.fontSize),
      color: HEX_COLOR.test(nameTag?.color) ? nameTag.color : d.nameTag.color,
    },
    events: {
      follow: sanitizeEventConfig(events?.follow, d.events.follow),
      subscribe: sanitizeEventConfig(events?.subscribe, d.events.subscribe),
      cheer: sanitizeEventConfig(events?.cheer, d.events.cheer),
      raid: sanitizeEventConfig(events?.raid, d.events.raid),
    },
    lastEvents: {
      follow: sanitizeLastEventConfig(lastEvents?.follow, d.lastEvents.follow),
      subscribe: sanitizeLastEventConfig(lastEvents?.subscribe, d.lastEvents.subscribe),
      cheer: sanitizeLastEventConfig(lastEvents?.cheer, d.lastEvents.cheer),
      raid: sanitizeLastEventConfig(lastEvents?.raid, d.lastEvents.raid),
    },
    ownerNameColor: HEX_COLOR.test(ownerNameColor) ? ownerNameColor : d.ownerNameColor,
    ownerSize: clamp(ownerSize, 24, 200, d.ownerSize),
    // Union des clés déjà connues et de celles envoyées par le formulaire : sinon un avatar
    // ajouté après coup (catalogue d'avatars personnalisés) ne peut jamais être enregistré ici,
    // puisqu'il n'existe dans aucune des deux listes avant son tout premier enregistrement.
    spriteFlip: Object.fromEntries(
      [...new Set([...Object.keys(d.spriteFlip), ...Object.keys(spriteFlip || {})])]
        .map((id) => [id, typeof spriteFlip?.[id] === 'boolean' ? spriteFlip[id] : (d.spriteFlip[id] ?? false)])
    ),
    timers: {
      intro: sanitizeTimerConfig(timers?.intro, d.timers.intro),
      pause: sanitizeTimerConfig(timers?.pause, d.timers.pause),
    },
    graffiti: sanitizeGraffitiConfig(graffiti, d.graffiti),
    chatOverlay: sanitizeChatOverlayConfig(chatOverlay, d.chatOverlay),
    chatSound: sanitizeChatSoundConfig(chatSound, d.chatSound),
    activityFeed: sanitizeActivityFeedConfig(activityFeed, d.activityFeed),
    followList: sanitizeFollowListConfig(followList, d.followList),
    tamagotchi: sanitizeTamagotchiConfig(tamagotchi, d.tamagotchi),
    raidCard: sanitizeRaidCardConfig(raidCard, d.raidCard),
    nowPlaying: sanitizeNowPlayingConfig(nowPlaying, d.nowPlaying),
    socialLinks: sanitizeSocialLinks(socialLinks, d.socialLinks),
    socialPlatforms: sanitizeSocialPlatforms(socialPlatforms, d.socialPlatforms),
    customCommandsPlayer: sanitizeCustomCommandsPlayerConfig(customCommandsPlayer, d.customCommandsPlayer),
    // Jamais touché ici : customCommands ne se modifie que via ses propres routes (créer/éditer/
    // supprimer/uploader un média), pour ne jamais risquer de l'écraser via le formulaire général.
    customCommands: d.customCommands,
    // Même principe pour messages.items (voir server/routes/messages.js) — le reste du bloc
    // (style/affichage/police/position) passe lui par le formulaire classique comme d'habitude.
    messages: { ...sanitizeMessagesConfig(messages, d.messages), items: d.messages.items },
  };

  return settings;
}

module.exports = { sanitizeSettings, HEX_COLOR, TAMAGOTCHI_REACTIONS, EVENT_REACTIONS, MOVEMENT_PATTERNS };
