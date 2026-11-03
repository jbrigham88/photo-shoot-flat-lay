import { json, readJson, missingKey } from '../../lib/http.js';
import { searchProducts } from '../../lib/products.js';

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
    const rejected = e.status === 401 || e.status === 403;
    return json(502, {
      error: 'search_failed',
      message: rejected ? 'The product API rejected the key. Check CHANNEL3_API_KEY.' : 'Product search is unavailable right now.',
    });
  }
}
