const form = document.getElementById('form');
const statusEl = document.getElementById('status');
const zoneBox = document.getElementById('zone-box');
const corridorLine = document.getElementById('corridor-line');
const zonePreviewEl = document.querySelector('.zone-preview');
const settingsLayoutEl = document.getElementById('settings-layout');
const previewMarkersEl = document.getElementById('preview-markers');

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
  ownerSize: { el: document.getElementById('ownerSize'), out: document.getElementById('ownerSize-out'), fmt: (v) => `${v}px` },
};

const ownerNameColorEl = document.getElementById('ownerNameColor');

const graffitiFields = {
  enabled: document.getElementById('graffiti-enabled'),
  cols: document.getElementById('graffiti-cols'),
  rows: document.getElementById('graffiti-rows'),
  cooldown: document.getElementById('graffiti-cooldown'),
  posX: document.getElementById('graffiti-posx'),
  posXOut: document.getElementById('graffiti-posx-out'),
  posY: document.getElementById('graffiti-posy'),
  posYOut: document.getElementById('graffiti-posy-out'),
  width: document.getElementById('graffiti-width'),
  widthOut: document.getElementById('graffiti-width-out'),
  height: document.getElementById('graffiti-height'),
  heightOut: document.getElementById('graffiti-height-out'),
};

const chatOverlayFields = {
  enabled: document.getElementById('chat-enabled'),
  maxMessages: document.getElementById('chat-maxmessages'),
  fontSize: document.getElementById('chat-fontsize'),
  fontSizeOut: document.getElementById('chat-fontsize-out'),
  textColor: document.getElementById('chat-textcolor'),
  colorMode: document.getElementById('chat-colormode'),
  style: document.getElementById('chat-style'),
  rotation: document.getElementById('chat-rotation'),
  rotationOut: document.getElementById('chat-rotation-out'),
  bgColor: document.getElementById('chat-bgcolor'),
  bgOpacity: document.getElementById('chat-bgopacity'),
  bgOpacityOut: document.getElementById('chat-bgopacity-out'),
  fadeSeconds: document.getElementById('chat-fadeseconds'),
  posX: document.getElementById('chat-posx'),
  posXOut: document.getElementById('chat-posx-out'),
  posY: document.getElementById('chat-posy'),
  posYOut: document.getElementById('chat-posy-out'),
  width: document.getElementById('chat-width'),
  widthOut: document.getElementById('chat-width-out'),
  height: document.getElementById('chat-height'),
  heightOut: document.getElementById('chat-height-out'),
};

const activityFeedFields = {
  enabled: document.getElementById('activity-enabled'),
  speed: document.getElementById('activity-speed'),
  fontSize: document.getElementById('activity-fontsize'),
  fontSizeOut: document.getElementById('activity-fontsize-out'),
  textColor: document.getElementById('activity-textcolor'),
  bgColor: document.getElementById('activity-bgcolor'),
  bgOpacity: document.getElementById('activity-bgopacity'),
  bgOpacityOut: document.getElementById('activity-bgopacity-out'),
  posX: document.getElementById('activity-posx'),
  posXOut: document.getElementById('activity-posx-out'),
  posY: document.getElementById('activity-posy'),
  posYOut: document.getElementById('activity-posy-out'),
  width: document.getElementById('activity-width'),
  widthOut: document.getElementById('activity-width-out'),
  height: document.getElementById('activity-height'),
  heightOut: document.getElementById('activity-height-out'),
};

const followListFields = {
  enabled: document.getElementById('followlist-enabled'),
  mode: document.getElementById('followlist-mode'),
  speed: document.getElementById('followlist-speed'),
  fontSize: document.getElementById('followlist-fontsize'),
  fontSizeOut: document.getElementById('followlist-fontsize-out'),
  textColor: document.getElementById('followlist-textcolor'),
  bgColor: document.getElementById('followlist-bgcolor'),
  bgOpacity: document.getElementById('followlist-bgopacity'),
  bgOpacityOut: document.getElementById('followlist-bgopacity-out'),
  posX: document.getElementById('followlist-posx'),
  posXOut: document.getElementById('followlist-posx-out'),
  posY: document.getElementById('followlist-posy'),
  posYOut: document.getElementById('followlist-posy-out'),
  width: document.getElementById('followlist-width'),
  widthOut: document.getElementById('followlist-width-out'),
  height: document.getElementById('followlist-height'),
  heightOut: document.getElementById('followlist-height-out'),
};

const tamagotchiFields = {
  enabled: document.getElementById('tamagotchi-enabled'),
  species: document.getElementById('tamagotchi-species'),
  size: document.getElementById('tamagotchi-size'),
  sizeOut: document.getElementById('tamagotchi-size-out'),
  showBar: document.getElementById('tamagotchi-showbar'),
  decay: document.getElementById('tamagotchi-decay'),
  boostChat: document.getElementById('tamagotchi-boostchat'),
  boostFollow: document.getElementById('tamagotchi-boostfollow'),
  boostSub: document.getElementById('tamagotchi-boostsub'),
  boostCheer: document.getElementById('tamagotchi-boostcheer'),
  boostRaid: document.getElementById('tamagotchi-boostraid'),
  posX: document.getElementById('tamagotchi-posx'),
  posXOut: document.getElementById('tamagotchi-posx-out'),
  posY: document.getElementById('tamagotchi-posy'),
  posYOut: document.getElementById('tamagotchi-posy-out'),
};

async function loadTamagotchiSpeciesOptions() {
  const res = await fetch('/api/species');
  const list = await res.json();
  tamagotchiFields.species.innerHTML =
    '<option value="mascot">🐾 Mascotte officielle</option>' +
    list.map((s) => `<option value="${s.id}">${s.label}</option>`).join('');
}

