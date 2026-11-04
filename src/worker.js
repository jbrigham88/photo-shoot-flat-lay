// Cloudflare Worker entry: serves the app from public/ and routes /api/* here.
import * as config from '../functions/api/config.js';
import * as weather from '../functions/api/weather.js';
import * as stylist from '../functions/api/stylist.js';
import * as products from '../functions/api/products.js';
import * as curate from '../functions/api/curate.js';
import * as replace from '../functions/api/replace.js';
import * as locate from '../functions/api/locate.js';
import * as cutout from '../functions/api/cutout.js';
import { json } from '../lib/http.js';

const routes = { config, weather, stylist, products, curate, replace, locate, cutout };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const m = /^\/api\/([a-z]+)\/?$/.exec(url.pathname);
    if (m) {
      const mod = routes[m[1]];
      if (!mod) return json(404, { error: 'not_found' });
      const handler = request.method === 'POST' ? mod.onRequestPost : request.method === 'GET' ? mod.onRequestGet : null;
      if (!handler) return json(405, { error: 'method', message: `Use ${mod.onRequestPost ? 'POST' : 'GET'}.` });
      return handler({ request, env, ctx });
    }
    // Everything else is a static file (index.html, app.js, styles.css).
    return env.ASSETS.fetch(request);
  },
};
