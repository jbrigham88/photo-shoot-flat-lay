// Photo Shoot Flat Lay: quiz -> weather -> AI stylist -> real products -> final set.

const STYLES = ['Classic', 'Casual', 'Formal', 'Boho', 'Modern', 'Funky', 'Holiday', 'Coastal', 'Western', 'Rustic', 'Cozy knits', 'Bright & playful'];
const SETTINGS = [['outdoor', 'Outdoors'], ['indoor', 'Indoors'], ['studio', 'Studio'], ['both', 'Some of each']];
const TIMES = [['morning', 'Morning'], ['midday', 'Midday'], ['golden hour', 'Golden hour'], ['evening', 'Evening']];
const RELATIONS = ['Mom', 'Dad', 'Parent', 'Partner', 'Grandma', 'Grandpa', 'Daughter', 'Son', 'Child', 'Baby', 'Aunt', 'Uncle', 'Other'];
const GENDERS = [['woman', 'Woman'], ['man', 'Man'], ['girl', 'Girl'], ['boy', 'Boy'], ['', 'Not specified']];
const COLORS = [
  ['Cream', '#F1EBDD'], ['Oatmeal', '#D9CBB3'], ['Camel', '#B98B5A'], ['Rust', '#A4532F'],
  ['Mustard', '#C9A13B'], ['Blush', '#E3B7A8'], ['Burgundy', '#6E2232'], ['Sage', '#A3B49A'],
  ['Olive', '#6B6B3A'], ['Emerald', '#1F5E4A'], ['Dusty blue', '#8EA6BD'], ['Navy', '#1F2C4A'],
  ['Charcoal', '#3B3D40'], ['Black', '#151515'], ['White', '#FAFAF7'], ['Plaid', '#8C3B2E'],
];
const SLOT_ORDER = ['outerwear', 'dress', 'top', 'bottom', 'legwear', 'shoes'];
const SLOT_LABEL = { outerwear: 'Layer', dress: 'Dress', top: 'Top', bottom: 'Bottom', legwear: 'Tights', shoes: 'Shoes' };
const REASONS = [
  ['color', 'Wrong color'], ['together', "Doesn't go with the rest"], ['style', 'Not their style'],
  ['formal', 'Too dressy'], ['casual', 'Too casual'], ['price', 'Too expensive'],
  ['fit', 'Wrong cut or fit'], ['have', 'Already have one'], ['other', 'Something else'],
];
const STORE_KEY = 'psfl.v1';

const $app = document.getElementById('app');

let config = { stylist: false, products: false, skimlinksId: null };
const state = loadState() || {
  quiz: {
    styles: [], notes: '', setting: 'outdoor', location: '', date: '', timeOfDay: 'golden hour',
    paletteMode: 'photos', colors: [], budget: { amount: '', per: 'person' },
  },
  family: [newPerson('Mom', 'woman'), newPerson('Dad', 'man')],
};
state.photos = { inspiration: [], family: null, owned: [] };
state.view = 'quiz';
state.plan = null;
state.weather = null;
state.looks = [];         // built from the plan: items, chosen products, status
state.current = 0;        // which look is on screen
state.sheet = null;       // the "why swap it?" sheet: { lookIdx, key, reason, note }

// ---------- utilities ----------
function uid(p = 'id') { return p + Math.random().toString(36).slice(2, 8); }
function newPerson(relation = '', gender = '') {
  return { id: uid('p'), name: '', relation, age: '', ageUnit: 'years', gender, size: '' };
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function money(n) {
  if (!Number.isFinite(n)) return '';
  return '$' + (Number.isInteger(Math.round(n * 100) / 100) ? String(Math.round(n)) : n.toFixed(2));
}
function ageYears(p) {
  const n = Number(p.age);
  if (!p.age || !Number.isFinite(n)) return null;
  return p.ageUnit === 'months' ? n / 12 : n;
}
function personLabel(p) { return p.name?.trim() || p.relation || 'Family member'; }
function personFacts(p) {
  const y = ageYears(p);
  const age = y == null ? '' : y < 2 ? `${Math.round(y * 12)} mo` : `${Math.round(y)} yrs`;
  return [p.name?.trim() && p.relation ? p.relation : '', age, p.size ? `size ${p.size}` : ''].filter(Boolean).join(' · ');
}
function personById(id) { return state.family.find((p) => p.id === id); }

function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ quiz: state.quiz, family: state.family })); } catch {}
}
function loadState() {
  try { const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); return s?.quiz && s?.family ? s : null; } catch { return null; }
}

function toast(msg) {
  document.querySelectorAll('.toast').forEach((x) => x.remove());
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

// Shrink photos before upload so requests stay small and fast.
function resizeImage(file, max = 800) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.78));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a photo we can read.')); };
    img.src = url;
  });
}

async function api(path, options = {}) {
  const r = await fetch(path, options);
  let data = null;
  try { data = await r.json(); } catch {}
  if (!r.ok) {
    const e = new Error(data?.message || `Request failed (${r.status})`);
    e.code = data?.error; e.status = r.status;
    throw e;
  }
  return data;
}

// ---------- cutting a piece out of an uploaded photo or screenshot ----------
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that photo.'));
    img.src = src;
  });
}

