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

async function loadSpecies() {
  const res = await fetch('/api/species');
  speciesList = await res.json();
  speciesGrid.innerHTML = '';
  speciesList.forEach((s) => {
    const opt = document.createElement('div');
    opt.className = 'species-option';
    opt.dataset.id = s.id;
    opt.innerHTML = `<img src="/overlay/sprites/${s.file}" alt="${s.label}"><span>${s.label}</span>`;
    opt.addEventListener('click', () => selectSpecies(s.id));
    speciesGrid.appendChild(opt);
  });
  selectSpecies(speciesList[0]?.id);
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
  if (species) previewImg.src = `/overlay/sprites/${species.file}`;
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
      updatePreview();
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
