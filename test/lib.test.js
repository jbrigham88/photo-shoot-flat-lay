import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickPlace, daysBetween, summarizeForecast, summarizeHistory } from '../lib/weather.js';
import { ageGroups, mapGender, pickImage, normalizeProduct, buildSearchBody, rejectReason, collect } from '../lib/products.js';
import { personBudgets, buildMessages, parsePlan } from '../lib/stylist.js';

test('pickPlace prefers the state the user typed', () => {
  const results = [
    { name: 'Portland', admin1: 'Maine', country_code: 'US' },
    { name: 'Portland', admin1: 'Oregon', country_code: 'US' },
  ];
  assert.equal(pickPlace('Portland, OR', results).admin1, 'Oregon');
  assert.equal(pickPlace('Portland', results).admin1, 'Maine');
});

test('daysBetween counts calendar days', () => {
  assert.equal(daysBetween('2026-11-02', '2026-11-21'), 19);
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
});

test('forecast and typical summaries', () => {
  const f = summarizeForecast({ temperature_2m_max: [10], temperature_2m_min: [2], precipitation_probability_max: [40], weather_code: [3], sunset: ['2026-11-10T16:41'] }, 0);
  assert.deepEqual([f.highF, f.lowF, f.condition, f.sunset], [50, 36, 'Overcast', '16:41']);
  const h = summarizeHistory([
    { time: ['a', 'b'], temperature_2m_max: [10, 12], temperature_2m_min: [0, 2], precipitation_sum: [0, 3] },
    null,
  ]);
  assert.equal(h.kind, 'typical');
  assert.equal(h.highF, 52);
  assert.equal(h.precipChance, 50);
});

test('age and gender map to store departments', () => {
  assert.deepEqual(ageGroups(0.1), ['newborn', 'infant']);
  assert.deepEqual(ageGroups(2), ['toddler']);
  assert.deepEqual(ageGroups(4), ['toddler', 'kids']);
  assert.deepEqual(ageGroups(8), ['kids']);
  assert.deepEqual(ageGroups(35), ['adult']);
  assert.equal(mapGender('girl'), 'female');
  assert.equal(mapGender(''), null);
  const body = buildSearchBody({ query: 'sage sweater', maxPrice: 40, gender: '', age: 8 });
  assert.equal(body.filters.gender, undefined);
  assert.deepEqual(body.filters.age, ['kids']); // Channel3 wants a list
  assert.equal(body.filters.price.max_price, 40);
  assert.equal(body.filters.condition, 'new');
  assert.equal(body.config.currency, 'USD');
});

test('only background-removed product shots, never models', () => {
  const pick = pickImage([
    { url: 'https://x/model.jpg', cleaned_url: 'https://c/model.png', shot_type: 'on_model', is_main_image: true },
    { url: 'https://x/hero.jpg', cleaned_url: 'https://c/hero.png', shot_type: 'hero' },
  ]);
  assert.deepEqual(pick, { url: 'https://c/hero.png', cleaned: true });
  assert.equal(pickImage([{ url: 'https://x/m.jpg', shot_type: 'on_model' }, { url: 'https://x/l.jpg', shot_type: 'lifestyle' }]), null);
  assert.equal(pickImage([{ url: 'https://x/h.jpg', shot_type: 'hero' }]).url, 'https://x/h.jpg');
});

test('wrong department, accessories and multipacks are dropped', () => {
  const boy = { gender: 'boy', age: 7 };
  assert.equal(rejectReason({ title: "Women's Quilted Vest", gender: 'female', age: 'adult' }, boy), 'wrong gender');
  assert.equal(rejectReason({ title: "Women's Quilted Vest" }, boy), 'adult listing');
  assert.equal(rejectReason({ title: 'Quilted Vest', age: 'adult' }, boy), 'wrong age group');
  assert.equal(rejectReason({ title: 'Round Shoe Laces 3 Pairs' }, boy), 'not clothing for the shoot');
  assert.equal(rejectReason({ title: "Boys' Lace-Up Chelsea Boots" }, boy), null);
  assert.equal(rejectReason({ title: "Boys' Crew Tee 3-Pack" }, boy), 'multi-pack');
  assert.equal(rejectReason({ title: "Men's Flannel Shirt", gender: 'male', age: 'adult' }, { gender: 'man', age: 41 }), null);
  assert.equal(rejectReason({ title: "Girls' Corduroy Jumper" }, { gender: 'woman', age: 34 }), 'kids listing');
});

test('price shown is the price of the offer we link to', () => {
  const p = normalizeProduct({
    id: 'p1', title: 'Knit dress', brands: [{ id: 'b', name: 'Acme' }],
    images: [{ url: 'https://x/d.jpg', cleaned_url: 'https://c/d.png', shot_type: 'hero' }],
    offers: [
      { url: 'https://buy/1', domain: 'www.a.com', price: { price: 80, currency: 'USD', compare_at_price: 100 }, availability: 'InStock' },
      { url: 'https://buy/2', domain: 'b.com', price: { price: 35, currency: 'USD', compare_at_price: 50 }, availability: 'InStock' },
      { url: 'https://buy/3', domain: 'c.com', price: { price: 20, currency: 'USD' }, availability: 'OutOfStock' },
      { url: 'https://buy/4', domain: 'd.com', price: { price: 15, currency: 'USD' }, availability: 'InStock', condition: 'used' },
    ],
  }, 50);
  assert.equal(p.price, 35);
  assert.equal(p.compareAt, 50);
  assert.equal(p.url, 'https://buy/2');
  assert.equal(p.merchant, 'b.com');
  assert.equal(p.image, 'https://c/d.png');
  const none = normalizeProduct({ id: 'x', images: [{ url: 'https://x/a.jpg', shot_type: 'hero' }], offers: [{ url: 'u', price: { price: 90 }, availability: 'InStock' }] }, 50);
  assert.equal(none, null);
});

