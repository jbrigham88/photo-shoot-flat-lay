// Product search through Channel3 (https://channel3.ai): real product photos,
// live prices, and tracked buy links. Field names follow Channel3's official
// SDK types (ProductDetail, ProductOffer, ProductImage, SearchFilters).

import { fetchJson } from './http.js';

const ENDPOINT = 'https://api.trychannel3.com/v1/search';
export const CANDIDATES_PER_ITEM = 5;
export const MAX_CANDIDATES = 8; // swap options

export function mapGender(g) {
  const v = String(g || '').toLowerCase();
  if (['girl', 'woman', 'female'].includes(v)) return 'female';
  if (['boy', 'man', 'male'].includes(v)) return 'male';
  return null;
}

// Age in years -> Channel3 age groups to search. Ages near a sizing boundary
// search both groups (a 4-year-old may wear 4T or kids' 4).
export function ageGroups(years) {
  const a = Number(years);
  if (!Number.isFinite(a)) return ['adult'];
  if (a < 0.25) return ['newborn', 'infant'];
  if (a < 1) return ['infant'];
  if (a < 3) return ['toddler'];
  if (a < 5.5) return ['toddler', 'kids'];
  if (a < 13) return ['kids'];
  if (a < 16) return ['kids', 'adult'];
  return ['adult'];
}

// Words that mean a listing isn't a wearable piece for the shoot.
const NOT_CLOTHING = /\b(shoe ?laces?|laces\b(?![- ]?up)|insoles?|socks?|tights|belts?|wallet|purse|handbag|tote|backpack|hat|beanie|cap|scarf|gloves?|mittens?|headband|hair ?(bow|clip|tie)s?|bows?\b(?=.*\b(clip|hair)\b)|necklace|earrings?|bracelet|jewelry|watch|sunglasses|keychain|charm|patch|costume|pajamas?|pyjamas?|sleepwear|nightgown|underwear|briefs|boxers|bra\b|swim(suit|wear)?|apron|cleaner|polish|shoe care|gift card|fabric|pattern|doll|toy)\b/i;
// Weather gear, not photo styling.
const FUNCTIONAL = /\b(puffer|puffy|parka|down (jacket|coat|vest)|quilted (jacket|coat)|ski|snow ?suit|snow (jacket|pants)|rain (jacket|coat)|raincoat|windbreaker|fleece|softshell|shell jacket|hoodie|hooded sweatshirt|sweatshirt|joggers?|sweatpants|track (pants|jacket)|athletic|performance)\b/i;
const MULTI_PACK = /\b(\d+\s*-?\s*(pk|pack|piece|pc)s?\b|pack of \d+|set of \d+|bundle|lot of)\b/i;
const ADULT_WORDS = /\b(women'?s|womens|men'?s|mens|ladies|adult|maternity|plus size)\b/i;
const KID_WORDS = /\b(girls?'?|boys?'?|kids?'?|children'?s|toddler|baby|infant|newborn|youth|little|big kids?)\b/i;
const WOMEN_WORDS = /\b(women'?s|womens|ladies|maternity|girls?'?)\b/i;
const MEN_WORDS = /\b(?<!wo)(men'?s|mens|boys?'?)\b/i;
// Shot types that show the piece on its own (good for a flat lay).
const PRODUCT_SHOTS = new Set(['hero', 'flat_lay', 'angle_view', 'detail']);
const PEOPLE_SHOTS = new Set(['on_model', 'lifestyle', 'in_use', 'scale_reference']);

