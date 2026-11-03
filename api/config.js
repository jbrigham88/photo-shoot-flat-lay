import { send } from '../lib/http.js';

// Tells the page which services are set up, so it can explain what's missing.
export default function handler(req, res) {
  return send(res, 200, {
    stylist: Boolean(process.env.ANTHROPIC_API_KEY),
    products: Boolean(process.env.CHANNEL3_API_KEY),
    // Optional catch-all: Skimlinks converts any other store link into an affiliate link.
    skimlinksId: process.env.SKIMLINKS_ID || null,
  });
}
