import { json } from '../../lib/http.js';

// POST /api/cutout  (body: the cropped image bytes) -> PNG with the background removed.
// Uses Cloudflare Images (the IMAGES binding in wrangler.toml), background removal "segment".
export async function onRequestPost({ request, env }) {
  if (!env.IMAGES) return json(501, { error: 'no_images_binding', message: 'Background removal is not set up (IMAGES binding missing).' });
  const type = request.headers.get('content-type') || '';
  if (!/^image\/(jpeg|png|webp)/.test(type)) return json(415, { error: 'bad_type', message: 'Send a JPEG, PNG or WebP image.' });
  const size = Number(request.headers.get('content-length') || 0);
  if (size > 6_000_000) return json(413, { error: 'too_large', message: 'That photo is too large.' });
  try {
    const result = await env.IMAGES.input(request.body)
      .transform({ segment: 'foreground' })
      .output({ format: 'image/png' });
    const res = result.response();
    return new Response(res.body, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('cutout_failed', String(e?.message || e).slice(0, 300));
    return json(502, { error: 'cutout_failed', message: 'Background removal is unavailable right now.' });
  }
}
