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
  { id: 'alien', label: 'Alien', file: 'alien.png' },
  { id: 'boy', label: 'Garçon casque', file: 'boy.png' },
  { id: 'cyber-triceratops', label: 'Cyber tricératops', file: 'cyber-triceratops.png' },
  { id: 'cyber-raptor', label: 'Cyber raptor', file: 'cyber-raptor.png' },
  { id: 'cyber-puppy', label: 'Chiot cyber', file: 'cyber-puppy.png' },
  { id: 'cyber-wolf', label: 'Loup cyber', file: 'cyber-wolf.png' },
  { id: 'gothic-girl', label: 'Fille gothique', file: 'gothic-girl.png' },
  { id: 'guerriere', label: 'Guerrière', file: 'guerriere.png' },
  { id: 'ninja', label: 'Ninja', file: 'ninja.png' },
  { id: 'panda', label: 'Panda', file: 'panda.png' },
  { id: 'pizza', label: 'Pizza', file: 'pizza.png' },
  { id: 'skate-boy', label: 'Skateur', file: 'skate-boy.png' },
  { id: 'witch', label: 'Sorcière', file: 'witch.png' },
];

function getSelectable() {
  return SPECIES.filter((s) => !s.reserved);
}

function getById(id) {
  return SPECIES.find((s) => s.id === id) || null;
}

module.exports = { SPECIES, getSelectable, getById };
