// Pull one clothing item out of an uploaded photo or screenshot:
// Claude finds where the item is, the browser crops to it, and Cloudflare
// Images removes the background.

import { callClaude, parseJsonReply } from './anthropic.js';

const LOCATE_SYSTEM = `You find one clothing item in a photo or screenshot so it can be cut out for a flat lay.
Return the tightest box around the whole garment named by the client (or the most prominent garment if none is named), in pixel coordinates of the image as given: x1,y1 top-left and x2,y2 bottom-right. Exclude text, buttons, prices, other products and people's faces. If a person is wearing it, box the garment on the body.
Return ONLY JSON: {"box":[x1,y1,x2,y2],"label":"short plain name of the garment","found":true}. If there is no garment, {"found":false}.`;

export function clampBox(box, width, height) {
  if (!Array.isArray(box) || box.length !== 4 || box.some((n) => !Number.isFinite(Number(n)))) return null;
  let [x1, y1, x2, y2] = box.map(Number);
  if (x2 < x1) [x1, x2] = [x2, x1];
  if (y2 < y1) [y1, y2] = [y2, y1];
  x1 = Math.max(0, Math.min(width, x1)); x2 = Math.max(0, Math.min(width, x2));
  y1 = Math.max(0, Math.min(height, y1)); y2 = Math.max(0, Math.min(height, y2));
  if (x2 - x1 < width * 0.05 || y2 - y1 < height * 0.05) return null;
  return [Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2)];
}

export async function locateItem(apiKey, { image, width, height, label }, model) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(image || '');
  if (!m) throw Object.assign(new Error('Send the photo as a data URL.'), { status: 400 });
  const text = await callClaude(apiKey, {
    model,
    max_tokens: 300,
    system: LOCATE_SYSTEM,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
      { type: 'text', text: `Image size: ${width}x${height} pixels. Garment: ${label || 'the main clothing item'}.` },
    ] }],
  }, 60000);
  const r = parseJsonReply(text);
  if (r.found === false) return { found: false };
  const box = clampBox(r.box, Number(width), Number(height));
  return box ? { found: true, box, label: String(r.label || label || '') } : { found: false };
}