function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// Crop transparent edges off a cutout and cap its size.
function trimTransparent(img, max = 700) {
  const c = canvasOf(img.naturalWidth, img.naturalHeight);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
  let x1 = width; let y1 = height; let x2 = -1; let y2 = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 16) { if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
    }
  }
  if (x2 < 0) return null; // nothing left after background removal
  const pad = Math.round(Math.max(x2 - x1, y2 - y1) * 0.04);
  x1 = Math.max(0, x1 - pad); y1 = Math.max(0, y1 - pad); x2 = Math.min(width - 1, x2 + pad); y2 = Math.min(height - 1, y2 + pad);
  const w = x2 - x1 + 1; const h = y2 - y1 + 1;
  const scale = Math.min(1, max / Math.max(w, h));
  const out = canvasOf(Math.round(w * scale), Math.round(h * scale));
  out.getContext('2d').drawImage(c, x1, y1, w, h, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

async function cutOutPiece(o) {
  try {
    const img = await loadImage(o.dataUrl);
    const W = img.naturalWidth; const H = img.naturalHeight;
    // 1. Find the garment (skips shop text, prices and other products in screenshots).
    let box = null;
    try {
      const r = await api('/api/locate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: o.dataUrl, width: W, height: H, label: o.label }),
      });
      if (r.found) { box = r.box; if (!o.label && r.label) o.label = r.label; }
    } catch { /* fall back to the whole photo */ }
    const [x1, y1, x2, y2] = box || [0, 0, W, H];
    const pad = Math.round(Math.max(x2 - x1, y2 - y1) * 0.04);
    const cx = Math.max(0, x1 - pad); const cy = Math.max(0, y1 - pad);
    const cw = Math.min(W, x2 + pad) - cx; const ch = Math.min(H, y2 + pad) - cy;
    const crop = canvasOf(cw, ch);
    crop.getContext('2d').drawImage(img, cx, cy, cw, ch, 0, 0, cw, ch);
    const cropUrl = crop.toDataURL('image/jpeg', 0.9);
    // 2. Remove the background.
    const blob = await new Promise((r) => crop.toBlob(r, 'image/png'));
    const res = await fetch('/api/cutout', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob });
    if (res.ok && (res.headers.get('content-type') || '').startsWith('image/')) {
      const url = URL.createObjectURL(await res.blob());
      const trimmed = trimTransparent(await loadImage(url));
      URL.revokeObjectURL(url);
      if (trimmed) { o.dataUrl = trimmed; o.cutout = true; return; }
    }
    o.dataUrl = cropUrl; // background removal unavailable: at least show just the piece
  } catch (e) {
    toast(e.message || 'Could not cut out that piece');
  }
}

// ---------- quiz ----------
function chip(group, value, label, pressed) {
  return `<button type="button" class="chip" data-chip="${group}" data-value="${esc(value)}" aria-pressed="${pressed}">${esc(label)}</button>`;
}

function renderQuiz() {
  const q = state.quiz;
  const keysMissing = !config.stylist || !config.products;
  $app.innerHTML = `
    <section class="intro">
      <span class="eyebrow">Family photo shoot styling</span>
      <h1>Dress the whole family, then see it laid out.</h1>
      <p class="lede">Answer a few questions and add photos you love. The stylist plans three coordinated looks with real products in your budget, laid out flat so you can see the set together. Mix pieces into your final set and shop each one.</p>
    </section>
    ${keysMissing ? setupNotice() : ''}
    <form id="quiz" class="steps" novalidate>
      <section class="step">
        <div class="step__head"><span class="eyebrow">Step 1</span><h2>The shoot</h2></div>
        <div class="step__body">
          <div class="field"><span class="label">Style</span>
            <div class="chips">${STYLES.map((s) => chip('styles', s, s, q.styles.includes(s))).join('')}</div>
            <p class="hint">Pick one or a few.</p></div>
          <div class="field"><label for="notes">Anything else? (optional)</label>
            <textarea id="notes" placeholder="e.g. Christmas card photos, no stripes, Grandma prefers pants">${esc(q.notes)}</textarea></div>
          <div class="field"><span class="label">Where will you be?</span>
            <div class="chips">${SETTINGS.map(([v, l]) => chip('setting', v, l, q.setting === v)).join('')}</div></div>
          <div class="row">
            <div class="field"><label for="location">City</label>
              <input id="location" type="text" autocomplete="address-level2" placeholder="Bend, OR" value="${esc(q.location)}"></div>
            <div class="field"><label for="date">Shoot date (optional)</label>
              <input id="date" type="date" value="${esc(q.date)}"></div>
          </div>
          <p class="hint">With a city and date we check the forecast. More than 2 weeks out, we use typical weather for that week.</p>
          <div class="field"><span class="label">Time of day</span>
            <div class="chips">${TIMES.map(([v, l]) => chip('timeOfDay', v, l, q.timeOfDay === v)).join('')}</div></div>
        </div>
      </section>

      <section class="step">
        <div class="step__head"><span class="eyebrow">Step 2</span><h2>The family</h2>
          <p class="hint">Everyone in the photos gets their own outfit. Sizes help us skip sold-out items.</p></div>
        <div class="step__body">
          <div class="people" id="people">${state.family.map(personRow).join('')}</div>
          <div><button type="button" class="btn" data-action="add-person">Add a person</button></div>
        </div>
      </section>

      <section class="step">
        <div class="step__head"><span class="eyebrow">Step 3</span><h2>Colors & budget</h2></div>
        <div class="step__body">
          <div class="field"><span class="label">Color palette</span>
            <div class="chips">
              ${chip('paletteMode', 'photos', 'Pick it for me from my photos', q.paletteMode === 'photos')}
              ${chip('paletteMode', 'chosen', 'I have colors in mind', q.paletteMode === 'chosen')}
            </div></div>
          <div class="field" ${q.paletteMode === 'chosen' ? '' : 'hidden'}>
            <div class="swatches">${COLORS.map(([n, h]) => `
              <button type="button" class="swatch" data-color="${n}" aria-pressed="${q.colors.includes(n)}">
                <span class="swatch__dot" style="background:${h}"></span>${n}</button>`).join('')}</div>
            <p class="hint">Choose 2 to 4. The stylist adds neutrals to round it out.</p></div>
          <div class="row">
            <div class="field"><label for="budget">Budget (optional)</label>
              <input id="budget" type="number" inputmode="numeric" min="0" step="5" placeholder="75" value="${esc(q.budget.amount)}"></div>
            <div class="field"><span class="label">Per</span>
              <div class="chips">
                ${chip('budgetPer', 'person', 'Person', q.budget.per === 'person')}
                ${chip('budgetPer', 'family', 'Whole family', q.budget.per === 'family')}
              </div></div>
          </div>
        </div>
      </section>

      <section class="step">
        <div class="step__head"><span class="eyebrow">Step 4</span><h2>Photos</h2>
          <p class="hint">All optional, all helpful.</p></div>
        <div class="step__body">
          <div class="field"><span class="label">Inspiration</span>
            <p class="hint">Screenshots from Pinterest or Instagram, a photo of the location, anything with the feel you want. Up to 6.</p>
            <div class="drop">
              <div class="thumbs">${state.photos.inspiration.map((u, i) => thumb(u, `Inspiration ${i + 1}`, `insp:${i}`)).join('')}</div>
              <label class="btn file-btn">Add photos<input type="file" id="inspFiles" accept="image/*" multiple></label>
            </div></div>
          <div class="field"><span class="label">Your family (optional)</span>
            <p class="hint">Helps the stylist choose colors that flatter everyone.</p>
            <div class="drop">
              <div class="thumbs">${state.photos.family ? thumb(state.photos.family, 'Family photo', 'family') : ''}</div>
              <label class="btn file-btn">${state.photos.family ? 'Replace photo' : 'Add a family photo'}<input type="file" id="familyFile" accept="image/*"></label>
            </div></div>
          <div class="field"><span class="label">Pieces you already own</span>
            <p class="hint">Snap a photo of anything you want to use, like a dress you love. The looks are built around it and it shows up in the collage.</p>
            <div class="drop">
              <div class="thumbs">${state.photos.owned.map((o) => thumb(o.dataUrl, `${o.status === 'cutting' ? 'Cutting out… ' : ''}${o.label || 'Piece'} · ${personLabel(personById(o.personId) || {})}`, `owned:${o.id}`, o.cutout)).join('')}</div>
              <div class="owned-form">
                <div class="field"><label for="ownedWho">Whose?</label>
                  <select id="ownedWho">${state.family.map((p) => `<option value="${p.id}">${esc(personLabel(p))}</option>`).join('')}</select></div>
                <div class="field"><label for="ownedLabel">What is it?</label>
                  <input id="ownedLabel" type="text" placeholder="Cream knit dress"></div>
                <label class="btn file-btn">Add photo<input type="file" id="ownedFile" accept="image/*"></label>
              </div>
            </div></div>
        </div>
      </section>

      <div class="submit-row">
        <button type="submit" class="btn btn--primary btn--big">Style our shoot</button>
        <span class="hint" id="formError" role="alert"></span>
      </div>
    </form>`;
}