const TAMAGOTCHI_REACTION_OPTIONS = [
  ['none', 'Aucune'],
  ['awaken', '✨ Se dresse, yeux brillants + feuilles'],
  ['pulse', 'Sursaut'],
  ['jump', 'Saut'],
  ['shake', 'Tremble'],
  ['spin', 'Tourne sur lui-même'],
  ['bounce', 'Rebondit'],
];
const reactionOptionsHtml = TAMAGOTCHI_REACTION_OPTIONS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');

const tamagotchiTestRowEl = document.getElementById('tamagotchi-test-row');
if (tamagotchiTestRowEl) {
  tamagotchiTestRowEl.innerHTML = TAMAGOTCHI_REACTION_OPTIONS
    .filter(([v]) => v !== 'none')
    .map(([v, l]) => `<button type="button" class="tamagotchi-test-btn" data-reaction="${v}">${l}</button>`)
    .join('');
  tamagotchiTestRowEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('.tamagotchi-test-btn');
    if (!btn) return;
    await fetch(`/api/admin/test-tamagotchi-reaction/${btn.dataset.reaction}`, { method: 'POST' });
  });
}
const EVENT_TYPES_FOR_TAMAGOTCHI = ['follow', 'subscribe', 'cheer', 'raid'];
const tamagotchiEventReactionFields = {};
for (const type of EVENT_TYPES_FOR_TAMAGOTCHI) {
  const el = document.getElementById(`tamagotchi-reaction-${type}`);
  if (el) el.innerHTML = reactionOptionsHtml;
  tamagotchiEventReactionFields[type] = el;
}

const TAMAGOTCHI_ACTION_IDS = ['pet', 'feed', 'play'];
const tamagotchiActionFields = {};
for (const id of TAMAGOTCHI_ACTION_IDS) {
  const reactionEl = document.getElementById(`tamagotchi-action-${id}-reaction`);
  if (reactionEl) reactionEl.innerHTML = reactionOptionsHtml;
  tamagotchiActionFields[id] = {
    enabled: document.getElementById(`tamagotchi-action-${id}-enabled`),
    command: document.getElementById(`tamagotchi-action-${id}-command`),
    boost: document.getElementById(`tamagotchi-action-${id}-boost`),
    cooldown: document.getElementById(`tamagotchi-action-${id}-cooldown`),
    reaction: reactionEl,
  };
}

document.getElementById('tamagotchi-feed-btn')?.addEventListener('click', async () => {
  await fetch('/api/admin/tamagotchi/feed', { method: 'POST' });
});

const SOCIAL_PLATFORM_KEYS = ['twitter', 'discord', 'instagram', 'tiktok', 'youtube'];
const socialLinkFields = {};
for (const key of SOCIAL_PLATFORM_KEYS) {
  socialLinkFields[key] = {
    enabled: document.getElementById(`social-enable-${key}`),
    link: document.getElementById(`social-link-${key}`),
  };
}

const raidCardFields = {
  enabled: document.getElementById('raidcard-enabled'),
  duration: document.getElementById('raidcard-duration'),
  fontSize: document.getElementById('raidcard-fontsize'),
  fontSizeOut: document.getElementById('raidcard-fontsize-out'),
  textColor: document.getElementById('raidcard-textcolor'),
  bgColor: document.getElementById('raidcard-bgcolor'),
  bgOpacity: document.getElementById('raidcard-bgopacity'),
  bgOpacityOut: document.getElementById('raidcard-bgopacity-out'),
  posX: document.getElementById('raidcard-posx'),
  posXOut: document.getElementById('raidcard-posx-out'),
  posY: document.getElementById('raidcard-posy'),
  posYOut: document.getElementById('raidcard-posy-out'),
};

document.getElementById('raidcard-test-btn')?.addEventListener('click', async () => {
  await fetch('/api/admin/test-raid-card', { method: 'POST' });
});

document.getElementById('titles-generate-btn')?.addEventListener('click', async () => {
  const game = document.getElementById('titles-game').value;
  const keywords = document.getElementById('titles-keywords').value;
  const mood = document.getElementById('titles-mood').value;
  const btn = document.getElementById('titles-generate-btn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/admin/title-ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game, keywords, mood }),
    });
    if (!res.ok) throw new Error(await res.text());
    const { titles, tags } = await res.json();
    const listEl = document.getElementById('titles-list');
    listEl.innerHTML = titles.map((t) => `<li><span>${escapeHtmlPanel(t)}</span><button type="button" class="titles-copy-btn" data-text="${escapeHtmlPanel(t)}">Copier</button></li>`).join('');
    document.getElementById('titles-tags').innerHTML = tags.map((t) => `<span>#${escapeHtmlPanel(t)}</span>`).join('');
    document.getElementById('titles-results').hidden = false;
    listEl.querySelectorAll('.titles-copy-btn').forEach((copyBtn) => {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard?.writeText(copyBtn.dataset.text);
        copyBtn.textContent = 'Copié !';
        setTimeout(() => { copyBtn.textContent = 'Copier'; }, 1500);
      });
    });
  } catch (err) {
    console.error(err);
  } finally {
    btn.disabled = false;
  }
});

