import { send, readJson, missingKey } from '../lib/http.js';
import { searchProducts } from '../lib/products.js';

// POST /api/products { query, maxPrice, gender, age }
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method', message: 'Use POST.' });
  const key = process.env.CHANNEL3_API_KEY;
  if (!key) return missingKey(res, 'CHANNEL3_API_KEY', 'real product photos and shop links');
  let body;
  try { body = await readJson(req); } catch { return send(res, 400, { error: 'bad_json' }); }
  if (!body.query) return send(res, 400, { error: 'query_required' });
  try {
    const products = await searchProducts(key, body);
    return send(res, 200, { products });
  } catch (e) {
    const status = e.status === 401 || e.status === 403 ? 502 : 502;
    return send(res, status, {
      error: 'search_failed',
      message: e.status === 401 || e.status === 403
        ? 'The product API rejected the key. Check CHANNEL3_API_KEY.'
        : 'Product search is unavailable right now.',
    });
  }
}
