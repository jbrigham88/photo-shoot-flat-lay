// Shared Claude API call and error messages.

import { fetchJson } from './http.js';

export const DEFAULT_MODEL = 'claude-sonnet-5-5';

// Returns the reply text. Throws with .kind = 'truncated' if the reply was cut off.
export async function callClaude(apiKey, { model, ...body }, timeoutMs = 120000) {
  const data = await fetchJson('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: model || DEFAULT_MODEL, ...body }),
  }, timeoutMs);
  if (data.stop_reason === 'max_tokens') {
    const err = new Error('The reply was cut off before it finished.');
    err.kind = 'truncated';
    throw err;
  }
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

// First {...} block in a reply, parsed.
export function parseJsonReply(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw Object.assign(new Error('No JSON in reply'), { kind: 'bad_format' });
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw Object.assign(new Error('Bad JSON in reply'), { kind: 'bad_format', sample: text.slice(0, 300) });
  }
}

// True when Anthropic couldn't fetch one of the image URLs we sent.
export function isImageFetchError(e) {
  const msg = String(e?.data?.error?.message || '');
  return e?.status === 400 && /image|url|download|fetch/i.test(msg);
}

// Turn an Anthropic API failure into a message the site owner can act on.
export function explainStylistError(e) {
  const apiMsg = String(e?.data?.error?.message || '');
  const type = e?.data?.error?.type || '';
  if (e?.kind === 'truncated') return 'The plan was too long and got cut off. Try again, or with fewer people.';
  if (e?.kind === 'bad_format') return 'The stylist replied in an unexpected format. Try again.';
  if (e?.name === 'AbortError') return 'The stylist took too long to answer. Try again.';
  if (/credit balance/i.test(apiMsg)) return 'The Anthropic account is out of credits. Add credits at console.anthropic.com → Settings → Billing.';
  if (e?.status === 401) return 'The Anthropic key was rejected. Check ANTHROPIC_API_KEY in Cloudflare.';
  if (e?.status === 403) return `The Anthropic key isn't allowed to do this: ${apiMsg || type}`;
  if (e?.status === 404 || /model/i.test(apiMsg)) return `The AI model wasn't found (${apiMsg || 'not_found'}). Set ANTHROPIC_MODEL in Cloudflare to a current model.`;
  if (e?.status === 413) return 'The photos are too large together. Try with fewer photos.';
  if (e?.status === 429) return 'Too many requests to the AI right now, or the account hit its spending limit. Wait a minute and try again.';
  if (e?.status === 529 || e?.status >= 500) return 'The AI service is busy right now. Try again in a minute.';
  if (e?.status === 400) return `The AI couldn't read the request: ${apiMsg || type}`;
  return `The stylist could not finish: ${e?.message || 'unknown error'}`;
}
