const form = document.getElementById('form');
const loginInput = document.getElementById('login');
const hueInput = document.getElementById('hue');
const statusEl = document.getElementById('status');
const speciesGrid = document.getElementById('species-grid');
const pickerBlock = document.getElementById('picker-block');
const reservedNotice = document.getElementById('reserved-notice');
const notFollowerNotice = document.getElementById('not-follower-notice');

const previewImg = document.getElementById('preview-img');
const previewName = document.getElementById('preview-name');

let speciesList = [];
let selectedSpecies = null;
let isReserved = false;
let isNotFollower = false;

function renderSpeciesGrid() {
  speciesGrid.innerHTML = '';
  speciesList.forEach((s) => {
    const locked = s.locked && !s.unlocked;
    const opt = document.createElement('div');
    opt.className = `species-option${locked ? ' locked' : ''}`;
    opt.dataset.id = s.id;
    opt.innerHTML = `<img src="${s.src}" alt="${s.label}"><span>${s.label}</span>${locked ? `<span class="locked-badge">🔒 ${s.cost} points</span>` : ''}`;
    if (!locked) opt.addEventListener('click', () => selectSpecies(s.id));
    speciesGrid.appendChild(opt);
  });
  // si l'avatar sélectionné vient d'être verrouillé (changement côté admin) ou n'existe plus,
  // retombe sur le premier disponible plutôt que de laisser une sélection invalide.
  const current = speciesList.find((s) => s.id === selectedSpecies);
  if (!current || (current.locked && !current.unlocked)) {
    selectSpecies(speciesList.find((s) => !s.locked || s.unlocked)?.id);
  } else {
    selectSpecies(selectedSpecies);
  }
}

// Sans pseudo connu, on ne peut pas savoir ce que le viewer a débloqué : uniquement les gratuits.
async function loadSpecies() {
  const res = await fetch('/api/species');
  speciesList = (await res.json()).map((s) => ({ ...s, locked: false, unlocked: true }));
  renderSpeciesGrid();
}

// Une fois le pseudo connu, recharge avec les avatars verrouillés (affichés mais non cliquables,
// avec leur prix) en plus des gratuits, pour que les viewers découvrent ce qui existe.
async function loadSpeciesFor(login) {
  const res = await fetch(`/api/species?login=${encodeURIComponent(login)}`);
  speciesList = await res.json();
  renderSpeciesGrid();
}

function selectSpecies(id) {
  selectedSpecies = id;
  [...speciesGrid.children].forEach((el) => el.classList.toggle('selected', el.dataset.id === id));
  updatePreview();
}

function currentSpecies() {
  return speciesList.find((s) => s.id === selectedSpecies);
}

function updatePreview() {
  const species = currentSpecies();
  if (species) previewImg.src = species.src;
  previewImg.style.filter = `hue-rotate(${hueInput.value}deg)`;
  previewName.textContent = loginInput.value.trim() || 'pseudo';
}

hueInput.addEventListener('input', updatePreview);
loginInput.addEventListener('input', updatePreview);

let checkTimer;
loginInput.addEventListener('input', () => {
  clearTimeout(checkTimer);
  checkTimer = setTimeout(checkReserved, 400);
});

async function checkReserved() {
  const login = loginInput.value.trim().toLowerCase();
  if (!login) return;
  try {
    const res = await fetch(`/api/avatar/${encodeURIComponent(login)}`);
    const skin = await res.json();
    isReserved = skin.species === 'mon-avatar';
    isNotFollower = !isReserved && !skin.follows;
    reservedNotice.hidden = !isReserved;
    notFollowerNotice.hidden = !isNotFollower;
    pickerBlock.hidden = isReserved || isNotFollower;
    if (isReserved) {
      previewImg.src = '/overlay/sprites/mon-avatar.png';
      previewImg.style.filter = 'none';
    } else if (!isNotFollower) {
      await loadSpeciesFor(login);
    }
  } catch {
    // pas bloquant si la vérification échoue
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const login = loginInput.value.trim().toLowerCase();
  if (!login || isReserved || isNotFollower || !selectedSpecies) return;

  statusEl.textContent = 'Enregistrement...';
  try {
    const res = await fetch(`/api/avatar/${encodeURIComponent(login)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speciesId: selectedSpecies, hue: Number(hueInput.value) }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'échec');
    }
    statusEl.textContent = 'Avatar enregistré ! Il apparaîtra au prochain message dans le chat.';
  } catch (err) {
    statusEl.textContent = err.message || "Erreur lors de l'enregistrement, réessaie.";
    console.error(err);
  }
});

loadSpecies();
