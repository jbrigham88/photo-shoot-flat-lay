import { json, readJson, missingKey } from '../../lib/http.js';
import { rewriteItem } from '../../lib/curate.js';
import { explainStylistError } from '../../lib/anthropic.js';

// POST /api/replace { item, reason, note, look, palette, others } -> a new plan for one piece
export async function onRequestPost({ request, env }) {
  if (!env.ANTHROPIC_API_KEY) return missingKey('ANTHROPIC_API_KEY', 'the AI stylist');
  const body = await readJson(request);
  if (!body?.item) return json(400, { error: 'item_required' });
  try {
    return json(200, await rewriteItem(env.ANTHROPIC_API_KEY, body, env.ANTHROPIC_CURATE_MODEL || env.ANTHROPIC_MODEL));
  } catch (e) {
    console.error('replace_failed', e?.status || '', e?.kind || e?.name || '', JSON.stringify(e?.data || {}).slice(0, 500));
    return json(502, { error: 'replace_failed', message: explainStylistError(e) });
  }
}