function setupNotice() {
  const missing = [!config.stylist && 'ANTHROPIC_API_KEY (stylist)', !config.products && 'CHANNEL3_API_KEY (product photos and shop links)'].filter(Boolean);
  return `<div class="notice"><p><b>Setup:</b> add ${missing.map(esc).join(' and ')} in Cloudflare (your Worker → Settings → Variables and Secrets), then refresh this page.</p></div>`;
}

function personRow(p) {
  return `<div class="person" data-person="${p.id}">
    <div class="field"><label for="n-${p.id}">Name</label><input id="n-${p.id}" type="text" data-pf="name" placeholder="Optional" value="${esc(p.name)}"></div>
    <div class="field"><label for="r-${p.id}">Who</label><select id="r-${p.id}" data-pf="relation">
      ${RELATIONS.map((r) => `<option ${p.relation === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
    <div class="field"><label for="a-${p.id}">Age</label><div class="row" style="gap:6px;flex-wrap:nowrap">
      <input id="a-${p.id}" type="number" inputmode="decimal" min="0" max="110" data-pf="age" value="${esc(p.age)}" style="min-width:0">
      <select data-pf="ageUnit" aria-label="Age unit" style="min-width:0;width:auto"><option value="years" ${p.ageUnit === 'years' ? 'selected' : ''}>yrs</option><option value="months" ${p.ageUnit === 'months' ? 'selected' : ''}>mos</option></select></div></div>
    <div class="field"><label for="g-${p.id}">Shops for</label><select id="g-${p.id}" data-pf="gender">
      ${GENDERS.map(([v, l]) => `<option value="${v}" ${p.gender === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="field"><label for="s-${p.id}">Size</label><input id="s-${p.id}" type="text" data-pf="size" placeholder="M, 6, 12-18m" value="${esc(p.size)}"></div>
    <button type="button" class="btn btn--ghost remove" data-action="remove-person" aria-label="Remove ${esc(personLabel(p))}">Remove</button>
  </div>`;
}

function thumb(url, caption, ref, cutout = false) {
  return `<figure class="thumb${cutout ? ' thumb--cutout' : ''}"><img src="${url}" alt="${esc(caption)}"><figcaption>${esc(caption)}</figcaption>
    <button type="button" class="x" data-action="remove-photo" data-ref="${esc(ref)}" aria-label="Remove ${esc(caption)}">×</button></figure>`;
}

// One delegated set of listeners for the whole app.
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-chip],[data-color],[data-action],[data-tab]');
  if (!el) return;
  const q = state.quiz;
  if (el.dataset.chip) {
    const g = el.dataset.chip; const v = el.dataset.value;
    if (g === 'styles') q.styles = q.styles.includes(v) ? q.styles.filter((s) => s !== v) : [...q.styles, v];
    else if (g === 'budgetPer') q.budget.per = v;
    else q[g] = v;
    saveState(); renderQuiz(); return;
  }
  if (el.dataset.color) {
    const c = el.dataset.color;
    if (q.colors.includes(c)) q.colors = q.colors.filter((x) => x !== c);
    else if (q.colors.length < 4) q.colors = [...q.colors, c];
    else toast('Up to 4 colors');
    saveState(); renderQuiz(); return;
  }
  const a = el.dataset.action;
  if (a === 'add-person') { state.family.push(newPerson('Child', '')); saveState(); renderQuiz(); }
  if (a === 'remove-person') {
    const id = el.closest('[data-person]').dataset.person;
    if (state.family.length === 1) return toast('Keep at least one person');
    state.family = state.family.filter((p) => p.id !== id);
    state.photos.owned = state.photos.owned.filter((o) => o.personId !== id);
    saveState(); renderQuiz();
  }
  if (a === 'remove-photo') {
    const [kind, key] = el.dataset.ref.split(':');
    if (kind === 'insp') state.photos.inspiration.splice(Number(key), 1);
    if (kind === 'family') state.photos.family = null;
    if (kind === 'owned') state.photos.owned = state.photos.owned.filter((o) => o.id !== key);
    renderQuiz();
  }
  if (a === 'edit') { state.view = 'quiz'; renderQuiz(); window.scrollTo(0, 0); }
  if (a === 'swap') openSheet(Number(el.dataset.look), el.dataset.key);
  if (a === 'retry-item') openSheet(Number(el.dataset.look), el.dataset.key);
  if (a === 'retry-look') buildLook(Number(el.dataset.look));
  if (a === 'go') goToLook(Number(el.dataset.to));
  if (a === 'step') goToLook(state.current + Number(el.dataset.to));
  if (a === 'reason') toggleReason(el.dataset.value);
  if (a === 'pick-option') pickOption(el.dataset.id);
  if (a === 'sheet-back') { state.sheet.step = 'why'; renderSheet(); }
  if (a === 'sheet-cancel') closeSheet();
  if (a === 'sheet-go') submitSheet();
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.pf) {
    const p = personById(t.closest('[data-person]').dataset.person);
    p[t.dataset.pf] = t.value; saveState(); return;
  }
  if (t.id === 'notes') state.quiz.notes = t.value;
  if (t.id === 'location') state.quiz.location = t.value;
  if (t.id === 'date') state.quiz.date = t.value;
  if (t.id === 'sheetNote' && state.sheet) { state.sheet.note = t.value; return; }
  if (t.id === 'budget') state.quiz.budget.amount = t.value;
  saveState();
});

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.dataset.pf === 'relation' || t.dataset.pf === 'gender' || t.dataset.pf === 'ageUnit') {
    const p = personById(t.closest('[data-person]').dataset.person);
    p[t.dataset.pf] = t.value;
    // Fill an obvious default for who they shop for.
    if (t.dataset.pf === 'relation' && !p.gender) {
      const g = { Mom: 'woman', Grandma: 'woman', Aunt: 'woman', Dad: 'man', Grandpa: 'man', Uncle: 'man', Daughter: 'girl', Son: 'boy' }[t.value];
      if (g) { p.gender = g; renderQuiz(); }
    }
    saveState(); return;
  }
  try {
    if (t.id === 'inspFiles') {
      const files = [...t.files].slice(0, 6 - state.photos.inspiration.length);
      for (const f of files) state.photos.inspiration.push(await resizeImage(f));
      renderQuiz();
    }
    if (t.id === 'familyFile' && t.files[0]) { state.photos.family = await resizeImage(t.files[0]); renderQuiz(); }
    if (t.id === 'ownedFile' && t.files[0]) {
      if (state.photos.owned.length >= 8) return toast('Up to 8 pieces');
      const dataUrl = await resizeImage(t.files[0], 900);
      const owned = {
        id: uid('o'), personId: document.getElementById('ownedWho').value,
        label: document.getElementById('ownedLabel').value.trim(), dataUrl, status: 'cutting',
      };
      state.photos.owned.push(owned);
      owned.pending = cutOutPiece(owned).finally(() => { owned.status = 'ready'; if (state.view === 'quiz') renderQuiz(); });
      renderQuiz();
    }
  } catch (err) { toast(err.message); }
});