function escapeHtmlPanel(str) {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const SOCIAL_PLATFORM_LABELS = { twitter: 'Twitter / X', discord: 'Discord', instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube' };

document.getElementById('social-generate-btn')?.addEventListener('click', async () => {
  const game = document.getElementById('social-game').value;
  const message = document.getElementById('social-message').value;
  const mood = document.getElementById('social-mood').value;
  const moment = document.getElementById('social-moment').value;
  const btn = document.getElementById('social-generate-btn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/admin/social-posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game, message, mood, moment }),
    });
    if (!res.ok) throw new Error(await res.text());
    const posts = await res.json();
    const resultsEl = document.getElementById('social-results');
    const platforms = Object.keys(posts);
    document.getElementById('social-none-hint').hidden = platforms.length > 0;
    resultsEl.hidden = platforms.length === 0;
    resultsEl.innerHTML = platforms.map((platform) => `
      <h3>${SOCIAL_PLATFORM_LABELS[platform] || platform}</h3>
      <div class="social-post-block"><pre>${escapeHtmlPanel(posts[platform])}</pre><button type="button" class="social-copy-btn">Copier</button></div>
    `).join('');
  } catch (err) {
    console.error(err);
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('social-results')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.social-copy-btn');
  if (!btn) return;
  const text = btn.previousElementSibling?.textContent || '';
  navigator.clipboard?.writeText(text);
  btn.textContent = 'Copié !';
  setTimeout(() => { btn.textContent = 'Copier'; }, 1500);
});

const THANKYOU_STYLES = {
  follow: { colors: ['#ff5ecb', '#7b2ff7'], title: 'Merci pour le follow !', emoji: '💜' },
  subscribe: { colors: ['#ffd633', '#ff9147'], title: 'Merci pour le sub !', emoji: '⭐' },
  cheer: { colors: ['#18dcff', '#0a6ebd'], title: 'Merci pour les bits !', emoji: '💎' },
  raid: { colors: ['#ff9f43', '#ff4757'], title: 'Merci pour le raid !', emoji: '🚀' },
  custom: { colors: ['#2ed573', '#18dcff'], title: 'Merci !', emoji: '💫' },
};

function drawThankYouCard(canvas, { displayName, avatar, type, message }) {
  const ctx = canvas.getContext('2d');
  const style = THANKYOU_STYLES[type] || THANKYOU_STYLES.custom;
  const w = canvas.width;
  const h = canvas.height;

  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, style.colors[0]);
  gradient.addColorStop(1, style.colors[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  const finishText = () => {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = 8;
    ctx.fillText(`${style.emoji} ${style.title}`, w / 2, 300);
    ctx.font = '600 30px system-ui, sans-serif';
    ctx.fillText(displayName, w / 2, 345);
    if (message) {
      ctx.font = '20px system-ui, sans-serif';
      ctx.fillText(message, w / 2, 385);
    }
    ctx.shadowBlur = 0;
  };

  if (avatar) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const r = 90;
      ctx.save();
      ctx.beginPath();
      ctx.arc(w / 2, 150, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.clip();
      ctx.drawImage(img, w / 2 - r, 150 - r, r * 2, r * 2);
      ctx.restore();
      finishText();
    };
    img.onerror = finishText;
    img.src = avatar;
  } else {
    finishText();
  }
}

document.getElementById('thankyou-generate-btn')?.addEventListener('click', async () => {
  const login = document.getElementById('thankyou-login').value.trim();
  const type = document.getElementById('thankyou-type').value;
  const message = document.getElementById('thankyou-message').value.trim();
  const errorEl = document.getElementById('thankyou-error');
  const wrapEl = document.getElementById('thankyou-preview-wrap');
  errorEl.hidden = true;
  wrapEl.hidden = true;
  if (!login) return;
  const btn = document.getElementById('thankyou-generate-btn');
  btn.disabled = true;
  try {
    const res = await fetch(`/api/admin/thank-you-card/${encodeURIComponent(login)}`);
    if (!res.ok) throw new Error((await res.json()).error || 'Erreur');
    const profile = await res.json();
    const canvas = document.getElementById('thankyou-canvas');
    drawThankYouCard(canvas, { displayName: profile.displayName, avatar: profile.avatar, type, message });
    wrapEl.hidden = false;
  } catch (err) {
    errorEl.textContent = err.message || 'Impossible de générer la carte.';
    errorEl.hidden = false;
  } finally {
    btn.disabled = false;
  }
});

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
}

function formatAgo(ts) {
  if (!ts) return 'jamais';
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return `il y a ${seconds}s`;
  if (seconds < 3600) return `il y a ${Math.floor(seconds / 60)} min`;
  return `il y a ${Math.floor(seconds / 3600)}h`;
}

async function loadHealth() {
  const res = await fetch('/api/admin/health');
  if (!res.ok) return;
  const h = await res.json();
  const statusEl = document.getElementById('health-status');
  statusEl.innerHTML = `
    <div class="health-badge"><span class="health-dot ${h.chat.connected ? 'ok' : 'bad'}"></span>Chat Twitch : ${h.chat.connected ? 'connecté' : 'déconnecté'} (dernier message ${formatAgo(h.chat.lastMessageAt)})</div>
    <div class="health-badge"><span class="health-dot ${h.eventSub.connected ? 'ok' : 'bad'}"></span>Events (follow/sub/cheer/raid) : ${h.eventSub.connected ? 'connecté' : 'déconnecté'}</div>
    <div class="health-badge"><span class="health-dot ok"></span>${h.overlayClients} overlay(s) connecté(s)</div>
    <div class="health-badge"><span class="health-dot ok"></span>En ligne depuis ${formatUptime(h.uptimeSeconds)}</div>
  `;
  const errorsEl = document.getElementById('health-errors');
  errorsEl.innerHTML = h.recentErrors.length
    ? h.recentErrors.map((line) => `<div class="health-error-line">${escapeHtmlPanel(line)}</div>`).join('')
    : '<p class="hint">Aucune erreur récente.</p>';
}

document.getElementById('health-refresh-btn')?.addEventListener('click', loadHealth);

const OBS_MODULES = [
  { id: null, label: '🖥️ Overlay complet (tout)' },
  { id: 'avatars', label: '🐾 Avatars des viewers' },
  { id: 'chat', label: '💬 Chat sur l\'overlay' },
  { id: 'canvas', label: '🎨 Graffiti collectif' },
  { id: 'timers', label: '⏱️ Chronomètres' },
  { id: 'activity', label: '📣 Activité récente' },
  { id: 'people', label: '📜 Liste followers/subs' },
  { id: 'tamagotchi', label: '🐾 Mascotte' },
  { id: 'raidcard', label: '🎴 Fiche raid' },
];

