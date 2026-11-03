import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

const env = { ASSETS: { fetch: () => new Response('static') }, CHANNEL3_API_KEY: 'k' };

test('static files go to assets', async () => {
  const r = await worker.fetch(new Request('https://x/'), env);
  assert.equal(await r.text(), 'static');
});

test('config route reports keys', async () => {
  const r = await worker.fetch(new Request('https://x/api/config'), env);
  assert.deepEqual(await r.json(), { stylist: false, products: true, skimlinksId: null });
});

test('missing stylist key explains itself', async () => {
  const r = await worker.fetch(new Request('https://x/api/stylist', { method: 'POST', body: '{}' }), env);
  assert.equal(r.status, 501);
  assert.match((await r.json()).message, /ANTHROPIC_API_KEY/);
});

test('wrong method and unknown route', async () => {
  assert.equal((await worker.fetch(new Request('https://x/api/products'), env)).status, 405);
  assert.equal((await worker.fetch(new Request('https://x/api/nope'), env)).status, 404);
});