document.addEventListener('submit', (e) => {
  if (e.target.id !== 'quiz') return;
  e.preventDefault();
  const err = validate();
  document.getElementById('formError').textContent = err || '';
  if (!err) run();
});

function validate() {
  if (!state.family.length) return 'Add at least one person.';
  const noAge = state.family.find((p) => ageYears(p) == null);
  if (noAge) return `Add an age for ${personLabel(noAge)} so we shop the right department.`;
  if (state.quiz.paletteMode === 'chosen' && state.quiz.colors.length < 2) return 'Pick at least 2 colors, or let us choose from your photos.';
  return '';
}

// ---------- the styling run ----------
function familyForApi() {
  return state.family.map((p) => ({
    id: p.id, name: p.name.trim(), relation: p.relation, age: ageYears(p), gender: p.gender, size: p.size.trim(),
  }));
}

function renderWorking(stepIdx, extra = '') {
  const steps = ['Checking the weather', 'Planning three looks', 'Finding and editing real products'];
  $app.innerHTML = `<section class="working"><span class="eyebrow">Styling your shoot</span><h2>Hang tight, this takes about a minute.</h2>
    <ol>${steps.map((s, i) => `<li class="${i < stepIdx ? 'done' : i === stepIdx ? 'now' : ''}">${s}${i < stepIdx ? ' ✓' : ''}</li>`).join('')}</ol>${extra}</section>`;
}

async function run() {
  if (!config.stylist || !config.products) {
    $app.querySelector('#formError').textContent = 'The stylist needs both keys set up in Cloudflare first.';
    return;
  }
  state.view = 'working';
  window.scrollTo(0, 0);
  renderWorking(0);
  await Promise.all(state.photos.owned.map((o) => o.pending).filter(Boolean));
  const q = state.quiz;
  state.weather = null;
  if (q.location.trim() && q.setting !== 'studio') {
    try {
      state.weather = await api(`/api/weather?place=${encodeURIComponent(q.location.trim())}${q.date ? `&date=${q.date}` : ''}`);
    } catch (e) { state.weather = { error: e.code || 'weather', message: e.message }; }
  }
  renderWorking(1);
  try {
    state.plan = await api('/api/stylist', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quiz: q, family: familyForApi(), weather: state.weather && !state.weather.error ? state.weather : null,
        photos: { inspiration: state.photos.inspiration, family: state.photos.family, owned: state.photos.owned.map(({ id, personId, label, dataUrl }) => ({ id, personId, label, dataUrl })) },
      }),
    });
  } catch (e) {
    state.view = 'quiz';
    renderWorking(1, `<p class="error">${esc(e.message)}</p><div><button class="btn" data-action="edit">Back to the questions</button></div>`);
    return;
  }
  state.looks = state.plan.looks.map((look) => ({
    ...look,
    status: 'waiting', step: '', together: '', note: '',
    items: look.items.map((it, i) => ({
      ...it, key: `${look.id}-${i}`, status: it.ownedId ? 'owned' : 'waiting',
      product: null, seen: [], message: '',
    })),
  }));
  state.current = 0;
  state.view = 'results';
  renderResults();
  // Look 1 first so it's ready soonest; the others follow in the background.
  for (let i = 0; i < state.looks.length; i += 1) await buildLook(i);
}

