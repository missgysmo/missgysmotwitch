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

const speciesTabs = document.getElementById('species-tabs');
const speciesEmpty = document.getElementById('species-empty');

let speciesList = [];
let selectedSpecies = null;
let isReserved = false;
let isNotFollower = false;
let knowsViewer = false; // pseudo vérifié : on connaît ses avatars débloqués

// Onglets : "Mes avatars" (gratuits + débloqués avec des points, une fois le pseudo connu),
// puis une entrée par collection définie dans le panneau, puis "Autres" (sans collection).
const TAB_MINE = '__mine__';
const TAB_NONE = '__none__';
let currentTab = null;

const escapeHtml = (str) => String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isOwned = (s) => !s.locked || s.unlocked;

function buildTabs() {
  const collections = [...new Set(speciesList.map((s) => s.collection).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'fr'));
  const tabs = [];
  if (knowsViewer) tabs.push({ key: TAB_MINE, label: 'Mes avatars', items: speciesList.filter(isOwned) });
  collections.forEach((c) => tabs.push({ key: c, label: c, items: speciesList.filter((s) => s.collection === c) }));
  const sansCollection = speciesList.filter((s) => !s.collection);
  if (sansCollection.length) {
    tabs.push({ key: TAB_NONE, label: collections.length ? 'Autres' : 'Tous les avatars', items: sansCollection });
  }
  return tabs;
}

function renderSpeciesGrid() {
  const tabs = buildTabs();
  if (!tabs.some((t) => t.key === currentTab)) currentTab = tabs[0]?.key ?? null;
  const active = tabs.find((t) => t.key === currentTab);

  // Un seul onglet : inutile d'afficher la barre d'onglets.
  speciesTabs.innerHTML = tabs.length > 1 ? tabs.map((t) => `
    <button type="button" class="species-tab${t.key === currentTab ? ' active' : ''}" data-tab="${escapeHtml(t.key)}" role="tab">
      ${escapeHtml(t.label)}<span class="tab-count">${t.items.length}</span>
    </button>`).join('') : '';

  speciesGrid.innerHTML = '';
  (active?.items || []).forEach((s) => {
    const locked = s.locked && !s.unlocked;
    const opt = document.createElement('div');
    opt.className = `species-option${locked ? ' locked' : ''}`;
    opt.dataset.id = s.id;
    const badge = locked
      ? `<span class="locked-badge">🔒 ${s.cost} points</span>`
      : (s.locked ? '<span class="owned-badge">✔ Débloqué</span>' : '');
    opt.innerHTML = `<img src="${s.src}" alt="${escapeHtml(s.label)}"><span>${escapeHtml(s.label)}</span>${badge}`;
    if (!locked) opt.addEventListener('click', () => selectSpecies(s.id));
    speciesGrid.appendChild(opt);
  });
  speciesEmpty.hidden = !!active?.items.length;
  speciesEmpty.textContent = currentTab === TAB_MINE ? "Tu n'as encore aucun avatar." : 'Aucun avatar dans cette collection.';

  // si l'avatar sélectionné vient d'être verrouillé (changement côté admin) ou n'existe plus,
  // retombe sur le premier disponible plutôt que de laisser une sélection invalide.
  const current = speciesList.find((s) => s.id === selectedSpecies);
  if (!current || !isOwned(current)) {
    selectSpecies(speciesList.find(isOwned)?.id);
  } else {
    selectSpecies(selectedSpecies);
  }
}

speciesTabs.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tab]');
  if (!btn) return;
  currentTab = btn.dataset.tab;
  renderSpeciesGrid();
});

// Sans pseudo connu, on ne peut pas savoir ce que le viewer a débloqué : uniquement les gratuits.
async function loadSpecies() {
  const res = await fetch('/api/species');
  speciesList = (await res.json()).map((s) => ({ ...s, locked: false, unlocked: true }));
  knowsViewer = false;
  renderSpeciesGrid();
}

// Une fois le pseudo connu, recharge avec les avatars verrouillés (affichés mais non cliquables,
// avec leur prix) en plus des gratuits, pour que les viewers découvrent ce qui existe.
async function loadSpeciesFor(login) {
  const res = await fetch(`/api/species?login=${encodeURIComponent(login)}`);
  speciesList = await res.json();
  if (!knowsViewer) currentTab = TAB_MINE; // ouvre sur "Mes avatars" dès que le pseudo est reconnu
  knowsViewer = true;
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
