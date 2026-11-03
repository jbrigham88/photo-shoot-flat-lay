import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickPlace, daysBetween, summarizeForecast, summarizeHistory } from '../lib/weather.js';
import { mapAge, mapGender, pickImage, normalizeProduct, buildSearchBody } from '../lib/products.js';
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
  assert.equal(mapAge(0.1), 'newborn');
  assert.equal(mapAge(0.75), 'infant');
  assert.equal(mapAge(2), 'toddler');
  assert.equal(mapAge(8), 'kids');
  assert.equal(mapAge(35), 'adult');
  assert.equal(mapGender('girl'), 'female');
  assert.equal(mapGender(''), 'unisex');
  const body = buildSearchBody({ query: 'sage sweater', maxPrice: 40, gender: '', age: 6 });
  assert.equal(body.filters.gender, undefined);
  assert.equal(body.filters.age, 'kids');
  assert.equal(body.filters.price.max_price, 40);
});

test('product shots beat model shots for the flat lay', () => {
  const url = pickImage([
    { url: 'https://x/model.jpg', shot_type: 'on_model' },
    { url: 'https://x/flat.jpg', shot_type: 'flat_lay' },
  ]);
  assert.equal(url, 'https://x/flat.jpg');
  assert.equal(pickImage(['https://x/a.jpg']), 'https://x/a.jpg');
});

test('normalizeProduct picks the cheapest in-stock offer within budget', () => {
  const p = normalizeProduct({
    id: 'p1', title: 'Knit dress', brands: [{ name: 'Acme' }],
    images: [{ url: 'https://x/d.jpg', shot_type: 'product' }],
    offers: [
      { url: 'https://buy/1', domain: 'www.a.com', price: { price: 80, currency: 'USD' }, availability: 'InStock' },
      { url: 'https://buy/2', domain: 'b.com', price: { price: 35, currency: 'USD' }, availability: 'InStock' },
      { url: 'https://buy/3', domain: 'c.com', price: { price: 20, currency: 'USD' }, availability: 'OutOfStock' },
    ],
  }, 50);
  assert.equal(p.price, 35);
  assert.equal(p.url, 'https://buy/2');
  assert.equal(p.brand, 'Acme');
  assert.equal(normalizeProduct({ images: ['https://x/a.jpg'], offers: [{ url: 'u', price: 90 }] }, 50), null);
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
test('product search falls back to simpler filters when rejected', async () => {
  const sent = [];
  const fetcher = async (url, opts) => {
    const body = JSON.parse(opts.body); sent.push(body);
    if (body.filters?.age) { const e = new Error('422'); e.status = 422; e.data = { detail: [{ msg: 'bad age' }] }; throw e; }
    return { products: [{ id: 'a', title: 'T', images: ['https://x/a.jpg'], offers: [{ url: 'https://buy', price: { price: 10 } }] }] };
  };
  const out = await searchProducts('k', { query: 'sweater', maxPrice: 20, age: 5 }, fetcher);
  assert.equal(out.length, 1);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[1].filters, { price: { max_price: 20 } });
});
test('product errors say what to fix', () => {
  assert.match(explainProductError({ status: 401 }), /rejected the key/);
  assert.match(explainProductError({ status: 422, data: { detail: [{ msg: 'field required' }] } }), /422: field required/);
});