// ---------- building a look: search, then a behind-the-scenes edit ----------
function itemWho(it) {
  const p = personById(it.personId) || {};
  const y = ageYears(p);
  const age = y == null ? '' : y < 2 ? `${Math.round(y * 12)} months` : `${Math.round(y)}`;
  return [personLabel(p), age, p.gender].filter(Boolean).join(', ');
}

async function searchFor(it, query, maxPrice, max) {
  const p = personById(it.personId) || {};
  const data = await api('/api/products', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, maxPrice, gender: p.gender, age: ageYears(p), excludeIds: it.seen, slot: it.slot, max }),
  });
  data.products.forEach((c) => { if (!it.seen.includes(c.id)) it.seen.push(c.id); });
  return data.products;
}

// Up to 3 searches at a time so the store service isn't flooded.
async function inBatches(list, fn, size = 3) {
  for (let i = 0; i < list.length; i += size) await Promise.all(list.slice(i, i + size).map(fn));
}

function curateContext() {
  const q = state.quiz;
  return {
    style: q.styles.join(', '),
    date: q.date,
    setting: [q.setting, q.timeOfDay, q.location].filter(Boolean).join(', '),
  };
}

function fixedPieces(look, exceptKeys = []) {
  return look.items.filter((it) => !exceptKeys.includes(it.key) && (it.product || it.ownedId)).map((it) => ({
    key: it.key, who: itemWho(it), slot: it.slot,
    title: it.product ? it.product.title : `${ownedPhoto(it)?.label || it.description} (already owned)`,
    image: it.product ? it.product.image : null,
  }));
}

async function curate(look, items, candidates, fixed) {
  return api('/api/curate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      look: { name: look.name, vibe: look.vibe },
      palette: state.plan.palette,
      context: curateContext(),
      fixed,
      items: items.map((it) => ({
        key: it.key, who: itemWho(it), slot: it.slot, description: it.description,
        colorName: it.colorName, maxPrice: it.maxPrice, candidates: candidates[it.key] || [],
      })),
    }),
  });
}

function applyChoices(items, candidates, result) {
  const retry = [];
  for (const c of result.choices) {
    const it = items.find((x) => x.key === c.key);
    if (!it) continue;
    const pick = (candidates[it.key] || []).find((x) => x.id === c.pick);
    if (pick) { it.product = pick; it.status = 'ok'; it.message = ''; } else retry.push({ it, query: c.newQuery, maxPrice: c.maxPrice });
  }
  return retry;
}

async function buildLook(idx) {
  const look = state.looks[idx];
  const todo = look.items.filter((it) => !it.ownedId);
  look.status = 'working'; look.step = 'Finding pieces for each of you'; look.note = '';
  todo.forEach((it) => { it.status = 'loading'; it.product = null; it.seen = []; });
  renderPanel(idx);
  try {
    // 1. Search every piece.
    const candidates = {};
    const failures = [];
    await inBatches(todo, async (it) => {
      try { candidates[it.key] = await searchFor(it, it.query, it.maxPrice); } catch (e) { candidates[it.key] = []; failures.push(e.message); }
    });
    if (todo.length && failures.length === todo.length) throw new Error(failures[0]);

    // 2. The edit: look at the photos together and pick the set.
    look.step = 'Checking how everything looks together';
    renderPanel(idx);
    let retry;
    try {
      const result = await curate(look, todo, candidates, fixedPieces(look, todo.map((t) => t.key)));
      look.together = result.together;
      if (!result.sawPhotos) look.note = 'Some store photos could not be checked, so a few picks were made from their descriptions.';
      retry = applyChoices(todo, candidates, result);
    } catch (e) {
      // The edit failed: fall back to the top search result rather than show nothing.
      todo.forEach((it) => { const c = candidates[it.key]?.[0]; if (c) { it.product = c; it.status = 'ok'; } });
      retry = todo.filter((it) => !it.product).map((it) => ({ it, query: it.query, maxPrice: it.maxPrice }));
      look.note = `The final style check didn't run (${e.message}), so these are the top search results.`;
    }

    // 3. One more round for anything that didn't pass, judged against the chosen pieces.
    if (retry.length) {
      look.step = 'Finding better options for a few pieces';
      renderPanel(idx);
      const again = {};
      await inBatches(retry, async ({ it, query, maxPrice }) => {
        if (maxPrice) it.maxPrice = maxPrice;
        try { again[it.key] = await searchFor(it, query || it.query, it.maxPrice); } catch { again[it.key] = []; }
      });
      const items = retry.map((r) => r.it);
      try {
        const result = await curate(look, items, again, fixedPieces(look, items.map((t) => t.key)));
        applyChoices(items, again, result);
      } catch { /* leave them missing; the shelf offers a retry */ }
      items.forEach((it) => { if (!it.product) { it.status = 'missing'; it.message = 'No piece passed the style check yet.'; } });
    }
    look.status = 'ready';
  } catch (e) {
    look.status = 'error';
    look.note = e.message || 'Something went wrong building this look.';
  }
  renderPanel(idx);
}

// ---------- swapping one piece: say why, then choose from checked options ----------
function openSheet(lookIdx, key) {
  state.sheet = { lookIdx, key, reasons: [], note: '', step: 'why', options: [], plan: null, message: '' };
  renderSheet();
}
function closeSheet() {
  state.sheet = null;
  document.getElementById('sheet')?.remove();
  // A piece dragged off but kept goes back to full strength.
  document.querySelectorAll('.fl-piece').forEach((i) => { i.style.opacity = ''; });
}
function toggleReason(v) {
  const r = state.sheet.reasons;
  state.sheet.reasons = r.includes(v) ? r.filter((x) => x !== v) : [...r, v];
  renderSheet();
}

