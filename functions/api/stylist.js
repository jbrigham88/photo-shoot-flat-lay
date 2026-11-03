import { json, readJson, missingKey } from '../../lib/http.js';
import { planLooks, explainStylistError } from '../../lib/stylist.js';

// POST /api/stylist { quiz, family, weather, photos }
export async function onRequestPost({ request, env }) {
  if (!env.ANTHROPIC_API_KEY) return missingKey('ANTHROPIC_API_KEY', 'the AI stylist');
  const body = await readJson(request);
  if (!body) return json(400, { error: 'bad_json' });
  if (!Array.isArray(body.family) || !body.family.length) {
    return json(400, { error: 'family_required', message: 'Add at least one person.' });
  }
  try {
    const plan = await planLooks(env.ANTHROPIC_API_KEY, body, env.ANTHROPIC_MODEL);
    if (!plan.looks.length) throw new Error('empty');
    return json(200, plan);
  } catch (e) {
    // Shows up in Cloudflare → your Worker → Observability → Logs.
    console.error('stylist_failed', e?.status || '', e?.kind || e?.name || '', JSON.stringify(e?.data || {}).slice(0, 500), e?.sample || '');
    return json(502, { error: 'stylist_failed', message: explainStylistError(e) });
  }
}
