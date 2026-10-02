const baseSpecies = require('./species');

// Fusionne le catalogue codé en dur (species.js) avec les avatars personnalisés ajoutés par
// l'admin (store.getCustomSpecies()) et l'état activé/désactivé (store.getSpeciesEnabled()) —
// un seul point d'entrée pour tout ce qui doit connaître "la liste des avatars", qu'ils soient
// natifs ou uploadés.
function createSpeciesCatalog({ store }) {
  function getAll() {
    const enabledMap = store.getSpeciesEnabled();
    const custom = store.getCustomSpecies().map((s) => ({ ...s, custom: true }));
    return [...baseSpecies.SPECIES, ...custom].map((s) => ({
      ...s,
      enabled: enabledMap[s.id] !== false,
      src: s.custom ? `/avatar-sprites/${s.file}` : `/overlay/sprites/${s.file}`,
    }));
  }

  function getSelectable() {
    return getAll().filter((s) => !s.reserved && s.enabled);
  }

  function getById(id) {
    return getAll().find((s) => s.id === id) || null;
  }

  return { getAll, getSelectable, getById };
}

module.exports = { createSpeciesCatalog };
