const crypto = require('crypto');

// Dérivé du mot de passe (plutôt que des octets aléatoires) pour que le token reste stable
// entre deux redémarrages du process : un déploiement ne déconnecte plus les sessions admin
// déjà ouvertes dans le navigateur.
function deriveAdminToken(settingsPassword) {
  return crypto.createHash('sha256').update(settingsPassword).digest('hex');
}
const ADMIN_COOKIE = 'admin_token';

function getCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  const found = header.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.split('=')[1]) : null;
}

function isAdmin(req, adminToken) {
  return getCookie(req, ADMIN_COOKIE) === adminToken;
}

function makeRequireAdmin(adminToken) {
  return (req, res, next) => {
    if (!isAdmin(req, adminToken)) return res.status(401).json({ error: 'Non autorisé, connecte-toi sur /settings' });
    next();
  };
}

// Comparaison en temps constant : évite qu'une différence de timing serve à deviner le mot de passe caractère par caractère.
function makeSafePasswordEquals(settingsPassword) {
  const expected = Buffer.from(settingsPassword);
  return (candidate) => {
    const a = Buffer.from(String(candidate ?? ''));
    if (a.length !== expected.length) return false;
    return crypto.timingSafeEqual(a, expected);
  };
}

// Railway insère plusieurs hops de proxy internes devant l'app (leur adresse change à chaque
// requête), donc req.ip d'Express (même avec trust proxy) ne reflète pas le vrai client — on lit
// directement le premier maillon de X-Forwarded-For, qui est toujours le client d'origine.
function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return req.socket.remoteAddress;
}

// Petit limiteur de débit en mémoire (par IP), sans dépendance externe.
// Nettoie lui-même ses entrées périodiquement pour ne pas fuir de mémoire.
function createRateLimiter({ windowMs, max, message }) {
  const hits = new Map(); // ip -> [timestamps]
  setInterval(() => {
    const now = Date.now();
    for (const [ip, arr] of hits) {
      const kept = arr.filter((t) => now - t < windowMs);
      if (kept.length) hits.set(ip, kept);
      else hits.delete(ip);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    const ip = getClientIp(req);
    const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) {
      return res.status(429).json({ error: message || 'Trop de tentatives, réessaie plus tard.' });
    }
    arr.push(now);
    hits.set(ip, arr);
    next();
  };
}

module.exports = {
  deriveAdminToken,
  ADMIN_COOKIE,
  isAdmin,
  makeRequireAdmin,
  makeSafePasswordEquals,
  getClientIp,
  createRateLimiter,
};
