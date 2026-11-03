import { json } from '../../lib/http.js';

// GET /api/config: tells the page which services are set up.
export function onRequestGet({ env }) {
  return json(200, {
    stylist: Boolean(env.ANTHROPIC_API_KEY),
    products: Boolean(env.CHANNEL3_API_KEY),
    // Optional catch-all: Skimlinks converts any other store link into an affiliate link.
    skimlinksId: env.SKIMLINKS_ID || null,
  });
}