// Background-removed shot of the piece itself, never a model or lifestyle photo.
export function pickImage(images) {
  const list = (images || []).filter((i) => i && typeof i === 'object' && /^https:\/\//.test(i.url || ''));
  const clean = (i) => (i.cleaned_url && /^https:\/\//.test(i.cleaned_url) ? i.cleaned_url : null);
  const rank = (i) => (i.shot_type === 'flat_lay' ? 0 : i.shot_type === 'hero' ? 1 : i.is_main_image ? 2 : 3);
  const productShots = list
    .filter((i) => PRODUCT_SHOTS.has(i.shot_type) || (!i.shot_type && i.is_main_image))
    .sort((a, b) => rank(a) - rank(b));
  for (const i of productShots) if (clean(i)) return { url: clean(i), cleaned: true };
  if (productShots[0]) return { url: productShots[0].url, cleaned: false };
  // No labeled shots at all: take a main image only if nothing says it shows people.
  const unlabeled = list.find((i) => !i.shot_type && !PEOPLE_SHOTS.has(i.shot_type));
  if (unlabeled) return { url: clean(unlabeled) || unlabeled.url, cleaned: Boolean(clean(unlabeled)) };
  return null;
}

// Why a listing doesn't fit this person, or null if it does.
export function rejectReason(p, person, slot) {
  const title = String(p.title || '');
  if (slot === 'legwear') {
    if (!/\btights\b/i.test(title)) return 'not tights';
  } else if (NOT_CLOTHING.test(title)) return 'not clothing for the shoot';
  if (FUNCTIONAL.test(title)) return 'weather gear or athletic wear';
  if (MULTI_PACK.test(title)) return 'multi-pack';
  const want = mapGender(person?.gender);
  if (want && p.gender && p.gender !== 'unisex' && p.gender !== want) return 'wrong gender';
  const groups = ageGroups(person?.age);
  if (p.age && !groups.includes(p.age)) return 'wrong age group';
  const isKid = !groups.includes('adult');
  const isAdultOnly = !groups.some((g) => g !== 'adult');
  if (isKid && ADULT_WORDS.test(title) && !KID_WORDS.test(title)) return 'adult listing';
  if (isAdultOnly && KID_WORDS.test(title) && !ADULT_WORDS.test(title)) return 'kids listing';
  if (want === 'male' && WOMEN_WORDS.test(title) && !MEN_WORDS.test(title)) return 'wrong gender';
  if (want === 'female' && MEN_WORDS.test(title) && !WOMEN_WORDS.test(title)) return 'wrong gender';
  return null;
}

// The offer we link to is the offer whose price we show: new, in stock, in
// budget, in USD. Among those, the lowest price; the link and price always match.
export function pickOffer(offers, maxPrice) {
  const ok = (offers || []).filter((o) => o?.url && o.price && Number.isFinite(Number(o.price.price))
    && (o.availability ? o.availability === 'InStock' : true)
    && (!o.condition || o.condition === 'new')
    && (!o.price.currency || o.price.currency === 'USD')
    && (!maxPrice || Number(o.price.price) <= Number(maxPrice)));
  ok.sort((a, b) => Number(a.price.price) - Number(b.price.price));
  return ok[0] || null;
}

function hostOf(u) { try { return new URL(u).hostname; } catch { return ''; } }

export function normalizeProduct(p, maxPrice) {
  const image = pickImage(p.images);
  if (!image) return null;
  const offer = pickOffer(p.offers, maxPrice);
  if (!offer) return null;
  const price = Math.round(Number(offer.price.price) * 100) / 100;
  const was = Number(offer.price.compare_at_price);
  return {
    id: p.id,
    title: String(p.title || 'Product'),
    brand: p.brands?.[0]?.name || '',
    image: image.url,
    cleaned: image.cleaned,
    price,
    compareAt: Number.isFinite(was) && was > price ? Math.round(was * 100) / 100 : null,
    merchant: (offer.domain || hostOf(offer.url)).replace(/^www\./, ''),
    url: offer.url,
    gender: p.gender || null,
    age: p.age || null,
  };
}

export function buildSearchBody({ query, maxPrice, gender, age, limit = 30 }) {
  const filters = {
    availability: ['InStock'],
    condition: 'new',
    age: ageGroups(age),
  };
  const g = mapGender(gender);
  if (g) filters.gender = g;
  if (maxPrice) filters.price = { max_price: Number(maxPrice) };
  return {
    query: String(query).slice(0, 300),
    limit: Math.min(Math.max(Number(limit) || 20, 1), 30),
    filters,
    config: { country: 'US', currency: 'USD' },
  };
}

// Simpler versions of the same search, tried in order if the API rejects one.
export function searchBodies(params) {
  const full = buildSearchBody(params);
  const lighter = { ...full, filters: { ...full.filters } };
  delete lighter.filters.condition;
  delete lighter.config;
  return [full, lighter];
}

export function collect(data, params) {
  const exclude = new Set(params.excludeIds || []);
  const person = { gender: params.gender, age: params.age };
  const seenImages = new Set();
  const out = [];
  for (const p of data?.products || []) {
    if (!p?.id || exclude.has(p.id) || rejectReason(p, person, params.slot)) continue;
    const n = normalizeProduct(p, params.maxPrice);
    if (!n || seenImages.has(n.image)) continue;
    seenImages.add(n.image);
    out.push(n);
    if (out.length >= Math.min(Number(params.max) || CANDIDATES_PER_ITEM, MAX_CANDIDATES)) break;
  }
  // Background-removed photos first: they sit best in the flat lay.
  return out.sort((a, b) => Number(b.cleaned) - Number(a.cleaned));
}

export async function searchProducts(apiKey, params, fetcher = fetchJson) {
  let lastErr = null;
  for (const body of searchBodies(params)) {
    try {
      const data = await fetcher(ENDPOINT, {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return collect(data, params);
    } catch (e) {
      lastErr = e;
      // Key, quota and server problems won't be fixed by a simpler search.
      if (!e.status || [401, 402, 403, 429].includes(e.status) || e.status >= 500) break;
    }
  }
  throw lastErr;
}

export function explainProductError(e) {
  const d = e?.data || {};
  const detail = Array.isArray(d.detail) ? d.detail.map((x) => `${(x.loc || []).slice(1).join('.')}: ${x.msg}`).join('; ') : d.detail;
  const apiMsg = String(detail || d.message || d.error?.message || d.error || d.raw || '').slice(0, 200);
  if (e?.name === 'AbortError') return 'The store search took too long. Try again.';
  if (e?.status === 401 || e?.status === 403) return 'Channel3 rejected the key. Check CHANNEL3_API_KEY in Cloudflare.';
  if (e?.status === 402) return 'Channel3 needs billing set up or the free searches are used up.';
  if (e?.status === 429) return 'Too many store searches at once. Try again in a moment.';
  if (e?.status >= 500) return 'Channel3 is having trouble right now. Try again in a minute.';
  if (e?.status) return `Channel3 error ${e.status}${apiMsg ? `: ${apiMsg}` : ''}`;
  return `Store search failed: ${e?.message || 'unknown error'}`;
}
