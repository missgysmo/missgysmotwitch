// Générateur local de posts réseaux sociaux : purement combinatoire, aucune API externe.

const MOMENT_LABELS = {
  live: 'live',
  announcement: 'annonce',
  ending: 'fin de stream',
};

const TWITTER_TEMPLATES = {
  live: [
    '🔴 EN LIVE sur {game} ! Viens traîner : {link}',
    "🔴 C'est parti, {game} en direct ! {link}",
    '🔴 Live {game} maintenant, {message} {link}',
  ],
  announcement: [
    '📅 Prochain live : {game}, {message} — {link}',
    '📅 On se retrouve pour du {game} bientôt ! {message} {link}',
    "📅 Save the date : {game} arrive, {message} {link}",
  ],
  ending: [
    "✅ Stream terminé ! Merci d'être passés, {message} À bientôt ! {link}",
    '✅ Fin du live {game}, merci pour cette session {message} {link}',
    '💜 Merci à tous pour ce live {game} ! {message} {link}',
  ],
};

const DISCORD_TEMPLATES = {
  live: [
    '@everyone 🔴 **En live maintenant** sur **{game}** !\n{message}\n👉 {link}',
    "🔴 C'est le moment, je lance **{game}** en direct !\n{message}\n👉 {link}",
  ],
  announcement: [
    '📅 **Prochain stream** : **{game}**\n{message}\n👉 {link}',
    "📅 On prévoit du **{game}** prochainement !\n{message}\nRendez-vous ici : {link}",
  ],
  ending: [
    "✅ **Stream terminé**, merci à tous pour votre présence sur **{game}** !\n{message}\n👉 Le prochain arrive bientôt.",
    '💜 Merci pour ce super moment sur **{game}** !\n{message}',
  ],
};

const INSTAGRAM_TEMPLATES = {
  live: [
    "🔴 En direct sur {game} juste maintenant ✨ Rejoins-moi sur Twitch (lien en bio) ! {message}",
    '🔴 Live time ! {game} sur Twitch, viens dire coucou 💜 {message}',
  ],
  announcement: [
    '📅 Prochain live prévu : {game} ! {message} Lien en bio pour ne rien louper.',
    '📅 Save the date, on se retrouve pour du {game} bientôt 💫 {message}',
  ],
  ending: [
    "✅ Merci pour ce live sur {game} 💜 {message} À très vite pour le prochain !",
    "💜 Quelle session sur {game} ! Merci d'être là, {message}",
  ],
};

const TIKTOK_TEMPLATES = {
  live: [
    "🔴 En live sur {game} juste maintenant, viens sur Twitch ! {message} {link}",
    '🔴 {game} en direct ! {message} {link}',
  ],
  announcement: [
    '📅 Prochain live {game} bientôt ! {message} {link}',
    '📅 On se retrouve pour du {game} ! {message} {link}',
  ],
  ending: [
    "✅ Merci pour ce live {game} ! {message} {link}",
    '💜 Fin du stream {game}, merci à tous ! {message} {link}',
  ],
};

const YOUTUBE_TEMPLATES = {
  live: [
    '🔴 En direct sur {game} en ce moment sur Twitch ! {message} {link}',
    '🔴 Live {game} maintenant : {link} {message}',
  ],
  announcement: [
    '📅 Prochain live {game} à venir sur Twitch. {message} {link}',
    '📅 Save the date pour du {game} ! {message} {link}',
  ],
  ending: [
    "✅ Merci d'avoir suivi ce live {game} ! {message} {link}",
    '💜 Stream {game} terminé, merci à tous ! {message} {link}',
  ],
};

const PLATFORM_TEMPLATES = {
  twitter: () => TWITTER_TEMPLATES,
  discord: () => DISCORD_TEMPLATES,
  instagram: () => INSTAGRAM_TEMPLATES,
  tiktok: () => TIKTOK_TEMPLATES,
  youtube: () => YOUTUBE_TEMPLATES,
};

const MOOD_HASHTAGS = {
  chill: ['ChillStream', 'CozyGaming'],
  hype: ['Hype', 'GoodVibes'],
  decouverte: ['FirstPlaythrough', 'Discovery'],
  retro: ['RetroGaming', 'Nostalgia'],
  communaute: ['Community', 'ChatPlaysAlong'],
  challenge: ['Challenge', 'Hardcore'],
};

const GENERIC_HASHTAGS = ['Twitch', 'TwitchFR', 'French', 'LiveStream'];

function slugifyTag(text) {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .trim();
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildHashtags(game, mood) {
  const list = [
    ...(game ? [slugifyTag(game)] : []),
    ...(MOOD_HASHTAGS[mood] || []),
    ...GENERIC_HASHTAGS,
  ].filter(Boolean);
  return [...new Set(list)].slice(0, 6).map((t) => `#${t}`).join(' ');
}

function fillTemplate(tpl, { game, message, link, hashtags }) {
  return tpl
    .replaceAll('{game}', game || 'le stream')
    .replaceAll('{message}', message || '')
    .replaceAll('{link}', link || '')
    .replace(/\s+/g, ' ')
    .trim() + (hashtags ? `\n\n${hashtags}` : '');
}

// links: { twitter, discord, instagram, tiktok, youtube }, platforms: { twitter: bool, ... }
// Seuls les réseaux activés (platforms[x] === true) génèrent un post, avec leur propre lien configuré.
function generateSocialPosts({ game, message, mood, moment, links = {}, platforms = {} }) {
  const safeMoment = MOMENT_LABELS[moment] ? moment : 'live';
  const hashtags = buildHashtags(game, mood);

  const posts = {};
  for (const platform of Object.keys(PLATFORM_TEMPLATES)) {
    if (!platforms[platform]) continue;
    const templates = PLATFORM_TEMPLATES[platform]();
    posts[platform] = fillTemplate(pickRandom(templates[safeMoment]), {
      game,
      message,
      link: links[platform],
      hashtags,
    });
  }
  return posts;
}

module.exports = { generateSocialPosts };