async function submitSheet() {
  const sh = state.sheet;
  if (!sh.reasons.length && !sh.note.trim()) return toast('Pick at least one reason so the stylist knows what to change');
  sh.step = 'loading';
  renderSheet();
  try {
    const { plan, options } = await findOptions(sh.lookIdx, sh.key, sh.reasons, sh.note.trim());
    if (state.sheet !== sh) return; // closed while loading
    sh.plan = plan;
    sh.options = options;
    sh.step = options.length ? 'options' : 'error';
    sh.message = options.length ? '' : 'Nothing passed the style check for that feedback. Try different reasons or a note.';
  } catch (e) {
    if (state.sheet !== sh) return;
    sh.step = 'error';
    sh.message = e.message;
  }
  renderSheet();
}

async function findOptions(idx, key, reasons, note) {
  const look = state.looks[idx];
  const it = look.items.find((x) => x.key === key);
  if (it.product && !it.seen.includes(it.product.id)) it.seen.push(it.product.id);
  const plan = await api('/api/replace', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      item: { who: itemWho(it), slot: it.slot, description: it.description, currentTitle: it.product?.title, price: it.product?.price, maxPrice: it.maxPrice },
      reasons, note, date: state.quiz.date,
      look: { name: look.name, vibe: look.vibe },
      palette: state.plan.palette,
      others: fixedPieces(look, [key]).map((f) => `${f.who}, ${f.slot}: ${f.title}`),
    }),
  });
  const probe = { ...it, description: plan.description, colorName: plan.colorName, maxPrice: plan.maxPrice };
  const feedback = [reasons.map((r) => REASONS.find(([v]) => v === r)?.[1]).filter(Boolean).join(', '), note].filter(Boolean).join('. ');
  let options = [];
  let query = plan.query;
  for (let round = 0; round < 2 && options.length < 3; round += 1) {
    const cands = await searchFor(it, query, plan.maxPrice, 8);
    if (!cands.length) continue;
    const ranked = await api('/api/curate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'rank',
        look: { name: look.name, vibe: look.vibe },
        palette: state.plan.palette,
        context: { ...curateContext(), feedback },
        fixed: fixedPieces(look, [key]),
        items: [{ key, who: itemWho(probe), slot: it.slot, description: probe.description, colorName: probe.colorName, maxPrice: probe.maxPrice, candidates: cands }],
      }),
    });
    ranked.ranked.forEach((id) => { const c = cands.find((x) => x.id === id); if (c && !options.some((o) => o.id === id)) options.push(c); });
    if (ranked.newQuery) query = ranked.newQuery;
  }
  return { plan, options: options.slice(0, 6) };
}

function pickOption(id) {
  const sh = state.sheet;
  const look = state.looks[sh.lookIdx];
  const it = look.items.find((x) => x.key === sh.key);
  const chosen = sh.options.find((o) => o.id === id);
  if (!chosen) return;
  Object.assign(it, {
    product: chosen, status: 'ok', message: '',
    description: sh.plan.description, colorName: sh.plan.colorName, colorHex: sh.plan.colorHex,
    query: sh.plan.query, maxPrice: sh.plan.maxPrice,
  });
  const idx = sh.lookIdx;
  closeSheet();
  renderPanel(idx);
  toast('Swapped');
}

function renderSheet() {
  const sh = state.sheet;
  if (!sh) return;
  const look = state.looks[sh.lookIdx];
  const it = look.items.find((x) => x.key === sh.key);
  const who = personLabel(personById(it.personId) || {});
  let el = document.getElementById('sheet');
  const first = !el;
  if (!el) { el = document.createElement('div'); el.id = 'sheet'; el.className = 'sheet-wrap'; document.body.appendChild(el); }
  const head = `<div class="sheet__head">
      ${it.product ? `<img src="${esc(it.product.image)}" alt="" referrerpolicy="no-referrer">` : `<div class="card__img" style="--swatch:${it.colorHex};width:64px"></div>`}
      <div><span class="eyebrow">${esc(who)} · ${esc(SLOT_LABEL[it.slot])}</span>
        <h3 id="sheetTitle">${sh.step === 'options' ? 'Pick a replacement' : sh.step === 'loading' ? 'Finding options…' : "What's not working?"}</h3></div>
    </div>`;
  let body = '';
  if (sh.step === 'why' || sh.step === 'error') {
    body = `<p class="hint" style="margin:0">Choose all that apply.</p>
      <div class="chips" role="group" aria-label="Reasons">${REASONS.map(([v, l]) => `<button type="button" class="chip" data-action="reason" data-value="${v}" aria-pressed="${sh.reasons.includes(v)}">${esc(l)}</button>`).join('')}</div>
      <div class="field"><label for="sheetNote">Anything specific? (optional)</label>
        <input id="sheetNote" type="text" placeholder="e.g. something softer, no plaid, more like the sweater" value="${esc(sh.note)}"></div>
      ${sh.step === 'error' ? `<p class="error" style="margin:0">${esc(sh.message)}</p>` : ''}
      <div class="sheet__actions">
        <button type="button" class="btn" data-action="sheet-cancel">Keep it</button>
        <button type="button" class="btn btn--primary" data-action="sheet-go">Show options</button>
      </div>`;
  } else if (sh.step === 'loading') {
    body = `<div class="sheet__loading"><span class="spinner" aria-hidden="true"></span>
      <p>The stylist is searching and checking each option against the rest of the look. This takes about 20 seconds.</p></div>
      <div class="sheet__actions"><button type="button" class="btn" data-action="sheet-cancel">Cancel</button></div>`;
  } else {
    body = `<div class="shelf shelf--options">${sh.options.map((o) => `
      <article class="card">
        <img src="${esc(o.image)}" alt="${esc(o.title)}" referrerpolicy="no-referrer">
        <span class="card__title">${esc(o.title)}</span>
        <span class="card__meta"><b>${money(o.price)}</b>${o.compareAt ? ` <s>${money(o.compareAt)}</s>` : ''} · ${esc(o.merchant)}</span>
        <div class="card__actions"><button type="button" class="btn btn--primary" data-action="pick-option" data-id="${esc(o.id)}">Use this</button></div>
      </article>`).join('')}</div>
      <div class="sheet__actions">
        <button type="button" class="btn" data-action="sheet-back">Change feedback</button>
        <button type="button" class="btn" data-action="sheet-cancel">Keep the original</button>
      </div>`;
  }
  el.innerHTML = `<div class="sheet-backdrop" data-action="sheet-cancel"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">${head}${body}</div>`;
  if (first) el.querySelector('.chip')?.focus();
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.sheet) closeSheet(); });

