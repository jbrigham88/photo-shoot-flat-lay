// The behind-the-scenes edit: before a look is shown, Claude looks at the
// actual product photos for every piece and picks the set that works together,
// sending back a better search for anything that doesn't pass.

import { callClaude, parseJsonReply, isImageFetchError } from './anthropic.js';

const MAX_IMAGES = 90;
const SLOTS = new Set(['outerwear', 'top', 'dress', 'bottom', 'shoes']);

const CURATE_SYSTEM = `You are the senior stylist doing the final edit on a family photo shoot outfit plan before the client sees it.
For each piece you see up to four real store listings, each with its product photo. Pick the one listing per piece that makes the whole family look best laid out together in one flat lay. Judge the set as a whole, not piece by piece.
Reject a listing if any of these is true:
- The photo shows a person, a mannequin or a lifestyle scene instead of the piece on its own.
- It is for the wrong person: adult clothing for a child, women's for a man or boy, men's for a woman or girl, baby sizes for an older child.
- It is not the garment asked for (e.g. a vest when a sweater was asked for, shoelaces or socks instead of shoes) or it is an accessory.
- Its colors fight the palette or the other pieces: neon, high-contrast trim, a clashing accent color, logos, text, cartoon or novelty prints, glitter.
- It looks cheap, costume-like, or off in style next to the rest (wrong formality, a different season).
- The price looks wrong for what it is (a multi-pack, a single piece of a set).
If no listing for a piece passes, set "pick" to null and write a better "new_query" for a store search: 4 to 10 words with color, material, garment and department ("women's", "men's", "girls'", "boys'", "toddler girl", "baby boy"), no brands or sizes. Keep "max_price" at or under the given limit.
Return ONLY JSON: {"together":"one sentence on how the chosen set reads as a whole","choices":[{"key":"…","pick":"listing id or null","why":"short reason","new_query":"only when pick is null","max_price":number}]}`;

const REWRITE_SYSTEM = `You are a family photo shoot stylist. The client removed one piece from a planned look and told you why. Plan a replacement for that one piece that fixes their concern and still works with the rest of the family's outfits and the palette.
Only these garment types are allowed: outerwear, top, dress, bottom, shoes. No accessories.
search_query: 4 to 10 words with color, material, garment and department ("women's", "men's", "girls'", "boys'", "toddler girl", "baby boy"), no brands or sizes. It must be meaningfully different from the removed piece.
If the concern is price, lower max_price; otherwise keep it at or under the original limit unless the client asked for nicer pieces.
Return ONLY JSON: {"description":"plain words","color_name":"…","color_hex":"#RRGGBB","search_query":"…","max_price":number}`;

const urlImage = (url) => ({ type: 'image', source: { type: 'url', url } });

export function buildCurateContent(input, withImages = true) {
  const { look = {}, palette = [], context = {}, items = [], fixed = [] } = input;
  const content = [];
  const head = [
    `Look: ${look.name || ''}${look.vibe ? `, ${look.vibe}` : ''}`,
    context.style ? `Style: ${context.style}` : '',
    context.setting ? `Setting: ${context.setting}` : '',
    palette.length ? `Palette: ${palette.map((c) => `${c.name} ${c.hex}`).join(', ')}` : '',
  ].filter(Boolean).join('\n');
  content.push({ type: 'text', text: head });

  // Spread the image budget: chosen context pieces first, then candidates.
  let budget = MAX_IMAGES;
  const fixedShown = withImages ? fixed.slice(0, 12) : [];
  if (fixed.length) {
    content.push({ type: 'text', text: 'Already chosen pieces the new picks must go with:' });
    fixed.forEach((f) => {
      content.push({ type: 'text', text: `- ${f.who}, ${f.slot}: ${f.title}` });
      if (withImages && fixedShown.includes(f) && f.image) { content.push(urlImage(f.image)); budget -= 1; }
    });
  }
  const perItem = Math.max(1, Math.min(4, Math.floor(budget / Math.max(1, items.length))));
  items.forEach((it) => {
    content.push({ type: 'text', text: `\nPIECE key=${it.key}: ${it.who}, ${it.slot}. Wanted: ${it.description}${it.colorName ? ` (${it.colorName})` : ''}${it.maxPrice ? `, up to $${it.maxPrice}` : ''}.` });
    (it.candidates || []).slice(0, perItem).forEach((c) => {
      content.push({ type: 'text', text: `Listing id=${c.id}: ${c.title}${c.brand ? ` by ${c.brand}` : ''}, $${c.price} at ${c.merchant}` });
      if (withImages && c.image) content.push(urlImage(c.image));
    });
    if (!it.candidates?.length) content.push({ type: 'text', text: '(No listings found. Set pick to null and write a new_query.)' });
  });
  content.push({ type: 'text', text: '\nMake the edit now. JSON only.' });
  return content;
}