test('collect filters, dedupes and skips already-seen listings', () => {
  const mk = (id, title, extra = {}) => ({ id, title, images: [{ url: `https://x/${id}.jpg`, cleaned_url: `https://c/${id}.png`, shot_type: 'hero' }], offers: [{ url: `https://b/${id}`, price: { price: 20 }, availability: 'InStock' }], ...extra });
  const out = collect({ products: [mk('a', "Boys' Sweater"), mk('b', "Women's Sweater"), mk('c', "Boys' Cardigan"), mk('d', 'Shoelaces')] },
    { gender: 'boy', age: 7, maxPrice: 30, excludeIds: ['c'] });
  assert.deepEqual(out.map((p) => p.id), ['a']);
});

test('budgets split by person or across the family', () => {
  const fam = [{ id: 'a', age: 35 }, { id: 'b', age: 33 }, { id: 'c', age: 2 }];
  assert.deepEqual(personBudgets(fam, { amount: 60, per: 'person' }), { a: 60, b: 60, c: 60 });
  const f = personBudgets(fam, { amount: 250, per: 'family' });
  assert.equal(f.a, 100); assert.equal(f.c, 50);
});

test('stylist request includes people, weather and photos', () => {
  const tiny = 'data:image/jpeg;base64,' + 'A'.repeat(100);
  const { messages } = buildMessages({
    quiz: { styles: ['Classic'], setting: 'outdoor', location: 'Bend, OR', budget: { amount: 50, per: 'person' } },
    family: [{ id: 'p1', relation: 'Mom', age: 34, gender: 'woman', size: 'M' }],
    weather: { kind: 'forecast', highF: 48, lowF: 30, precipChance: 10 },
    photos: { inspiration: [tiny], owned: [{ id: 'o1', personId: 'p1', label: 'Cream dress', dataUrl: tiny }] },
  });
  const blocks = messages[0].content;
  assert.match(blocks[0].text, /id p1, Mom, 34 years old, woman, size M, budget about \$50/);
  assert.match(blocks[0].text, /high 48°F/);
  assert.equal(blocks.filter((b) => b.type === 'image').length, 2);
});

test('parsePlan cleans up the model output', () => {
  const raw = 'Here you go {"palette":[{"name":"Sage","hex":"#A3B49A"}],"summary":"s","weather_note":"w","looks":[{"name":"L","vibe":"v","items":[' +
    '{"person_id":"p1","slot":"dress","description":"d","color_name":"Sage","color_hex":"bad","search_query":"q","max_price":40.4,"owned_id":"o1"},' +
    '{"person_id":"nobody","slot":"top"},{"person_id":"p1","slot":"hat"}]}]}';
  const plan = parsePlan(raw, [{ id: 'p1' }], [{ id: 'o1' }]);
  assert.equal(plan.looks[0].items.length, 1);
  assert.equal(plan.looks[0].items[0].colorHex, '#cccccc');
  assert.equal(plan.looks[0].items[0].maxPrice, 40);
  assert.equal(plan.looks[0].items[0].ownedId, 'o1');
});

import { explainStylistError } from '../lib/stylist.js';
test('stylist errors say what to fix', () => {
  assert.match(explainStylistError({ status: 400, data: { error: { message: 'Your credit balance is too low to access the Anthropic API.' } } }), /out of credits/);
  assert.match(explainStylistError({ status: 404, data: { error: { type: 'not_found_error', message: 'model: claude-x' } } }), /model/);
  assert.match(explainStylistError({ status: 401 }), /rejected/);
  assert.match(explainStylistError({ kind: 'truncated' }), /cut off/);
});

import { searchProducts, explainProductError } from '../lib/products.js';
test('product search retries with lighter filters when rejected', async () => {
  const sent = [];
  const fetcher = async (url, opts) => {
    const body = JSON.parse(opts.body); sent.push(body);
    if (body.filters?.condition) { const e = new Error('422'); e.status = 422; e.data = { detail: [{ loc: ['body', 'filters', 'condition'], msg: 'bad' }] }; throw e; }
    return { products: [{ id: 'a', title: "Boys' Sweater", images: [{ url: 'https://x/a.jpg', shot_type: 'hero' }], offers: [{ url: 'https://buy', price: { price: 10 }, availability: 'InStock' }] }] };
  };
  const out = await searchProducts('k', { query: 'sweater', maxPrice: 20, age: 7, gender: 'boy' }, fetcher);
  assert.equal(out.length, 1);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[1].filters.age, ['kids']);
  assert.equal(sent[1].filters.gender, 'male');
});
test('product errors say what to fix', () => {
  assert.match(explainProductError({ status: 401 }), /rejected the key/);
  assert.match(explainProductError({ status: 422, data: { detail: [{ loc: ['body', 'filters', 'age'], msg: 'Input should be a valid list' }] } }), /422: filters.age: Input should be a valid list/);
});
