import { json, readJson, missingKey } from '../../lib/http.js';
import { locateItem } from '../../lib/cutout.js';
import { explainStylistError } from '../../lib/anthropic.js';

// POST /api/locate { image: dataURL, width, height, label } -> { found, box:[x1,y1,x2,y2] }
export async function onRequestPost({ request, env }) {
  if (!env.ANTHROPIC_API_KEY) return missingKey('ANTHROPIC_API_KEY', 'the AI stylist');
  const body = await readJson(request);
  if (!body?.image) return json(400, { error: 'image_required' });
  try {
    return json(200, await locateItem(env.ANTHROPIC_API_KEY, body, env.ANTHROPIC_CURATE_MODEL || env.ANTHROPIC_MODEL));
  } catch (e) {
    console.error('locate_failed', e?.status || '', JSON.stringify(e?.data || {}).slice(0, 300));
    return json(502, { error: 'locate_failed', message: explainStylistError(e) });
  }
}