export function parseCuration(reply, items) {
  const byKey = new Map(items.map((it) => [it.key, it]));
  const choices = [];
  for (const c of reply.choices || []) {
    const it = byKey.get(c.key);
    if (!it) continue;
    const ids = new Set((it.candidates || []).map((x) => x.id));
    const pick = c.pick && ids.has(String(c.pick)) ? String(c.pick) : null;
    choices.push({
      key: it.key,
      pick,
      why: String(c.why || ''),
      newQuery: pick ? null : String(c.new_query || it.description || '').slice(0, 200),
      maxPrice: Number(c.max_price) > 0 ? Math.round(Number(c.max_price)) : it.maxPrice || null,
    });
    byKey.delete(c.key);
  }
  // Anything the reply skipped: keep the first listing rather than leave a gap.
  for (const it of byKey.values()) {
    const first = it.candidates?.[0];
    choices.push({ key: it.key, pick: first ? first.id : null, why: first ? 'default' : 'no listings', newQuery: first ? null : it.description, maxPrice: it.maxPrice || null });
  }
  return { together: String(reply.together || ''), choices };
}

export async function curateLook(apiKey, input, model) {
  const items = (input.items || []).filter((it) => it?.key && SLOTS.has(it.slot));
  const run = async (withImages) => {
    const text = await callClaude(apiKey, {
      model,
      max_tokens: 4000,
      system: CURATE_SYSTEM,
      messages: [{ role: 'user', content: buildCurateContent({ ...input, items }, withImages) }],
    }, 150000);
    return parseCuration(parseJsonReply(text), items);
  };
  try {
    return { ...(await run(true)), sawPhotos: true };
  } catch (e) {
    // A store's image server refused Anthropic: judge from titles instead.
    if (isImageFetchError(e)) return { ...(await run(false)), sawPhotos: false };
    throw e;
  }
}

export const REASONS = {
  color: 'The color is wrong for the family palette.',
  style: "It isn't their style.",
  formal: 'Too dressy.',
  casual: 'Too casual.',
  price: 'Too expensive.',
  together: "It doesn't go with the rest of the outfits.",
  fit: 'Wrong cut or fit for them.',
  have: 'They already have something like it.',
  other: 'Other.',
};

export async function rewriteItem(apiKey, input, model) {
  const { item = {}, reason, note, look = {}, palette = [], others = [] } = input;
  const lines = [
    `Look: ${look.name || ''}${look.vibe ? `, ${look.vibe}` : ''}`,
    palette.length ? `Palette: ${palette.map((c) => `${c.name} ${c.hex}`).join(', ')}` : '',
    `Removed piece: ${item.who}, ${item.slot}: ${item.currentTitle || item.description}${item.price ? ` ($${item.price})` : ''}. Original limit $${item.maxPrice || 'none'}.`,
    `Client's reason: ${REASONS[reason] || 'not given'}${note ? ` Note: ${String(note).slice(0, 300)}` : ''}`,
    others.length ? `Rest of the look:\n${others.slice(0, 16).map((o) => `- ${o}`).join('\n')}` : '',
  ].filter(Boolean).join('\n');
  const text = await callClaude(apiKey, {
    model,
    max_tokens: 800,
    system: REWRITE_SYSTEM,
    messages: [{ role: 'user', content: lines }],
  }, 60000);
  const r = parseJsonReply(text);
  return {
    description: String(r.description || item.description || ''),
    colorName: String(r.color_name || ''),
    colorHex: /^#[0-9a-f]{6}$/i.test(r.color_hex || '') ? r.color_hex : '#cccccc',
    query: String(r.search_query || r.description || item.description || '').slice(0, 200),
    maxPrice: Number(r.max_price) > 0 ? Math.round(Number(r.max_price)) : item.maxPrice || null,
  };
}
