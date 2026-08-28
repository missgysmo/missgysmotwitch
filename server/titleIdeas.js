// Générateur local de titres/tags de stream : purement combinatoire, aucune API externe.

const MOOD_EMOJI = {
  chill: '🌙',
  hype: '⚡',
  decouverte: '🔍',
  retro: '👾',
  communaute: '💬',
  challenge: '🔥',
};

const MOOD_WORDS = {
  chill: ['chill', 'tranquille', 'détente', 'cosy'],
  hype: ['hype', 'à fond', 'énergique', 'explosif'],
  decouverte: ['découverte', 'premier run', 'exploration', 'un peu perdue mais ça va'],
  retro: ['rétro', 'nostalgie', 'classique', 'old school'],
  communaute: ['avec vous', 'entre nous', 'interactif', 'on papote'],
  challenge: ['challenge', 'difficile', 'sous pression', 'sans mourir (ou presque)'],
};

const TITLE_TEMPLATES = [
  '{emoji} {game} — session {moodWord} !',
  '{game} : {moodWord} du soir {emoji}',
  '{emoji} On lance {game} ({moodWord})',
  '{game} {emoji} {keyword}',
  '{emoji} {keyword} sur {game} !',
  '{game} — {keyword}, {moodWord}',
  'Ce soir : {game} {emoji} {moodWord}',
  '{emoji} {game} : {keyword} avec la communauté',
  '{game} {emoji} venez comme vous êtes',
  '{keyword} {emoji} ({game})',
];

const GENERIC_TAGS = ['French', 'FrenchStreamer', 'Twitch', 'LiveStream', 'community'];

const MOOD_TAGS = {
  chill: ['ChillStream', 'CozyGaming', 'Relax'],
  hype: ['Hype', 'HighEnergy', 'GoodVibes'],
  decouverte: ['FirstPlaythrough', 'Discovery', 'BlindPlaythrough'],
  retro: ['RetroGaming', 'Nostalgia', 'Classic'],
  communaute: ['Interactive', 'ChatPlaysAlong', 'CommunityStream'],
  challenge: ['Challenge', 'Hardcore', 'NoDeathRun'],
};

function slugifyTag(text) {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .trim();
}

function pickRandom(arr, n) {
  const copy = [...arr];
  const out = [];
  while (copy.length && out.length < n) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}

function generateTitleIdeas({ game, keywords, mood }) {
  const safeGame = (game || 'le stream').trim() || 'le stream';
  const moodKey = MOOD_WORDS[mood] ? mood : 'chill';
  const emoji = MOOD_EMOJI[moodKey];
  const keywordList = (keywords || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  const keywordPool = keywordList.length ? keywordList : MOOD_WORDS[moodKey];

  const titles = pickRandom(TITLE_TEMPLATES, 8).map((tpl) => {
    const moodWord = MOOD_WORDS[moodKey][Math.floor(Math.random() * MOOD_WORDS[moodKey].length)];
    const keyword = keywordPool[Math.floor(Math.random() * keywordPool.length)];
    return tpl
      .replaceAll('{game}', safeGame)
      .replaceAll('{emoji}', emoji)
      .replaceAll('{moodWord}', moodWord)
      .replaceAll('{keyword}', keyword)
      .replace(/\s+/g, ' ')
      .trim();
  });

  const tags = [
    ...new Set([
      ...(safeGame !== 'le stream' ? [slugifyTag(safeGame)] : []),
      ...MOOD_TAGS[moodKey],
      ...keywordList.map(slugifyTag).filter(Boolean),
      ...GENERIC_TAGS,
    ]),
  ].slice(0, 10);

  return { titles: [...new Set(titles)], tags };
}

module.exports = { generateTitleIdeas };
