// Product search through Channel3: real product photos, live prices, and
// buy links that already carry affiliate tracking.

import { fetchJson } from './http.js';

const ENDPOINT = 'https://api.trychannel3.com/v1/search';

// Shot types that read well in a flat lay (product on its own) vs. on a model.
const FLAT = /(flat|still|product|packshot|ghost|front|back|detail|main|primary)/i;
const WORN = /(model|lifestyle|worn|on[-_ ]?body|scene|editorial)/i;

export function mapGender(g) {
  const v = String(g || '').toLowerCase();
  if (['girl', 'woman', 'female', 'mom', 'mother', 'daughter'].includes(v)) return 'female';
  if (['boy', 'man', 'male', 'dad', 'father', 'son'].includes(v)) return 'male';
  return 'unisex';
}

// Age in years (decimals allowed for babies) -> Channel3 age group.
export function mapAge(years) {
  const a = Number(years);
  if (!Number.isFinite(a)) return 'adult';
  if (a < 0.25) return 'newborn';
  if (a < 1) return 'infant';
  if (a < 4) return 'toddler';
  if (a < 13) return 'kids';
  return 'adult';
}

function imageUrl(img) {
  if (!img) return null;
  if (typeof img === 'string') return img;
  return img.url || img.src || img.image_url || null;
}

export function pickImage(images) {
  const list = (images || []).map((img) => ({
    url: imageUrl(img),
    shot: typeof img === 'object' ? String(img.shot_type || img.type || '') : '',
  })).filter((i) => i.url && /^https:\/\//.test(i.url));
  if (!list.length) return null;
  const flat = list.find((i) => FLAT.test(i.shot) && !WORN.test(i.shot));
  const notWorn = list.find((i) => !WORN.test(i.shot));
  return (flat || notWorn || list[0]).url;
}

function offerPrice(o) {
  const p = o?.price;
  if (p == null) return null;
  if (typeof p === 'number') return { amount: p, currency: o.currency || 'USD' };
  const amount = Number(p.price ?? p.amount ?? p.value);
  if (!Number.isFinite(amount)) return null;
  return { amount, currency: p.currency || 'USD' };
}

const IN_STOCK = new Set(['InStock', 'LimitedAvailability', 'in_stock', 'instock']);

// Turn one Channel3 product into the flat shape the app uses, choosing the
// cheapest in-stock offer that fits the budget.
export function normalizeProduct(p, maxPrice) {
  const image = pickImage(p.images || (p.image_url ? [p.image_url] : []));
  if (!image) return null;
  const offers = (p.offers || [])
    .map((o) => ({ o, price: offerPrice(o) }))
    .filter(({ o, price }) => o.url && price && (!o.availability || IN_STOCK.has(o.availability)))
    .filter(({ price }) => !maxPrice || price.amount <= maxPrice)
    .sort((a, b) => a.price.amount - b.price.amount);
  if (!offers.length) return null;
  const best = offers[0];
  const brand = Array.isArray(p.brands) ? (p.brands[0]?.name || p.brands[0]) : (p.brand_name || p.brand?.name || p.brand);
  return {
    id: p.id || best.o.url,
    title: p.title || 'Product',
    brand: typeof brand === 'string' ? brand : '',
    image,
    price: best.price.amount,
    currency: best.price.currency,
    merchant: (best.o.domain || hostOf(best.o.url)).replace(/^www\./, ''),
    url: best.o.url,
    otherOffers: offers.length - 1,
  };
}

function hostOf(u) { try { return new URL(u).hostname; } catch { return ''; } }

export function buildSearchBody({ query, maxPrice, gender, age, limit = 12 }) {
  const filters = {
    availability: ['InStock', 'LimitedAvailability'],
    gender: mapGender(gender),
    age: mapAge(age),
  };
  if (filters.gender === 'unisex') delete filters.gender;
  if (maxPrice) filters.price = { max_price: Number(maxPrice) };
  return { query: String(query).slice(0, 300), limit: Math.min(Math.max(limit, 1), 30), filters };
}

export async function searchProducts(apiKey, params) {
  const data = await fetchJson(ENDPOINT, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSearchBody(params)),
  });
  const seen = new Set();
  const out = [];
  for (const p of data?.products || []) {
    const n = normalizeProduct(p, params.maxPrice);
    if (!n || seen.has(n.image)) continue;
    seen.add(n.image);
    out.push(n);
    if (out.length >= 6) break;
  }
  return out;
}
