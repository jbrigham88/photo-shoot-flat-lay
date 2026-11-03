import { send, readJson, missingKey } from '../lib/http.js';
import { planLooks } from '../lib/stylist.js';

export const config = { maxDuration: 120 };

// POST /api/stylist { quiz, family, weather, photos }
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method', message: 'Use POST.' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return missingKey(res, 'ANTHROPIC_API_KEY', 'the AI stylist');
  let body;
  try { body = await readJson(req); } catch { return send(res, 400, { error: 'bad_json' }); }
  if (!Array.isArray(body.family) || !body.family.length) {
    return send(res, 400, { error: 'family_required', message: 'Add at least one person.' });
  }
  try {
    const plan = await planLooks(key, body);
    if (!plan.looks.length) throw new Error('empty');
    return send(res, 200, plan);
  } catch (e) {
    return send(res, 502, {
      error: 'stylist_failed',
      message: e.status === 401 ? 'The AI key was rejected. Check ANTHROPIC_API_KEY.' : 'The stylist could not finish. Try again.',
    });
  }
}
