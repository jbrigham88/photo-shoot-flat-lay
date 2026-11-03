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
const SLOT_ORDER = ['outerwear', 'dress', 'top', 'bottom', 'shoes', 'accessory'];
const SLOT_LABEL = { outerwear: 'Layer', dress: 'Dress / one-piece', top: 'Top', bottom: 'Bottom', shoes: 'Shoes', accessory: 'Accessory' };
const STORE_KEY = 'psfl.v1';

const $app = document.getElementById('app');
const $tray = document.getElementById('tray');

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
state.products = {};      // itemKey -> { status, list, index, message }
state.finalSet = {};      // `${personId}:${slot}` -> { item, product }
state.tab = 'look1';
state.demo = false;

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
function resizeImage(file, max = 1024) {
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
      resolve(c.toDataURL('image/jpeg', 0.82));
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
              <div class="thumbs">${state.photos.owned.map((o) => thumb(o.dataUrl, `${o.label || 'Piece'} · ${personLabel(personById(o.personId) || {})}`, `owned:${o.id}`)).join('')}</div>
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
  renderTray();
}

function setupNotice() {
  const missing = [!config.stylist && 'ANTHROPIC_API_KEY (stylist)', !config.products && 'CHANNEL3_API_KEY (product photos and shop links)'].filter(Boolean);
  return `<div class="notice"><p><b>Setup:</b> add ${missing.map(esc).join(' and ')} in Vercel → Settings → Environment Variables, then redeploy. ${!config.stylist ? 'Until then you can preview a sample plan.' : ''}</p></div>`;
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

function thumb(url, caption, ref) {
  return `<figure class="thumb"><img src="${url}" alt="${esc(caption)}"><figcaption>${esc(caption)}</figcaption>
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
  if (el.dataset.tab) { state.tab = el.dataset.tab; renderResults(); return; }
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
  if (a === 'swap') swapProduct(el.dataset.key);
  if (a === 'add-set') addToSet(el.dataset.key);
  if (a === 'add-look') addLook(el.dataset.look);
  if (a === 'remove-set') { delete state.finalSet[el.dataset.slot]; renderResults(); }
  if (a === 'retry') loadProduct(el.dataset.key, true);
  if (a === 'open-set') { state.tab = 'final'; renderResults(); document.querySelector('.tabs')?.scrollIntoView({ behavior: 'smooth' }); }
  if (a === 'sample') runSample();
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
      state.photos.owned.push({
        id: uid('o'), personId: document.getElementById('ownedWho').value,
        label: document.getElementById('ownedLabel').value.trim(), dataUrl,
      });
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
  const steps = ['Checking the weather', 'Planning three looks', 'Finding real products in your budget'];
  $app.innerHTML = `<section class="working"><span class="eyebrow">Styling your shoot</span><h2>Hang tight, this takes about a minute.</h2>
    <ol>${steps.map((s, i) => `<li class="${i < stepIdx ? 'done' : i === stepIdx ? 'now' : ''}">${s}${i < stepIdx ? ' ✓' : ''}</li>`).join('')}</ol>${extra}</section>`;
}

async function run() {
  if (!config.stylist) {
    $app.querySelector('#formError').innerHTML = 'The stylist needs ANTHROPIC_API_KEY. <button type="button" class="btn btn--ghost" data-action="sample">Preview a sample plan</button>';
    return;
  }
  state.view = 'working'; state.products = {}; state.finalSet = {}; state.demo = false;
  window.scrollTo(0, 0);
  renderWorking(0);
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
        photos: { inspiration: state.photos.inspiration, family: state.photos.family, owned: state.photos.owned },
      }),
    });
  } catch (e) {
    state.view = 'quiz';
    renderWorking(1, `<p class="error">${esc(e.message)}</p><div><button class="btn" data-action="edit">Back to the questions</button></div>`);
    return;
  }
  state.view = 'results'; state.tab = 'look1';
  renderResults();
  loadAllProducts();
}

// ---------- products ----------
const itemKey = (lookId, i) => `${lookId}-${i}`;
function findItem(key) {
  const [lookId, i] = key.split('-');
  const look = state.plan.looks.find((l) => l.id === lookId);
  return look?.items[Number(i)];
}

const queue = []; let active = 0;
function enqueue(fn) {
  return new Promise((resolve) => {
    queue.push(async () => { try { await fn(); } finally { resolve(); } });
    pump();
  });
}
function pump() {
  while (active < 3 && queue.length) {
    const job = queue.shift(); active += 1;
    job().finally(() => { active -= 1; pump(); });
  }
}

function loadAllProducts() {
  // Load the visible look first so the first board fills quickly.
  const order = [...state.plan.looks].sort((a, b) => (a.id === state.tab ? -1 : b.id === state.tab ? 1 : 0));
  order.forEach((look) => look.items.forEach((it, i) => { if (!it.ownedId) loadProduct(itemKey(look.id, i)); }));
}

function loadProduct(key, force = false) {
  const item = findItem(key);
  if (!item || item.ownedId) return;
  if (state.products[key]?.status === 'ready' && !force) return;
  state.products[key] = { status: 'loading', list: [], index: 0 };
  refreshPiece(key);
  if (state.demo || !config.products) {
    state.products[key] = { status: 'nokey', list: [], index: 0, message: 'Photos appear once CHANNEL3_API_KEY is added.' };
    refreshPiece(key); return;
  }
  const person = personById(item.personId);
  return enqueue(async () => {
    try {
      const data = await api('/api/products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: item.query, maxPrice: item.maxPrice, gender: person?.gender, age: ageYears(person || {}) }),
      });
      state.products[key] = data.products.length
        ? { status: 'ready', list: data.products, index: 0 }
        : { status: 'empty', list: [], index: 0 };
    } catch (e) {
      state.products[key] = { status: 'error', list: [], index: 0, message: e.message };
    }
    refreshPiece(key);
  });
}

function currentProduct(key) {
  const p = state.products[key];
  return p?.status === 'ready' ? p.list[p.index] : null;
}

function swapProduct(key) {
  const p = state.products[key];
  if (!p?.list.length) return;
  p.index = (p.index + 1) % p.list.length;
  refreshPiece(key);
}

function refreshPiece(key) {
  if (state.view !== 'results') return;
  if (state.tab === 'final') { renderResults(); return; }
  const el = document.querySelector(`[data-piece="${key}"]`);
  if (el) el.outerHTML = pieceHtml(key);
  renderTray();
}

// ---------- final set ----------
function setSlotKey(item) { return `${item.personId}:${item.slot}`; }

function addToSet(key, quiet = false) {
  const item = findItem(key);
  if (!item) return;
  const product = currentProduct(key);
  if (!item.ownedId && !product && !quiet) return toast('Wait for a product to load first');
  // A dress replaces top + bottom, and the reverse.
  const sk = setSlotKey(item);
  if (item.slot === 'dress') { delete state.finalSet[`${item.personId}:top`]; delete state.finalSet[`${item.personId}:bottom`]; }
  if (item.slot === 'top' || item.slot === 'bottom') delete state.finalSet[`${item.personId}:dress`];
  state.finalSet[sk] = { item, product, key };
  if (!quiet) {
    toast(`Added to your set: ${SLOT_LABEL[item.slot]} for ${personLabel(personById(item.personId))}`);
    renderResults();
  }
}

function addLook(lookId) {
  const look = state.plan.looks.find((l) => l.id === lookId);
  look.items.forEach((it, i) => addToSet(itemKey(lookId, i), true));
  toast(`${look.name} is in your set. Swap in pieces from other looks anytime.`);
  renderResults();
}

// Pieces added before their product loaded pick it up once it arrives.
function setProduct(entry) { return entry.product || (entry.item.ownedId ? null : currentProduct(entry.key)); }

function setTotal() {
  return Object.values(state.finalSet).reduce((s, e) => s + (setProduct(e)?.price || 0), 0);
}
function budgetCap() {
  const amt = Number(state.quiz.budget.amount);
  if (!amt) return null;
  return state.quiz.budget.per === 'family' ? amt : amt * state.family.length;
}

function renderTray() {
  const n = Object.keys(state.finalSet).length;
  const show = state.view === 'results';
  $tray.hidden = !show;
  document.body.classList.toggle('has-tray', show);
  if (!show) return;
  const cap = budgetCap(); const total = setTotal();
  $tray.innerHTML = `<span><b>Your set</b> · ${n} piece${n === 1 ? '' : 's'} · <span class="mono ${cap && total > cap ? 'over' : ''}">${money(total)}</span>${cap ? ` <span class="mono">of ${money(cap)}</span>` : ''}</span>
    <button type="button" class="btn" data-action="open-set">View set</button>`;
}

// Drag a piece onto the "Your set" tab or the bottom bar (desktop).
document.addEventListener('dragstart', (e) => {
  const el = e.target.closest('[data-piece]');
  if (!el) return;
  e.dataTransfer.setData('text/plain', el.dataset.piece);
  e.dataTransfer.effectAllowed = 'copy';
});
function dropTarget(e) { return e.target.closest?.('#tray, [data-tab="final"]'); }
document.addEventListener('dragover', (e) => { const t = dropTarget(e); if (t) { e.preventDefault(); t.classList.add('is-drop'); } });
document.addEventListener('dragleave', (e) => { const t = dropTarget(e); if (t) t.classList.remove('is-drop'); });
document.addEventListener('drop', (e) => {
  const t = dropTarget(e); if (!t) return;
  e.preventDefault(); t.classList.remove('is-drop');
  const key = e.dataTransfer.getData('text/plain');
  if (key) addToSet(key);
});

// ---------- results ----------
function renderResults() {
  const plan = state.plan;
  const w = state.weather;
  const q = state.quiz;
  const weatherFact = w && !w.error
    ? `<div class="fact"><span class="eyebrow">${w.kind === 'forecast' ? 'Forecast' : 'Typical for this week'}</span><b>${w.highF}° / ${w.lowF}°F${w.precipChance != null ? ` · ${w.precipChance}% rain` : ''}</b><span class="hint">${esc([w.condition, w.sunset ? `sunset ${w.sunset}` : '', `${w.place.name}${w.place.region ? ', ' + w.place.region : ''}`].filter(Boolean).join(' · '))}</span></div>`
    : w?.error ? `<div class="fact"><span class="eyebrow">Weather</span><span class="hint">${esc(w.message || 'Not available')}</span></div>` : '';
  const tabs = [...plan.looks.map((l) => [l.id, l.name]), ['final', `Your set (${Object.keys(state.finalSet).length})`]];
  $app.innerHTML = `
    <section class="results-head">
      <span class="eyebrow">${esc([q.styles.join(' + '), q.setting === 'indoor' ? 'Indoors' : q.setting === 'studio' ? 'Studio' : 'Outdoors', q.timeOfDay].filter(Boolean).join(' · '))}${state.demo ? ' · sample plan' : ''}</span>
      <h1>Three ways to dress your crew</h1>
      <p class="lede">${esc(plan.summary)}</p>
      <div class="palette" aria-label="Palette">${plan.palette.map((c) => `<span style="background:${c.hex};color:${textOn(c.hex)}">${esc(c.name)}</span>`).join('')}</div>
      <div class="facts">${weatherFact}
        ${plan.weather_note ? `<div class="fact" style="max-width:52ch"><span class="eyebrow">Why these pieces</span><span>${esc(plan.weather_note)}</span></div>` : ''}</div>
      <div><button type="button" class="btn btn--ghost" data-action="edit">Change answers</button></div>
    </section>
    <nav class="tabs" role="tablist">${tabs.map(([id, name]) => `<button type="button" class="tab" role="tab" data-tab="${id}" aria-selected="${state.tab === id}">${esc(name)}</button>`).join('')}</nav>
    ${state.tab === 'final' ? finalBoard() : lookBoard(plan.looks.find((l) => l.id === state.tab) || plan.looks[0])}`;
  renderTray();
}

function textOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#1e2a2c' : '#ffffff';
}

function groupByPerson(entries) {
  return state.family.map((p) => ({
    person: p,
    entries: entries.filter((e) => e.item.personId === p.id)
      .sort((a, b) => SLOT_ORDER.indexOf(a.item.slot) - SLOT_ORDER.indexOf(b.item.slot)),
  })).filter((g) => g.entries.length);
}

function lane(person, inner) {
  return `<div class="lane"><div class="lane__who"><h3>${esc(personLabel(person))}</h3><span>${esc(personFacts(person))}</span></div>
    <div class="lane__items">${inner}</div></div>`;
}

function lookBoard(look) {
  const entries = look.items.map((item, i) => ({ item, key: itemKey(look.id, i) }));
  return `<section class="board" aria-label="${esc(look.name)}">
    <div class="board__head"><div><h2>${esc(look.name)}</h2><p>${esc(look.vibe)}</p></div>
      <button type="button" class="btn btn--primary" data-action="add-look" data-look="${look.id}">Use this whole look</button></div>
    ${groupByPerson(entries).map((g) => lane(g.person, g.entries.map((e) => pieceHtml(e.key)).join(''))).join('')}
    <p class="piece__meta">Tap “Add to set” to mix pieces from different looks. On a computer you can also drag a piece onto “Your set”.</p>
  </section>`;
}

function ownedPhoto(item) {
  return state.photos.owned.find((o) => o.id === item.ownedId);
}

function pieceHtml(key) {
  const item = findItem(key);
  if (!item) return '';
  const inSet = state.finalSet[setSlotKey(item)]?.key === key;
  if (item.ownedId) {
    const o = ownedPhoto(item);
    return `<article class="piece piece--owned" data-piece="${key}" draggable="true">
      <div class="piece__photo">${o ? `<img src="${o.dataUrl}" alt="${esc(o.label || item.description)}">` : placeholder(item, 'Your piece')}<span class="tag">You own</span>${inSet ? '<span class="tag tag--in" style="left:auto;right:4px">In set</span>' : ''}</div>
      <span class="piece__slot">${SLOT_LABEL[item.slot]}</span>
      <span class="piece__title">${esc(o?.label || item.description)}</span>
      <div class="piece__actions"><button type="button" class="btn" data-action="add-set" data-key="${key}">${inSet ? 'In your set' : 'Add to set'}</button></div>
    </article>`;
  }
  const st = state.products[key] || { status: 'loading' };
  const prod = currentProduct(key);
  let photo; let body;
  if (prod) {
    photo = `<img src="${esc(prod.image)}" alt="${esc(prod.title)}" loading="lazy" referrerpolicy="no-referrer">`;
    body = `<span class="piece__title">${esc(prod.title)}</span>
      <span class="piece__meta"><b>${money(prod.price)}</b> · ${esc(prod.merchant)}</span>
      <div class="piece__actions">
        <button type="button" class="btn" data-action="add-set" data-key="${key}">${inSet ? 'In your set' : 'Add to set'}</button>
        ${st.list.length > 1 ? `<button type="button" class="btn" data-action="swap" data-key="${key}" aria-label="Show another option">Swap</button>` : ''}
        <a class="btn" href="${esc(prod.url)}" target="_blank" rel="sponsored noopener">Shop</a>
      </div>`;
  } else {
    const msg = st.status === 'loading' ? 'Finding it…'
      : st.status === 'empty' ? `Nothing in stock${item.maxPrice ? ` under ${money(item.maxPrice)}` : ''} right now`
        : st.message || 'Could not load';
    photo = placeholder(item, msg);
    body = `<span class="piece__title">${esc(item.description)}</span>
      ${item.maxPrice ? `<span class="piece__meta">up to <b>${money(item.maxPrice)}</b></span>` : ''}
      ${st.status === 'error' || st.status === 'empty' ? `<div class="piece__actions"><button type="button" class="btn" data-action="retry" data-key="${key}">Try again</button></div>` : ''}`;
  }
  return `<article class="piece ${st.status === 'loading' ? 'loading' : ''}" data-piece="${key}" draggable="${prod ? 'true' : 'false'}">
    <div class="piece__photo">${photo}${inSet ? '<span class="tag tag--in">In set</span>' : ''}</div>
    <span class="piece__slot">${SLOT_LABEL[item.slot]} · ${esc(item.colorName)}</span>
    ${body}
  </article>`;
}

function placeholder(item, msg) {
  return `<div class="placeholder"><div><i style="background:${item.colorHex}"></i>${esc(msg)}</div></div>`;
}

function finalBoard() {
  const entries = Object.values(state.finalSet);
  const cap = budgetCap(); const total = setTotal();
  if (!entries.length) {
    return `<section class="board"><div class="board__head"><h2>Your set</h2></div>
      <p class="empty-set">Nothing here yet. Open a look and tap “Use this whole look”, or add single pieces from any look to build your own mix.</p></section>`;
  }
  const pieces = (list) => list.map((entry) => {
    const { item } = entry; const product = setProduct(entry);
    const slotKey = setSlotKey(item);
    if (item.ownedId) {
      const o = ownedPhoto(item);
      return `<article class="piece piece--owned"><div class="piece__photo">${o ? `<img src="${o.dataUrl}" alt="${esc(o.label)}">` : ''}<span class="tag">You own</span></div>
        <span class="piece__slot">${SLOT_LABEL[item.slot]}</span><span class="piece__title">${esc(o?.label || item.description)}</span>
        <div class="piece__actions"><button type="button" class="btn" data-action="remove-set" data-slot="${slotKey}">Remove</button></div></article>`;
    }
    return `<article class="piece"><div class="piece__photo">${product ? `<img src="${esc(product.image)}" alt="${esc(product.title)}" referrerpolicy="no-referrer">` : placeholder(item, item.description)}</div>
      <span class="piece__slot">${SLOT_LABEL[item.slot]} · ${esc(item.colorName)}</span>
      <span class="piece__title">${esc(product?.title || item.description)}</span>
      ${product ? `<span class="piece__meta"><b>${money(product.price)}</b> · ${esc(product.merchant)}</span>` : ''}
      <div class="piece__actions">
        ${product ? `<a class="btn btn--primary" href="${esc(product.url)}" target="_blank" rel="sponsored noopener">Shop</a>` : ''}
        <button type="button" class="btn" data-action="remove-set" data-slot="${slotKey}">Remove</button></div></article>`;
  }).join('');
  const missing = state.family.filter((p) => !entries.some((e) => e.item.personId === p.id));
  return `<section class="board" aria-label="Your set">
    <div class="board__head"><div><h2>Your set</h2><p>Your mix, laid out together. Shop each piece from its store.</p></div></div>
    ${groupByPerson(entries).map((g) => lane(g.person, pieces(g.entries))).join('')}
    ${missing.length ? `<p class="piece__meta">Still needs an outfit: ${missing.map((p) => esc(personLabel(p))).join(', ')}</p>` : ''}
    <div class="totals"><span class="eyebrow">Total</span><b class="${cap && total > cap ? 'over' : ''}">${money(total)}</b>
      ${cap ? `<span class="piece__meta">${total > cap ? `${money(total - cap)} over` : `${money(cap - total)} under`} your ${money(cap)} budget</span>` : ''}</div>
  </section>`;
}

// ---------- sample plan (before the AI key is set up) ----------
function runSample() {
  const fam = state.family;
  const kid = fam.find((p) => (ageYears(p) ?? 30) < 13) || fam[0];
  const pick = (rel, fallback) => fam.find((p) => p.relation === rel) || fallback;
  const mom = pick('Mom', fam[0]); const dad = pick('Dad', fam[1] || fam[0]);
  const item = (person, slot, description, colorName, colorHex) => ({ personId: person.id, slot, description, colorName, colorHex, query: description, maxPrice: 60, ownedId: null });
  state.plan = {
    palette: [{ name: 'Oatmeal', hex: '#D9CBB3' }, { name: 'Rust', hex: '#A4532F' }, { name: 'Sage', hex: '#A3B49A' }, { name: 'Cream', hex: '#F1EBDD' }, { name: 'Camel', hex: '#B98B5A' }],
    summary: 'Sample plan so you can try the layout. Warm neutrals with rust and sage, mixing knits and soft textures.',
    weather_note: 'Sample: layers for a cool autumn evening outdoors.',
    looks: ['Harvest Knits', 'Golden Field', 'Hearthside'].map((name, li) => ({
      id: `look${li + 1}`, name, vibe: 'Sample look to preview the collage and final-set tools.',
      items: [
        item(mom, 'dress', 'Long-sleeve rust midi dress', 'Rust', '#A4532F'),
        item(mom, 'shoes', 'Cognac leather ankle boots', 'Camel', '#B98B5A'),
        item(dad, 'top', "Men's oatmeal crewneck sweater", 'Oatmeal', '#D9CBB3'),
        item(dad, 'bottom', "Men's dark khaki chinos", 'Camel', '#B98B5A'),
        item(kid, 'top', 'Kids sage cable knit sweater', 'Sage', '#A3B49A'),
        item(kid, 'bottom', 'Kids cream corduroy pants', 'Cream', '#F1EBDD'),
      ].filter((it, i, arr) => arr.findIndex((x) => x.personId === it.personId && x.slot === it.slot) === i),
    })),
  };
  state.weather = null; state.products = {}; state.finalSet = {}; state.demo = true;
  state.view = 'results'; state.tab = 'look1';
  renderResults(); loadAllProducts(); window.scrollTo(0, 0);
}

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
