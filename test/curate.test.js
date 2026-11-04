import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCurateContent, parseCuration } from '../lib/curate.js';
import { SLOTS, parsePlan } from '../lib/stylist.js';

const items = [
  { key: 'look1-0', who: 'Dad, 41, man', slot: 'top', description: 'plaid flannel', maxPrice: 40,
    candidates: [{ id: 'a', title: "Men's Flannel", price: 30, merchant: 'x.com', image: 'https://c/a.png' }, { id: 'b', title: "Men's Plaid", price: 35, merchant: 'y.com', image: 'https://c/b.png' }] },
  { key: 'look1-1', who: 'Boy, 7, boy', slot: 'outerwear', description: 'quilted vest', maxPrice: 30, candidates: [] },
];

test('curation shows every candidate photo with its id', () => {
  const content = buildCurateContent({ look: { name: 'Harvest' }, palette: [{ name: 'Rust', hex: '#A4532F' }], items, fixed: [{ who: 'Mom', slot: 'dress', title: 'Knit dress', image: 'https://c/m.png' }] });
  const images = content.filter((b) => b.type === 'image').map((b) => b.source.url);
  assert.deepEqual(images, ['https://c/m.png', 'https://c/a.png', 'https://c/b.png']);
  assert.ok(content.some((b) => b.type === 'text' && /Listing id=a/.test(b.text)));
  const textOnly = buildCurateContent({ items }, false);
  assert.equal(textOnly.filter((b) => b.type === 'image').length, 0);
});

test('curation keeps valid picks and asks for new searches', () => {
  const r = parseCuration({ together: 'Warm and cohesive.', choices: [
    { key: 'look1-0', pick: 'b', why: 'better plaid' },
    { key: 'look1-1', pick: null, new_query: "boys' navy quilted vest", max_price: 28 },
    { key: 'nope', pick: 'z' },
  ] }, items);
  assert.equal(r.choices.find((c) => c.key === 'look1-0').pick, 'b');
  const vest = r.choices.find((c) => c.key === 'look1-1');
  assert.equal(vest.pick, null);
  assert.equal(vest.newQuery, "boys' navy quilted vest");
  assert.equal(vest.maxPrice, 28);
  // A made-up id is not accepted.
  assert.equal(parseCuration({ choices: [{ key: 'look1-0', pick: 'zzz' }] }, items).choices[0].pick, null);
});

test('plans never include accessories', () => {
  assert.ok(!SLOTS.includes('accessory'));
  const plan = parsePlan(JSON.stringify({ looks: [{ items: [
    { person_id: 'p1', slot: 'accessory', description: 'bow' },
    { person_id: 'p1', slot: 'top', description: 'a' },
    { person_id: 'p1', slot: 'top', description: 'duplicate' },
  ] }] }), [{ id: 'p1' }]);
  assert.deepEqual(plan.looks[0].items.map((i) => i.description), ['a']);
});