function renderObsLinks() {
  const base = `${location.origin}/overlay/`;
  const rows = OBS_MODULES.map(({ id, label }) => {
    const url = id ? `${base}?modules=${id}` : base;
    return { label, url, featured: id === null };
  });
  const listEl = document.getElementById('obslinks-list');
  if (!listEl) return;
  listEl.innerHTML = rows.map((r, i) => `
    <div class="obslinks-row${r.featured ? ' obslinks-featured' : ''}">
      <span class="obslinks-name">${r.label}</span>
      <span class="obslinks-url">${r.url}</span>
      <button type="button" class="obslinks-copy-btn" data-index="${i}">Copier</button>
    </div>
  `).join('');
  listEl.querySelectorAll('.obslinks-copy-btn').forEach((btn, i) => {
    btn.addEventListener('click', () => {
      navigator.clipboard?.writeText(rows[i].url);
      btn.textContent = 'Copié !';
      setTimeout(() => { btn.textContent = 'Copier'; }, 1500);
    });
  });
}
renderObsLinks();

let viewerNotesCache = {};
let viewerNoteEditingLogin = null;

async function loadViewerNotes() {
  const res = await fetch('/api/admin/viewer-notes');
  viewerNotesCache = await res.json();
  renderViewerNotes();
}

function renderViewerNotes() {
  const query = document.getElementById('viewernotes-search').value.trim().toLowerCase();
  const listEl = document.getElementById('viewernotes-list');
  const entries = Object.values(viewerNotesCache)
    .filter((n) => !query || n.login.includes(query) || (n.tags || []).some((t) => t.toLowerCase().includes(query)))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  if (!entries.length) {
    listEl.innerHTML = '<p class="hint">Aucune note pour le moment.</p>';
    return;
  }
  listEl.innerHTML = entries.map((n) => `
    <div class="viewernote-card" data-login="${escapeHtmlPanel(n.login)}">
      <div class="viewernote-card-head">
        <span class="viewernote-card-name">${escapeHtmlPanel(n.login)}</span>
        <div class="viewernote-card-actions">
          <button type="button" class="viewernote-edit-btn">Modifier</button>
          <button type="button" class="viewernote-delete-btn">Supprimer</button>
        </div>
      </div>
      <div class="viewernote-card-tags">${(n.tags || []).map((t) => `<span>${escapeHtmlPanel(t)}</span>`).join('')}</div>
      <div class="viewernote-card-text">${escapeHtmlPanel(n.note || '')}</div>
    </div>
  `).join('');
}

document.getElementById('viewernotes-search')?.addEventListener('input', renderViewerNotes);

document.getElementById('viewernotes-list')?.addEventListener('click', async (e) => {
  const card = e.target.closest('.viewernote-card');
  if (!card) return;
  const login = card.dataset.login;
  if (e.target.classList.contains('viewernote-edit-btn')) {
    const n = viewerNotesCache[login];
    document.getElementById('viewernote-login').value = n.login;
    document.getElementById('viewernote-tags').value = (n.tags || []).join(', ');
    document.getElementById('viewernote-text').value = n.note || '';
    viewerNoteEditingLogin = login;
    document.getElementById('viewernote-cancel-btn').hidden = false;
  } else if (e.target.classList.contains('viewernote-delete-btn')) {
    if (!confirm(`Supprimer la note pour ${login} ?`)) return;
    await fetch(`/api/admin/viewer-notes/${encodeURIComponent(login)}`, { method: 'DELETE' });
    delete viewerNotesCache[login];
    renderViewerNotes();
  }
});

document.getElementById('viewernote-cancel-btn')?.addEventListener('click', () => {
  viewerNoteEditingLogin = null;
  document.getElementById('viewernote-login').value = '';
  document.getElementById('viewernote-tags').value = '';
  document.getElementById('viewernote-text').value = '';
  document.getElementById('viewernote-cancel-btn').hidden = true;
});

