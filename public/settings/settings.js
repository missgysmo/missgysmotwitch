const form = document.getElementById('form');
const statusEl = document.getElementById('status');
const zoneBox = document.getElementById('zone-box');
const corridorLine = document.getElementById('corridor-line');

const fields = {
  avatarSize: { el: document.getElementById('avatarSize'), out: document.getElementById('avatarSize-out'), fmt: (v) => `${v}px` },
  transitionSeconds: { el: document.getElementById('transitionSeconds'), out: document.getElementById('transitionSeconds-out'), fmt: (v) => `${v}s` },
  moveIntervalMs: { el: document.getElementById('moveIntervalMs'), out: document.getElementById('moveIntervalMs-out'), fmt: (v) => `${(v / 1000).toFixed(1)}s` },
  moveVarianceMs: { el: document.getElementById('moveVarianceMs'), out: document.getElementById('moveVarianceMs-out'), fmt: (v) => `±${(v / 1000).toFixed(1)}s` },
  zoneTop: { el: document.getElementById('zoneTop'), out: document.getElementById('zoneTop-out'), fmt: (v) => `${v}%` },
  zoneBottom: { el: document.getElementById('zoneBottom'), out: document.getElementById('zoneBottom-out'), fmt: (v) => `${v}%` },
  zoneLeft: { el: document.getElementById('zoneLeft'), out: document.getElementById('zoneLeft-out'), fmt: (v) => `${v}%` },
  zoneRight: { el: document.getElementById('zoneRight'), out: document.getElementById('zoneRight-out'), fmt: (v) => `${v}%` },
  inactivityMinutes: { el: document.getElementById('inactivityMinutes'), out: document.getElementById('inactivityMinutes-out'), fmt: (v) => `${v} min` },
  nameFontSize: { el: document.getElementById('nameFontSize'), out: document.getElementById('nameFontSize-out'), fmt: (v) => `${v}px` },
  corridorPosition: { el: document.getElementById('corridorPosition'), out: document.getElementById('corridorPosition-out'), fmt: (v) => `${v}%` },
  ownerHue: { el: document.getElementById('ownerHue'), out: document.getElementById('ownerHue-out'), fmt: (v) => `${v}°` },
  ownerSize: { el: document.getElementById('ownerSize'), out: document.getElementById('ownerSize-out'), fmt: (v) => `${v}px` },
};

const EVENT_TYPES = ['follow', 'subscribe', 'cheer', 'raid'];
const eventFields = {};
for (const type of EVENT_TYPES) {
  eventFields[type] = {
    enabled: document.getElementById(`evt-${type}-enabled`),
    showText: document.getElementById(`evt-${type}-showtext`),
    text: document.getElementById(`evt-${type}-text`),
    color: document.getElementById(`evt-${type}-color`),
    size: document.getElementById(`evt-${type}-size`),
    sizeOut: document.getElementById(`evt-${type}-size-out`),
    reaction: document.getElementById(`evt-${type}-reaction`),
    posX: document.getElementById(`evt-${type}-posx`),
    posXOut: document.getElementById(`evt-${type}-posx-out`),
    posY: document.getElementById(`evt-${type}-posy`),
    posYOut: document.getElementById(`evt-${type}-posy-out`),
  };
}

const movementPatternEl = document.getElementById('movementPattern');
const mirrorOnDirectionEl = document.getElementById('mirrorOnDirection');
const transitionEffectEl = document.getElementById('transitionEffect');
const nameShowEl = document.getElementById('nameShow');
const nameColorEl = document.getElementById('nameColor');

function updateOutputs() {
  for (const f of Object.values(fields)) {
    f.out.textContent = f.fmt(Number(f.el.value));
  }
  for (const type of EVENT_TYPES) {
    eventFields[type].sizeOut.textContent = `${eventFields[type].size.value}px`;
    eventFields[type].posXOut.textContent = `${eventFields[type].posX.value}%`;
    eventFields[type].posYOut.textContent = `${eventFields[type].posY.value}%`;
  }
  fields.ownerHue.el.style.setProperty('--hue', fields.ownerHue.el.value);
  updateZonePreview();
}

function updateZonePreview() {
  const top = Number(fields.zoneTop.el.value);
  const bottom = Number(fields.zoneBottom.el.value);
  const left = Number(fields.zoneLeft.el.value);
  const right = Number(fields.zoneRight.el.value);
  zoneBox.style.top = `${top}%`;
  zoneBox.style.bottom = `${bottom}%`;
  zoneBox.style.left = `${left}%`;
  zoneBox.style.right = `${right}%`;
  updateCorridorLine();
}

function updateCorridorLine() {
  const pattern = movementPatternEl.value;
  const pos = Number(fields.corridorPosition.el.value);
  corridorLine.className = pattern === 'horizontal' ? 'horizontal' : pattern === 'vertical' ? 'vertical' : '';
  if (pattern === 'horizontal') corridorLine.style.top = `${pos}%`;
  if (pattern === 'vertical') corridorLine.style.left = `${pos}%`;
}

Object.values(fields).forEach((f) => f.el.addEventListener('input', updateOutputs));
movementPatternEl.addEventListener('input', updateCorridorLine);
for (const type of EVENT_TYPES) {
  eventFields[type].size.addEventListener('input', updateOutputs);
  eventFields[type].posX.addEventListener('input', updateOutputs);
  eventFields[type].posY.addEventListener('input', updateOutputs);
}

