// Registre des sprites disponibles. "reserved: true" = non sélectionnable par les viewers.
// "mirrorable: false" = sprite dessiné de face (pas de profil) : on ne le retourne jamais selon le sens de marche.
const SPECIES = [
  { id: 'mon-avatar', label: 'MissGysmo', file: 'mon-avatar.png', reserved: true, mirrorable: false },
  { id: 'cat', label: 'Chat', file: 'cat.png' },
  { id: 'cosmic-cat', label: 'Chat cosmique', file: 'cosmic-cat.png' },
  { id: 'cyber-unicorn', label: 'Licorne cyber', file: 'cyber-unicorn.png' },
  { id: 'dino', label: 'Dino', file: 'dino.png' },
  { id: 'girl', label: 'Fille', file: 'girl.png', mirrorable: false },
  { id: 'grunge-boy', label: 'Grunge', file: 'grunge-boy.png', mirrorable: false },
  { id: 'unicorn', label: 'Licorne', file: 'unicorn.png' },
];

function getSelectable() {
  return SPECIES.filter((s) => !s.reserved);
}

function getById(id) {
  return SPECIES.find((s) => s.id === id) || null;
}

module.exports = { SPECIES, getSelectable, getById };
