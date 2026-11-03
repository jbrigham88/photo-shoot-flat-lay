import { json, readJson, missingKey } from '../../lib/http.js';
import { planLooks } from '../../lib/stylist.js';

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
    return json(502, {
      error: 'stylist_failed',
      message: e.status === 401 ? 'The AI key was rejected. Check ANTHROPIC_API_KEY.' : 'The stylist could not finish. Try again.',
    });
  }
}