document.getElementById('viewernote-save-btn')?.addEventListener('click', async () => {
  const loginInput = document.getElementById('viewernote-login');
  const login = (viewerNoteEditingLogin || loginInput.value.trim()).toLowerCase();
  if (!login) return;
  const tags = document.getElementById('viewernote-tags').value.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 10);
  const note = document.getElementById('viewernote-text').value;
  const res = await fetch(`/api/admin/viewer-notes/${encodeURIComponent(login)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note, tags }),
  });
  if (res.ok) {
    const saved = await res.json();
    viewerNotesCache[saved.login] = saved;
    renderViewerNotes();
    document.getElementById('viewernote-cancel-btn').click();
  }
});

document.getElementById('thankyou-download-btn')?.addEventListener('click', () => {
  const canvas = document.getElementById('thankyou-canvas');
  try {
    const link = document.createElement('a');
    link.download = 'merci.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch {
    alert("Impossible d'exporter l'image (restriction du navigateur sur l'avatar). Fais une capture d'écran à la place.");
  }
});

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
    soundFile: document.getElementById(`evt-${type}-sound-file`),
    soundStatus: document.getElementById(`evt-${type}-sound-status`),
    soundRemove: document.getElementById(`evt-${type}-sound-remove`),
  };
}

const TIMER_TYPES = ['intro', 'pause'];
const timerFields = {};
for (const type of TIMER_TYPES) {
  timerFields[type] = {
    label: document.getElementById(`timer-${type}-label`),
    duration: document.getElementById(`timer-${type}-duration`),
    color: document.getElementById(`timer-${type}-color`),
    size: document.getElementById(`timer-${type}-size`),
    sizeOut: document.getElementById(`timer-${type}-size-out`),
    posX: document.getElementById(`timer-${type}-posx`),
    posXOut: document.getElementById(`timer-${type}-posx-out`),
    posY: document.getElementById(`timer-${type}-posy`),
    posYOut: document.getElementById(`timer-${type}-posy-out`),
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
  for (const type of TIMER_TYPES) {
    timerFields[type].sizeOut.textContent = `${timerFields[type].size.value}px`;
    timerFields[type].posXOut.textContent = `${timerFields[type].posX.value}%`;
    timerFields[type].posYOut.textContent = `${timerFields[type].posY.value}%`;
  }
  graffitiFields.posXOut.textContent = `${graffitiFields.posX.value}%`;
  graffitiFields.posYOut.textContent = `${graffitiFields.posY.value}%`;
  graffitiFields.widthOut.textContent = `${graffitiFields.width.value}%`;
  graffitiFields.heightOut.textContent = `${graffitiFields.height.value}%`;
  chatOverlayFields.fontSizeOut.textContent = `${chatOverlayFields.fontSize.value}px`;
  chatOverlayFields.bgOpacityOut.textContent = `${chatOverlayFields.bgOpacity.value}%`;
  chatOverlayFields.rotationOut.textContent = `${chatOverlayFields.rotation.value}°`;
  chatOverlayFields.posXOut.textContent = `${chatOverlayFields.posX.value}%`;
  chatOverlayFields.posYOut.textContent = `${chatOverlayFields.posY.value}%`;
  chatOverlayFields.widthOut.textContent = `${chatOverlayFields.width.value}%`;
  chatOverlayFields.heightOut.textContent = `${chatOverlayFields.height.value}%`;
  activityFeedFields.fontSizeOut.textContent = `${activityFeedFields.fontSize.value}px`;
  activityFeedFields.bgOpacityOut.textContent = `${activityFeedFields.bgOpacity.value}%`;
  activityFeedFields.posXOut.textContent = `${activityFeedFields.posX.value}%`;
  activityFeedFields.posYOut.textContent = `${activityFeedFields.posY.value}%`;
  activityFeedFields.widthOut.textContent = `${activityFeedFields.width.value}%`;
  activityFeedFields.heightOut.textContent = `${activityFeedFields.height.value}%`;
  followListFields.fontSizeOut.textContent = `${followListFields.fontSize.value}px`;
  followListFields.bgOpacityOut.textContent = `${followListFields.bgOpacity.value}%`;
  followListFields.posXOut.textContent = `${followListFields.posX.value}%`;
  followListFields.posYOut.textContent = `${followListFields.posY.value}%`;
  followListFields.widthOut.textContent = `${followListFields.width.value}%`;
  followListFields.heightOut.textContent = `${followListFields.height.value}%`;
  tamagotchiFields.sizeOut.textContent = `${tamagotchiFields.size.value}px`;
  tamagotchiFields.posXOut.textContent = `${tamagotchiFields.posX.value}%`;
  tamagotchiFields.posYOut.textContent = `${tamagotchiFields.posY.value}%`;
  raidCardFields.fontSizeOut.textContent = `${raidCardFields.fontSize.value}px`;
  raidCardFields.bgOpacityOut.textContent = `${raidCardFields.bgOpacity.value}%`;
  raidCardFields.posXOut.textContent = `${raidCardFields.posX.value}%`;
  raidCardFields.posYOut.textContent = `${raidCardFields.posY.value}%`;
  updateZonePreview();
  updatePreviewMarker();
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
for (const type of TIMER_TYPES) {
  timerFields[type].size.addEventListener('input', updateOutputs);
  timerFields[type].posX.addEventListener('input', updateOutputs);
  timerFields[type].posY.addEventListener('input', updateOutputs);
}
graffitiFields.posX.addEventListener('input', updateOutputs);
graffitiFields.posY.addEventListener('input', updateOutputs);
graffitiFields.width.addEventListener('input', updateOutputs);
graffitiFields.height.addEventListener('input', updateOutputs);
chatOverlayFields.fontSize.addEventListener('input', updateOutputs);
chatOverlayFields.bgOpacity.addEventListener('input', updateOutputs);
chatOverlayFields.rotation.addEventListener('input', updateOutputs);
chatOverlayFields.posX.addEventListener('input', updateOutputs);
chatOverlayFields.posY.addEventListener('input', updateOutputs);
chatOverlayFields.width.addEventListener('input', updateOutputs);
chatOverlayFields.height.addEventListener('input', updateOutputs);
activityFeedFields.fontSize.addEventListener('input', updateOutputs);
activityFeedFields.bgOpacity.addEventListener('input', updateOutputs);
activityFeedFields.posX.addEventListener('input', updateOutputs);
activityFeedFields.posY.addEventListener('input', updateOutputs);
activityFeedFields.width.addEventListener('input', updateOutputs);
activityFeedFields.height.addEventListener('input', updateOutputs);
followListFields.fontSize.addEventListener('input', updateOutputs);
followListFields.bgOpacity.addEventListener('input', updateOutputs);
followListFields.posX.addEventListener('input', updateOutputs);
followListFields.posY.addEventListener('input', updateOutputs);
followListFields.width.addEventListener('input', updateOutputs);
followListFields.height.addEventListener('input', updateOutputs);
tamagotchiFields.size.addEventListener('input', updateOutputs);
tamagotchiFields.posX.addEventListener('input', updateOutputs);
tamagotchiFields.posY.addEventListener('input', updateOutputs);
raidCardFields.fontSize.addEventListener('input', updateOutputs);
raidCardFields.bgOpacity.addEventListener('input', updateOutputs);
raidCardFields.posX.addEventListener('input', updateOutputs);
raidCardFields.posY.addEventListener('input', updateOutputs);

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
  ownerNameColorEl.value = s.ownerNameColor;
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
    updateSoundStatus(type, s.events[type].sound);
  }
  for (const id in spriteFlipFields) {
    spriteFlipFields[id].checked = !!s.spriteFlip[id];
  }
  for (const type of TIMER_TYPES) {
    timerFields[type].label.value = s.timers[type].label;
    timerFields[type].duration.value = s.timers[type].durationSeconds;
    timerFields[type].color.value = s.timers[type].color;
    timerFields[type].size.value = s.timers[type].fontSize;
    timerFields[type].posX.value = s.timers[type].position.x;
    timerFields[type].posY.value = s.timers[type].position.y;
  }
  graffitiFields.enabled.checked = s.graffiti.enabled;
  graffitiFields.cols.value = s.graffiti.cols;
  graffitiFields.rows.value = s.graffiti.rows;
  graffitiFields.cooldown.value = s.graffiti.cooldownSeconds;
  graffitiFields.posX.value = s.graffiti.position.x;
  graffitiFields.posY.value = s.graffiti.position.y;
  graffitiFields.width.value = s.graffiti.position.width;
  graffitiFields.height.value = s.graffiti.position.height;
  chatOverlayFields.enabled.checked = s.chatOverlay.enabled;
  chatOverlayFields.maxMessages.value = s.chatOverlay.maxMessages;
  chatOverlayFields.fontSize.value = s.chatOverlay.fontSize;
  chatOverlayFields.textColor.value = s.chatOverlay.textColor;
  chatOverlayFields.colorMode.value = s.chatOverlay.colorMode;
  chatOverlayFields.style.value = s.chatOverlay.style;
  chatOverlayFields.rotation.value = s.chatOverlay.rotation;
  chatOverlayFields.bgColor.value = s.chatOverlay.bgColor;
  chatOverlayFields.bgOpacity.value = s.chatOverlay.bgOpacity;
  chatOverlayFields.fadeSeconds.value = s.chatOverlay.fadeSeconds;
  chatOverlayFields.posX.value = s.chatOverlay.position.x;
  chatOverlayFields.posY.value = s.chatOverlay.position.y;
  chatOverlayFields.width.value = s.chatOverlay.position.width;
  chatOverlayFields.height.value = s.chatOverlay.position.height;
  activityFeedFields.enabled.checked = s.activityFeed.enabled;
  activityFeedFields.speed.value = s.activityFeed.speedSeconds;
  activityFeedFields.fontSize.value = s.activityFeed.fontSize;
  activityFeedFields.textColor.value = s.activityFeed.textColor;
  activityFeedFields.bgColor.value = s.activityFeed.bgColor;
  activityFeedFields.bgOpacity.value = s.activityFeed.bgOpacity;
  activityFeedFields.posX.value = s.activityFeed.position.x;
  activityFeedFields.posY.value = s.activityFeed.position.y;
  activityFeedFields.width.value = s.activityFeed.position.width;
  activityFeedFields.height.value = s.activityFeed.position.height;
  followListFields.enabled.checked = s.followList.enabled;
  followListFields.mode.value = s.followList.mode;
  followListFields.speed.value = s.followList.speedSeconds;
  followListFields.fontSize.value = s.followList.fontSize;
  followListFields.textColor.value = s.followList.textColor;
  followListFields.bgColor.value = s.followList.bgColor;
  followListFields.bgOpacity.value = s.followList.bgOpacity;
  followListFields.posX.value = s.followList.position.x;
  followListFields.posY.value = s.followList.position.y;
  followListFields.width.value = s.followList.position.width;
  followListFields.height.value = s.followList.position.height;
  tamagotchiFields.enabled.checked = s.tamagotchi.enabled;
  tamagotchiFields.species.value = s.tamagotchi.species;
  tamagotchiFields.size.value = s.tamagotchi.size;
  tamagotchiFields.showBar.checked = s.tamagotchi.showBar;
  tamagotchiFields.decay.value = s.tamagotchi.decayPerMinute;
  tamagotchiFields.boostChat.value = s.tamagotchi.boostChat;
  tamagotchiFields.boostFollow.value = s.tamagotchi.boostFollow;
  tamagotchiFields.boostSub.value = s.tamagotchi.boostSub;
  tamagotchiFields.boostCheer.value = s.tamagotchi.boostCheer;
  tamagotchiFields.boostRaid.value = s.tamagotchi.boostRaid;
  tamagotchiFields.posX.value = s.tamagotchi.position.x;
  tamagotchiFields.posY.value = s.tamagotchi.position.y;
  for (const type of EVENT_TYPES_FOR_TAMAGOTCHI) {
    if (tamagotchiEventReactionFields[type]) tamagotchiEventReactionFields[type].value = s.tamagotchi.eventReactions[type];
  }
  for (const id of TAMAGOTCHI_ACTION_IDS) {
    const a = s.tamagotchi.chatActions[id];
    tamagotchiActionFields[id].enabled.checked = a.enabled;
    tamagotchiActionFields[id].command.value = a.command;
    tamagotchiActionFields[id].boost.value = a.boost;
    tamagotchiActionFields[id].cooldown.value = a.cooldownSeconds;
    tamagotchiActionFields[id].reaction.value = a.reaction;
  }
  raidCardFields.enabled.checked = s.raidCard.enabled;
  raidCardFields.duration.value = s.raidCard.durationSeconds;
  raidCardFields.fontSize.value = s.raidCard.fontSize;
  raidCardFields.textColor.value = s.raidCard.textColor;
  raidCardFields.bgColor.value = s.raidCard.bgColor;
  raidCardFields.bgOpacity.value = s.raidCard.bgOpacity;
  raidCardFields.posX.value = s.raidCard.position.x;
  raidCardFields.posY.value = s.raidCard.position.y;
  for (const key of SOCIAL_PLATFORM_KEYS) {
    socialLinkFields[key].enabled.checked = s.socialPlatforms[key];
    socialLinkFields[key].link.value = s.socialLinks[key];
  }
  updateOutputs();
}

async function saveSettings() {
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
    ownerNameColor: ownerNameColorEl.value,
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
    timers: Object.fromEntries(TIMER_TYPES.map((type) => [type, {
      label: timerFields[type].label.value,
      durationSeconds: Number(timerFields[type].duration.value),
      color: timerFields[type].color.value,
      fontSize: Number(timerFields[type].size.value),
      position: { x: Number(timerFields[type].posX.value), y: Number(timerFields[type].posY.value) },
    }])),
    graffiti: {
      enabled: graffitiFields.enabled.checked,
      cols: Number(graffitiFields.cols.value),
      rows: Number(graffitiFields.rows.value),
      cooldownSeconds: Number(graffitiFields.cooldown.value),
      position: {
        x: Number(graffitiFields.posX.value),
        y: Number(graffitiFields.posY.value),
        width: Number(graffitiFields.width.value),
        height: Number(graffitiFields.height.value),
      },
    },
    chatOverlay: {
      enabled: chatOverlayFields.enabled.checked,
      maxMessages: Number(chatOverlayFields.maxMessages.value),
      fontSize: Number(chatOverlayFields.fontSize.value),
      textColor: chatOverlayFields.textColor.value,
      colorMode: chatOverlayFields.colorMode.value,
      style: chatOverlayFields.style.value,
      rotation: Number(chatOverlayFields.rotation.value),
      bgColor: chatOverlayFields.bgColor.value,
      bgOpacity: Number(chatOverlayFields.bgOpacity.value),
      fadeSeconds: Number(chatOverlayFields.fadeSeconds.value),
      position: {
        x: Number(chatOverlayFields.posX.value),
        y: Number(chatOverlayFields.posY.value),
        width: Number(chatOverlayFields.width.value),
        height: Number(chatOverlayFields.height.value),
      },
    },
    activityFeed: {
      enabled: activityFeedFields.enabled.checked,
      fontSize: Number(activityFeedFields.fontSize.value),
      textColor: activityFeedFields.textColor.value,
      bgColor: activityFeedFields.bgColor.value,
      bgOpacity: Number(activityFeedFields.bgOpacity.value),
      speedSeconds: Number(activityFeedFields.speed.value),
      position: {
        x: Number(activityFeedFields.posX.value),
        y: Number(activityFeedFields.posY.value),
        width: Number(activityFeedFields.width.value),
        height: Number(activityFeedFields.height.value),
      },
    },
    followList: {
      enabled: followListFields.enabled.checked,
      mode: followListFields.mode.value,
      fontSize: Number(followListFields.fontSize.value),
      textColor: followListFields.textColor.value,
      bgColor: followListFields.bgColor.value,
      bgOpacity: Number(followListFields.bgOpacity.value),
      speedSeconds: Number(followListFields.speed.value),
      position: {
        x: Number(followListFields.posX.value),
        y: Number(followListFields.posY.value),
        width: Number(followListFields.width.value),
        height: Number(followListFields.height.value),
      },
    },
    tamagotchi: {
      enabled: tamagotchiFields.enabled.checked,
      species: tamagotchiFields.species.value,
      size: Number(tamagotchiFields.size.value),
      showBar: tamagotchiFields.showBar.checked,
      decayPerMinute: Number(tamagotchiFields.decay.value),
      boostChat: Number(tamagotchiFields.boostChat.value),
      boostFollow: Number(tamagotchiFields.boostFollow.value),
      boostSub: Number(tamagotchiFields.boostSub.value),
      boostCheer: Number(tamagotchiFields.boostCheer.value),
      boostRaid: Number(tamagotchiFields.boostRaid.value),
      position: { x: Number(tamagotchiFields.posX.value), y: Number(tamagotchiFields.posY.value) },
      eventReactions: Object.fromEntries(EVENT_TYPES_FOR_TAMAGOTCHI.map((type) => [type, tamagotchiEventReactionFields[type]?.value])),
      chatActions: Object.fromEntries(TAMAGOTCHI_ACTION_IDS.map((id) => [id, {
        enabled: tamagotchiActionFields[id].enabled.checked,
        command: tamagotchiActionFields[id].command.value,
        boost: Number(tamagotchiActionFields[id].boost.value),
        cooldownSeconds: Number(tamagotchiActionFields[id].cooldown.value),
        reaction: tamagotchiActionFields[id].reaction.value,
      }])),
    },
    raidCard: {
      enabled: raidCardFields.enabled.checked,
      durationSeconds: Number(raidCardFields.duration.value),
      fontSize: Number(raidCardFields.fontSize.value),
      textColor: raidCardFields.textColor.value,
      bgColor: raidCardFields.bgColor.value,
      bgOpacity: Number(raidCardFields.bgOpacity.value),
      position: { x: Number(raidCardFields.posX.value), y: Number(raidCardFields.posY.value) },
    },
    socialLinks: Object.fromEntries(SOCIAL_PLATFORM_KEYS.map((key) => [key, socialLinkFields[key].link.value])),
    socialPlatforms: Object.fromEntries(SOCIAL_PLATFORM_KEYS.map((key) => [key, socialLinkFields[key].enabled.checked])),
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
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  saveSettings();
});

Promise.all([loadTestAvatars(), loadTamagotchiSpeciesOptions(), loadViewerNotes()]).then(loadSettings);
loadHealth();

document.getElementById('logout')?.addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  location.reload();
});

const EVENT_MARKER_LABELS = { follow: 'Follow', subscribe: 'Sub', cheer: 'Cheer', raid: 'Raid' };
const EVENT_MARKER_COLORS = { follow: '#ff5ecb', subscribe: '#ffd633', cheer: '#18dcff', raid: '#ff9f43' };
const TIMER_MARKER_LABELS = { intro: 'Intro', pause: 'Pause/AFK' };
const TIMER_MARKER_COLORS = { intro: '#9147ff', pause: '#2ed573' };

function addPreviewMarker(x, y, label, color) {
  const marker = document.createElement('div');
  marker.className = 'preview-marker';
  marker.style.setProperty('--marker-color', color);
  marker.style.left = `${x}%`;
  marker.style.top = `${y}%`;
  marker.innerHTML = `<span class="preview-marker-label">${label}</span>`;
  previewMarkersEl.appendChild(marker);
}

function addPreviewBox(x, y, width, height, label, color) {
  const box = document.createElement('div');
  box.className = 'preview-box';
  box.style.setProperty('--marker-color', color);
  box.style.left = `${x}%`;
  box.style.top = `${y}%`;
  box.style.width = `${width}%`;
  box.style.height = `${height}%`;
  box.innerHTML = `<span class="preview-marker-label">${label}</span>`;
  previewMarkersEl.appendChild(box);
}

function updatePreviewMarker() {
  const category = document.querySelector('.nav-cat-btn.active')?.dataset.cat;
  previewMarkersEl.innerHTML = '';
  zonePreviewEl.classList.toggle('markers-mode', category !== 'avatars');

  if (category === 'alerts') {
    const activeTab = document.querySelector('.nav-subtabs[data-cat-group="alerts"] .nav-tab-btn.active');
    const type = activeTab?.dataset.tab;
    if (type && eventFields[type]) {
      addPreviewMarker(
        Number(eventFields[type].posX.value),
        Number(eventFields[type].posY.value),
        EVENT_MARKER_LABELS[type],
        EVENT_MARKER_COLORS[type],
      );
    }
  } else if (category === 'tools') {
    const activeTab = document.querySelector('.nav-subtabs[data-cat-group="tools"] .nav-tab-btn.active');
    const tool = activeTab?.dataset.tab;
    if (tool === 'timers') {
      for (const type of TIMER_TYPES) {
        addPreviewMarker(
          Number(timerFields[type].posX.value),
          Number(timerFields[type].posY.value),
          TIMER_MARKER_LABELS[type],
          TIMER_MARKER_COLORS[type],
        );
      }
    } else if (tool === 'graffiti') {
      addPreviewBox(
        Number(graffitiFields.posX.value),
        Number(graffitiFields.posY.value),
        Number(graffitiFields.width.value),
        Number(graffitiFields.height.value),
        'Graffiti',
        '#ff9f43',
      );
    } else if (tool === 'chatoverlay') {
      addPreviewBox(
        Number(chatOverlayFields.posX.value),
        Number(chatOverlayFields.posY.value),
        Number(chatOverlayFields.width.value),
        Number(chatOverlayFields.height.value),
        'Chat',
        '#18dcff',
      );
    } else if (tool === 'activity') {
      addPreviewBox(
        Number(activityFeedFields.posX.value),
        Number(activityFeedFields.posY.value),
        Number(activityFeedFields.width.value),
        Number(activityFeedFields.height.value),
        'Activité récente',
        '#ff5ecb',
      );
    } else if (tool === 'followlist') {
      addPreviewBox(
        Number(followListFields.posX.value),
        Number(followListFields.posY.value),
        Number(followListFields.width.value),
        Number(followListFields.height.value),
        'Followers/Subs',
        '#2ed573',
      );
    } else if (tool === 'tamagotchi') {
      addPreviewMarker(
        Number(tamagotchiFields.posX.value),
        Number(tamagotchiFields.posY.value),
        'Mascotte',
        '#ffd633',
      );
    } else if (tool === 'raidcard') {
      addPreviewMarker(
        Number(raidCardFields.posX.value),
        Number(raidCardFields.posY.value),
        'Fiche raid',
        '#ff9f43',
      );
    }
  }
}

function selectTab(btn) {
  document.querySelectorAll('.nav-tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
  document.querySelectorAll('[data-nav-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.navPanel !== btn.dataset.tab;
  });
  updatePreviewMarker();
}

document.querySelectorAll('.nav-tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => selectTab(btn));
});

const avatarSizeFieldset = document.getElementById('avatar-size-fieldset');

document.querySelectorAll('.nav-cat-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-cat-btn').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.nav-subtabs').forEach((group) => {
      group.hidden = group.dataset.catGroup !== btn.dataset.cat;
    });
    const firstTab = document.querySelector(`.nav-subtabs[data-cat-group="${btn.dataset.cat}"] .nav-tab-btn`);
    if (firstTab) selectTab(firstTab);
    // la taille des avatars ne concerne que la catégorie Avatars
    avatarSizeFieldset.hidden = btn.dataset.cat !== 'avatars';
    // la catégorie Contenu (générateur de titres) n'a pas de position à visualiser sur l'écran de stream
    settingsLayoutEl.classList.toggle('no-sidebar', btn.dataset.cat === 'content');
    updatePreviewMarker();
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

document.getElementById('graffiti-reset-btn').addEventListener('click', () => {
  fetch('/api/admin/canvas/reset', { method: 'POST' });
});

function updateSoundStatus(type, sound) {
  eventFields[type].soundStatus.textContent = sound ? `Son actuel : ${sound.replace(/^[a-z-]+-\d+/, 'fichier')}` : 'Aucun son';
  eventFields[type].soundRemove.hidden = !sound;
}

for (const type of EVENT_TYPES) {
  eventFields[type].soundFile.addEventListener('change', async () => {
    const file = eventFields[type].soundFile.files[0];
    if (!file) return;
    eventFields[type].soundStatus.textContent = 'Envoi...';
    const formData = new FormData();
    formData.append('sound', file);
    try {
      const res = await fetch(`/api/admin/sound/${type}`, { method: 'POST', body: formData });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'échec');
      updateSoundStatus(type, body.sound);
    } catch (err) {
      eventFields[type].soundStatus.textContent = `Échec de l'envoi : ${err.message}`;
      console.error(err);
    } finally {
      eventFields[type].soundFile.value = '';
    }
  });

  eventFields[type].soundRemove.addEventListener('click', async () => {
    await fetch(`/api/admin/sound/${type}`, { method: 'DELETE' });
    updateSoundStatus(type, null);
  });
}

document.querySelectorAll('.timer-start-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await saveSettings();
      await fetch(`/api/admin/timer/${btn.dataset.timer}/start`, { method: 'POST' });
    } finally {
      btn.disabled = false;
    }
  });
});

document.querySelectorAll('.timer-stop-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    fetch(`/api/admin/timer/${btn.dataset.timer}/stop`, { method: 'POST' });
  });
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