async function loadSettings() {
  const res = await fetch('/api/settings');
  const s = await res.json();
  fields.avatarSize.el.value = s.avatarSize;
  fields.transitionSeconds.el.value = s.transitionSeconds;
  fields.moveIntervalMs.el.value = s.moveIntervalMs;
  fields.moveVarianceMs.el.value = s.moveVarianceMs;
  fields.zoneTop.el.value = s.zone.top;
  fields.zoneBottom.el.value = s.zone.bottom;
  fields.zoneLeft.el.value = s.zone.left;
  fields.zoneRight.el.value = s.zone.right;
  fields.inactivityMinutes.el.value = s.inactivityMinutes;
  fields.nameFontSize.el.value = s.nameTag.fontSize;
  fields.corridorPosition.el.value = s.corridorPosition;
  fields.ownerHue.el.value = s.ownerHue;
  fields.ownerSize.el.value = s.ownerSize;
  movementPatternEl.value = s.movementPattern;
  mirrorOnDirectionEl.checked = s.mirrorOnDirection;
  transitionEffectEl.checked = s.transitionEffect;
  nameShowEl.checked = s.nameTag.show;
  nameColorEl.value = s.nameTag.color;
  for (const type of EVENT_TYPES) {
    eventFields[type].enabled.checked = s.events[type].enabled;
    eventFields[type].showText.checked = s.events[type].showText;
    eventFields[type].text.value = s.events[type].text;
    eventFields[type].color.value = s.events[type].color;
    eventFields[type].size.value = s.events[type].fontSize;
    eventFields[type].reaction.value = s.events[type].reaction;
    eventFields[type].posX.value = s.events[type].position.x;
    eventFields[type].posY.value = s.events[type].position.y;
  }
  for (const id in spriteFlipFields) {
    spriteFlipFields[id].checked = !!s.spriteFlip[id];
  }
  updateOutputs();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusEl.textContent = 'Enregistrement...';
  const payload = {
    avatarSize: Number(fields.avatarSize.el.value),
    transitionSeconds: Number(fields.transitionSeconds.el.value),
    moveIntervalMs: Number(fields.moveIntervalMs.el.value),
    moveVarianceMs: Number(fields.moveVarianceMs.el.value),
    zone: {
      top: Number(fields.zoneTop.el.value),
      bottom: Number(fields.zoneBottom.el.value),
      left: Number(fields.zoneLeft.el.value),
      right: Number(fields.zoneRight.el.value),
    },
    movementPattern: movementPatternEl.value,
    corridorPosition: Number(fields.corridorPosition.el.value),
    ownerHue: Number(fields.ownerHue.el.value),
    ownerSize: Number(fields.ownerSize.el.value),
    mirrorOnDirection: mirrorOnDirectionEl.checked,
    inactivityMinutes: Number(fields.inactivityMinutes.el.value),
    transitionEffect: transitionEffectEl.checked,
    nameTag: {
      show: nameShowEl.checked,
      fontSize: Number(fields.nameFontSize.el.value),
      color: nameColorEl.value,
    },
    events: Object.fromEntries(EVENT_TYPES.map((type) => [type, {
      enabled: eventFields[type].enabled.checked,
      showText: eventFields[type].showText.checked,
      text: eventFields[type].text.value,
      color: eventFields[type].color.value,
      fontSize: Number(eventFields[type].size.value),
      reaction: eventFields[type].reaction.value,
      position: { x: Number(eventFields[type].posX.value), y: Number(eventFields[type].posY.value) },
    }])),
    spriteFlip: Object.fromEntries(Object.entries(spriteFlipFields).map(([id, cb]) => [id, cb.checked])),
  };
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    statusEl.textContent = 'Réglages appliqués sur l\'overlay !';
  } catch (err) {
    statusEl.textContent = 'Erreur lors de l\'enregistrement.';
    console.error(err);
  }
});

loadTestAvatars().then(loadSettings);

document.getElementById('logout')?.addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  location.reload();
});

document.querySelectorAll('.nav-tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('[data-nav-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.navPanel !== btn.dataset.tab;
    });
  });
});

const spriteFlipFields = { 'mon-avatar': document.getElementById('ownerFlip') };

async function loadTestAvatars() {
  const res = await fetch('/api/species');
  const list = await res.json();
  const container = document.getElementById('test-avatar-list');
  container.innerHTML = '';
  list.forEach((s) => {
    const row = document.createElement('div');
    row.className = 'test-avatar-row';
    row.innerHTML = `
      <span>${s.label}</span>
      <label class="test-avatar-flip-label">
        <input type="checkbox" class="test-avatar-flip" data-species="${s.id}" />
        Inverser l'orientation
      </label>
      <button type="button" class="test-avatar-show" data-species="${s.id}">Faire apparaître</button>
      <button type="button" class="test-avatar-hide" data-species="${s.id}">Retirer</button>
    `;
    container.appendChild(row);
    spriteFlipFields[s.id] = row.querySelector('.test-avatar-flip');
  });
  container.querySelectorAll('.test-avatar-show').forEach((btn) => {
    btn.addEventListener('click', () => fetch(`/api/admin/test-avatar/${btn.dataset.species}`, { method: 'POST' }));
  });
  container.querySelectorAll('.test-avatar-hide').forEach((btn) => {
    btn.addEventListener('click', () => fetch(`/api/admin/test-avatar/${btn.dataset.species}`, { method: 'DELETE' }));
  });
  container.querySelectorAll('.test-avatar-flip').forEach((cb) => {
    cb.addEventListener('change', () => {
      form.requestSubmit();
    });
  });
  return list;
}

document.getElementById('clear-test-avatars').addEventListener('click', () => {
  fetch('/api/admin/test-avatar', { method: 'DELETE' });
});

document.querySelectorAll('.test-event-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'Envoi...';
    try {
      await fetch(`/api/admin/test-event/${btn.dataset.type}`, { method: 'POST' });
    } finally {
      btn.textContent = original;
      btn.disabled = false;
    }
  });
});
