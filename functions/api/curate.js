import { json, readJson, missingKey } from '../../lib/http.js';
import { curateLook } from '../../lib/curate.js';
import { explainStylistError } from '../../lib/anthropic.js';

// POST /api/curate { look, palette, context, items:[{key, who, slot, description, colorName, maxPrice, candidates}], fixed }
export async function onRequestPost({ request, env }) {
  if (!env.ANTHROPIC_API_KEY) return missingKey('ANTHROPIC_API_KEY', 'the AI stylist');
  const body = await readJson(request);
  if (!body || !Array.isArray(body.items) || !body.items.length) return json(400, { error: 'items_required' });
  try {
    const result = await curateLook(env.ANTHROPIC_API_KEY, body, env.ANTHROPIC_CURATE_MODEL || env.ANTHROPIC_MODEL);
    return json(200, result);
  } catch (e) {
    console.error('curate_failed', e?.status || '', e?.kind || e?.name || '', JSON.stringify(e?.data || {}).slice(0, 500));
    return json(502, { error: 'curate_failed', message: explainStylistError(e) });
  }
}
