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
};

const EVENT_TYPES = ['follow', 'subscribe', 'cheer', 'raid'];
const eventFields = {};
for (const type of EVENT_TYPES) {
  eventFields[type] = {
    text: document.getElementById(`evt-${type}-text`),
    color: document.getElementById(`evt-${type}-color`),
    size: document.getElementById(`evt-${type}-size`),
    sizeOut: document.getElementById(`evt-${type}-size-out`),
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
  }
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
  movementPatternEl.value = s.movementPattern;
  mirrorOnDirectionEl.checked = s.mirrorOnDirection;
  transitionEffectEl.checked = s.transitionEffect;
  nameShowEl.checked = s.nameTag.show;
  nameColorEl.value = s.nameTag.color;
  for (const type of EVENT_TYPES) {
    eventFields[type].text.value = s.events[type].text;
    eventFields[type].color.value = s.events[type].color;
    eventFields[type].size.value = s.events[type].fontSize;
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
    mirrorOnDirection: mirrorOnDirectionEl.checked,
    inactivityMinutes: Number(fields.inactivityMinutes.el.value),
    transitionEffect: transitionEffectEl.checked,
    nameTag: {
      show: nameShowEl.checked,
      fontSize: Number(fields.nameFontSize.el.value),
      color: nameColorEl.value,
    },
    events: Object.fromEntries(EVENT_TYPES.map((type) => [type, {
      text: eventFields[type].text.value,
      color: eventFields[type].color.value,
      fontSize: Number(eventFields[type].size.value),
    }])),
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

loadSettings();

document.getElementById('logout')?.addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  location.reload();
});