// ---------- results ----------
function textOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#1e2a2c' : '#ffffff';
}

function budgetCap() {
  const amt = Number(state.quiz.budget.amount);
  if (!amt) return null;
  return state.quiz.budget.per === 'family' ? amt : amt * state.family.length;
}

function ownedPhoto(item) {
  return state.photos.owned.find((o) => o.id === item.ownedId);
}

function renderResults() {
  const plan = state.plan;
  const w = state.weather;
  const q = state.quiz;
  const weatherFact = w && !w.error
    ? `<div class="fact"><span class="eyebrow">${w.kind === 'forecast' ? 'Forecast' : 'Typical for this week'}</span><b>${w.highF}° / ${w.lowF}°F${w.precipChance != null ? ` · ${w.precipChance}% rain` : ''}</b><span class="hint">${esc([w.condition, w.sunset ? `sunset ${w.sunset}` : '', `${w.place.name}${w.place.region ? ', ' + w.place.region : ''}`].filter(Boolean).join(' · '))}</span></div>`
    : w?.error ? `<div class="fact"><span class="eyebrow">Weather</span><span class="hint">${esc(w.message || 'Not available')}</span></div>` : '';
  $app.innerHTML = `
    <section class="results-head">
      <span class="eyebrow">${esc([q.styles.join(' + '), q.setting === 'indoor' ? 'Indoors' : q.setting === 'studio' ? 'Studio' : 'Outdoors', q.timeOfDay].filter(Boolean).join(' · '))}</span>
      <h1>Three ways to dress your crew</h1>
      <p class="lede">${esc(plan.summary)}</p>
      <div class="palette" aria-label="Palette">${plan.palette.map((c) => `<span style="background:${c.hex};color:${textOn(c.hex)}">${esc(c.name)}</span>`).join('')}</div>
      <div class="facts">${weatherFact}
        ${plan.weather_note ? `<div class="fact" style="max-width:52ch"><span class="eyebrow">Why these pieces</span><span>${esc(plan.weather_note)}</span></div>` : ''}</div>
      <div><button type="button" class="btn btn--ghost" data-action="edit">Change answers</button></div>
    </section>
    <nav class="look-nav" aria-label="Looks">
      <button type="button" class="btn look-nav__arrow" data-action="step" data-to="-1" aria-label="Previous look">‹</button>
      <div class="look-nav__dots">${state.looks.map((l, i) => `<button type="button" class="dot" data-action="go" data-to="${i}" aria-label="Look ${i + 1}: ${esc(l.name)}" aria-current="${i === state.current}"></button>`).join('')}</div>
      <span class="look-nav__count mono" id="lookCount">Look ${state.current + 1} of ${state.looks.length}</span>
      <button type="button" class="btn look-nav__arrow" data-action="step" data-to="1" aria-label="Next look">›</button>
    </nav>
    <div class="looks" id="looks">${state.looks.map((_, i) => `<section class="look" id="look-${i}" data-look="${i}" aria-roledescription="slide" aria-label="Look ${i + 1}"></section>`).join('')}</div>`;
  state.looks.forEach((_, i) => renderPanel(i));
  const strip = document.getElementById('looks');
  let t;
  strip.addEventListener('scroll', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const i = Math.round(strip.scrollLeft / strip.clientWidth);
      if (i !== state.current) { state.current = i; updateNav(); }
    }, 80);
  }, { passive: true });
}

function updateNav() {
  document.querySelectorAll('.look-nav .dot').forEach((d, i) => d.setAttribute('aria-current', String(i === state.current)));
  const c = document.getElementById('lookCount');
  if (c) c.textContent = `Look ${state.current + 1} of ${state.looks.length}`;
}

function goToLook(to) {
  const strip = document.getElementById('looks');
  if (!strip) return;
  const i = Math.max(0, Math.min(state.looks.length - 1, to));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  strip.scrollTo({ left: i * strip.clientWidth, behavior: reduce ? 'auto' : 'smooth' });
  state.current = i; updateNav();
}

function personScale(p) {
  const y = ageYears(p) ?? 30;
  return y < 1 ? 0.62 : y < 3 ? 0.7 : y < 6 ? 0.78 : y < 10 ? 0.86 : y < 14 ? 0.94 : 1;
}

function pieceImg(idx, it) {
  const owned = it.ownedId ? ownedPhoto(it) : null;
  const src = it.product?.image || owned?.dataUrl;
  const cls = `fl-piece fl-piece--${it.slot}${owned && !owned.cutout ? ' fl-piece--owned' : ''}`;
  if (it.status === 'loading') return `<div class="${cls} fl-piece--loading" style="--swatch:${it.colorHex}"></div>`;
  if (!src) return '';
  return `<img class="${cls}" src="${esc(src)}" alt="${esc(it.product?.title || owned?.label || it.description)}" data-look="${idx}" data-key="${it.key}" draggable="false" referrerpolicy="no-referrer">`;
}

// One tile with the whole family's pieces, grouped by person like a styled flat lay.
function flatLay(idx) {
  const look = state.looks[idx];
  const people = state.family.filter((p) => look.items.some((it) => it.personId === p.id));
  const cols = people.length > 4 ? Math.ceil(people.length / 2) : people.length;
  const groups = people.map((p) => {
    const mine = look.items.filter((it) => it.personId === p.id);
    const get = (slot) => mine.find((it) => it.slot === slot);
    const upper = [get('outerwear'), get('dress') || get('top')].filter(Boolean);
    return `<div class="fl-person" style="--s:${personScale(p)}">
      <div class="fl-upper ${upper.length > 1 ? 'fl-upper--layered' : ''}">${upper.map((it) => pieceImg(idx, it)).join('')}</div>
      ${get('bottom') ? `<div class="fl-lower">${pieceImg(idx, get('bottom'))}</div>` : ''}
      ${get('legwear') ? `<div class="fl-legwear">${pieceImg(idx, get('legwear'))}</div>` : ''}
      ${get('shoes') ? `<div class="fl-shoes">${pieceImg(idx, get('shoes'))}</div>` : ''}
      <span class="fl-name">${esc(personLabel(p))}</span>
    </div>`;
  }).join('');
  return `<div class="flatlay" data-look="${idx}" style="--cols:${cols}" aria-label="Flat lay of ${esc(look.name)}. Drag a piece off to swap it.">
    ${groups}
    <div class="flatlay__drop" aria-hidden="true">Let go to swap this piece</div>
  </div>`;
}

