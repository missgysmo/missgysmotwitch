const baseSpecies = require('./species');

// Fusionne le catalogue codé en dur (species.js) avec les avatars personnalisés ajoutés par
// l'admin (store.getCustomSpecies()), l'état activé/désactivé (store.getSpeciesEnabled()), et le
// verrouillage contre des points de chaîne (store.getSpeciesRewards()) — un seul point d'entrée
// pour tout ce qui doit connaître "la liste des avatars".
function createSpeciesCatalog({ store }) {
  function getAll() {
    const enabledMap = store.getSpeciesEnabled();
    const rewards = store.getSpeciesRewards();
    const custom = store.getCustomSpecies().map((s) => ({ ...s, custom: true }));
    return [...baseSpecies.SPECIES, ...custom].map((s) => ({
      ...s,
      enabled: enabledMap[s.id] !== false,
      src: s.custom ? `/avatar-sprites/${s.file}` : `/overlay/sprites/${s.file}`,
      reward: rewards[s.id] || null,
    }));
  }

  // Sélectionnables gratuitement (sans tenir compte d'un viewer précis) : exclut les avatars
  // verrouillés contre des points. Utilisé pour l'attribution aléatoire par défaut (defaultSkin) —
  // on ne veut jamais qu'un avatar payant tombe au hasard sur quelqu'un qui ne l'a pas débloqué.
  function getSelectable() {
    return getAll().filter((s) => !s.reserved && s.enabled && !s.reward);
  }

  // Sélectionnables pour CE viewer précis : les gratuits + ceux qu'il a débloqués avec des points.
  function getSelectableFor(login) {
    const unlocked = new Set(store.getUnlockedAvatars(login));
    return getAll().filter((s) => !s.reserved && s.enabled && (!s.reward || unlocked.has(s.id)));
  }

  function getById(id) {
    return getAll().find((s) => s.id === id) || null;
  }

  function isAvailableFor(login, id) {
    const match = getById(id);
    if (!match || match.reserved || !match.enabled) return false;
    if (!match.reward) return true;
    return store.getUnlockedAvatars(login).includes(id);
  }

  return { getAll, getSelectable, getSelectableFor, getById, isAvailableFor };
}

module.exports = { createSpeciesCatalog };
