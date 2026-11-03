import { json, readJson, missingKey } from '../../lib/http.js';
import { searchProducts, explainProductError } from '../../lib/products.js';

// POST /api/products { query, maxPrice, gender, age }
export async function onRequestPost({ request, env }) {
  if (!env.CHANNEL3_API_KEY) return missingKey('CHANNEL3_API_KEY', 'real product photos and shop links');
  const body = await readJson(request);
  if (!body) return json(400, { error: 'bad_json' });
  if (!body.query) return json(400, { error: 'query_required' });
  try {
    const products = await searchProducts(env.CHANNEL3_API_KEY, body);
    return json(200, { products });
  } catch (e) {
    // Shows up in Cloudflare → your Worker → Observability → Logs.
    console.error('search_failed', e?.status || '', e?.name || '', JSON.stringify(e?.data || {}).slice(0, 500));
    return json(502, { error: 'search_failed', message: explainProductError(e) });
  }
}