function shelfCard(idx, it) {
  const who = personLabel(personById(it.personId) || {});
  const label = `<span class="card__who">${esc(who)} · ${esc(SLOT_LABEL[it.slot])}</span>`;
  if (it.ownedId) {
    const o = ownedPhoto(it);
    return `<article class="card ${o?.cutout ? '' : 'card--owned'}">${o ? `<img src="${o.dataUrl}" alt="">` : '<div class="card__img"></div>'}${label}
      <span class="card__title">${esc(o?.label || it.description)}</span><span class="card__meta">You own this</span></article>`;
  }
  if (it.status === 'loading' || it.status === 'waiting') {
    return `<article class="card card--loading">${'<div class="card__img"></div>'}${label}<span class="card__title">${esc(it.description)}</span><span class="card__meta">Finding a match…</span></article>`;
  }
  if (!it.product) {
    return `<article class="card card--missing"><div class="card__img" style="--swatch:${it.colorHex}"></div>${label}
      <span class="card__title">${esc(it.description)}</span><span class="card__meta">${esc(it.message || 'No match yet')}</span>
      <div class="card__actions"><button type="button" class="btn" data-action="retry-item" data-look="${idx}" data-key="${it.key}">Try again</button></div></article>`;
  }
  const p = it.product;
  return `<article class="card" id="card-${it.key}">
    <img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy" referrerpolicy="no-referrer">
    ${label}
    <span class="card__title">${esc(p.title)}</span>
    <span class="card__meta"><b>${money(p.price)}</b>${p.compareAt ? ` <s>${money(p.compareAt)}</s>` : ''} · ${esc(p.merchant)}</span>
    <div class="card__actions">
      <a class="btn btn--primary" href="${esc(p.url)}" target="_blank" rel="sponsored noopener">Shop</a>
      <button type="button" class="btn" data-action="swap" data-look="${idx}" data-key="${it.key}">Swap</button>
    </div></article>`;
}

function renderPanel(idx) {
  const el = document.getElementById(`look-${idx}`);
  if (!el) return;
  const look = state.looks[idx];
  const ordered = state.family.flatMap((p) => look.items.filter((it) => it.personId === p.id)
    .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot)));
  const total = look.items.reduce((s, it) => s + (it.product?.price || 0), 0);
  const cap = budgetCap();
  let body;
  if (look.status === 'waiting' || look.status === 'working') {
    body = `<div class="flatlay flatlay--pending"><div><span class="spinner" aria-hidden="true"></div>
      <p>${esc(look.status === 'waiting' ? 'Up next, after the look before it' : look.step)}…</p></div></div>`;
  } else if (look.status === 'error') {
    body = `<div class="flatlay flatlay--pending"><div><p class="error">${esc(look.note)}</p>
      <button type="button" class="btn" data-action="retry-look" data-look="${idx}">Try this look again</button></div></div>`;
  } else {
    body = `${flatLay(idx)}
      <p class="hint look__tip">Drag a piece off the flat lay to swap it.</p>
      ${look.together ? `<p class="look__together">${esc(look.together)}</p>` : ''}
      ${look.note ? `<p class="hint">${esc(look.note)}</p>` : ''}
      <div class="shelf" aria-label="Pieces in this look">${ordered.map((it) => shelfCard(idx, it)).join('')}</div>
      <div class="look__total"><span class="eyebrow">This look</span><b class="mono ${cap && total > cap ? 'over' : ''}">${money(total)}</b>
        ${cap ? `<span class="hint">${total > cap ? `${money(total - cap)} over` : `${money(cap - total)} under`} your ${money(cap)} budget</span>` : ''}</div>`;
  }
  el.innerHTML = `<header class="look__head"><span class="eyebrow">Look ${idx + 1}</span><h2>${esc(look.name)}</h2><p>${esc(look.vibe)}</p></header>${body}`;
}

// ---------- dragging a piece off the flat lay ----------
let drag = null;
document.addEventListener('pointerdown', (e) => {
  const img = e.target.closest?.('.fl-piece[data-key]');
  if (!img || e.button > 0) return;
  const tile = img.closest('.flatlay');
  drag = { img, tile, x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, out: false };
  img.setPointerCapture(e.pointerId);
  e.preventDefault();
});
document.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x; const dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 6) return;
  drag.moved = true;
  drag.img.classList.add('is-dragging');
  drag.img.style.transform = `translate(${dx}px, ${dy}px) scale(1.06)`;
  const r = drag.tile.getBoundingClientRect();
  const m = 12;
  drag.out = e.clientX < r.left - m || e.clientX > r.right + m || e.clientY < r.top - m || e.clientY > r.bottom + m;
  drag.tile.classList.toggle('is-releasing', drag.out);
});
function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const { img, tile, moved, out } = drag;
  drag = null;
  tile.classList.remove('is-releasing');
  img.classList.remove('is-dragging');
  if (out) {
    img.style.opacity = '0.25';
    openSheet(Number(img.dataset.look), img.dataset.key);
    img.style.transform = '';
    return;
  }
  img.style.transform = '';
  if (!moved && e.type === 'pointerup') {
    // A tap: show that piece in the shelf below.
    const card = document.getElementById(`card-${img.dataset.key}`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      card.classList.add('is-flash'); setTimeout(() => card.classList.remove('is-flash'), 900);
    }
  }
}
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);

// ---------- boot ----------
(async function boot() {
  try { config = await api('/api/config'); } catch { /* opened as a plain file: keys unknown */ }
  if (config.skimlinksId) {
    const s = document.createElement('script');
    s.src = `https://s.skimresources.com/js/${encodeURIComponent(config.skimlinksId)}.skimlinks.js`;
    s.async = true; document.body.appendChild(s);
  }
  renderQuiz();
})();
