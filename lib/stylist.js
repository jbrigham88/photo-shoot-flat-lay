// The AI stylist: reads the quiz, weather and photos, and plans three
// coordinated looks. Each new piece comes back as a product search the
// app runs against the product API.

import { callClaude, explainStylistError } from './anthropic.js';
const MAX_IMAGE_CHARS = 2_000_000; // ~1.5 MB of base64 per photo
export const SLOTS = ['outerwear', 'top', 'dress', 'bottom', 'shoes'];

const SYSTEM = `You are a professional stylist who plans coordinated outfits for family photo shoots.
Rules:
- Coordinate, don't match: build each look from the palette, mixing tones and textures. Avoid everyone in identical colors.
- Plan exactly 3 looks that feel clearly different from one another but each fits the requested style.
- Dress every person in every look with a complete outfit: either top + bottom or a dress/one-piece, plus shoes. Add outerwear when it will be cold, wet or the client asks for layers.
- No accessories of any kind (no hats, bows, headbands, jewelry, belts, scarves, socks, bags or laces). Slots are only outerwear, top, dress, bottom, shoes.
- Babies under 1: a one-piece (slot "dress"); shoes are optional.
- The family will be photographed together, so every piece must look good next to every other piece: harmonious tones, compatible formality, a mix of textures, one or two people in a soft pattern at most.
- Avoid logos, graphics, text, neon or high-contrast trim, glitter and novelty prints unless the style asks for them.
- Dress for the setting, time of day and weather you are given. Explain the weather choice in weather_note.
- If the client listed pieces they already own, use each one in at least one look when it suits the plan, by putting its owned_id on that item instead of searching for a new one.
- Budget: the max_price values for one person's new (not owned) items in one look must add up to no more than that person's budget. Spend more on hero pieces (dresses, sweaters, coats) and less on basics. Keep each max_price realistic for that kind of piece at mainstream stores.
- search_query is what a shopper would type into a store search: 4 to 10 words with color, material, garment and the department ("women's", "men's", "girls'", "boys'", "toddler girl", "baby boy"). Never include brand names or sizes.
- Use the person ids exactly as given.
Return ONLY a JSON object, no prose, with this shape:
{"palette":[{"name":"Oatmeal","hex":"#D9CBB3"}],
 "summary":"one or two sentences about the overall direction",
 "weather_note":"one sentence on how weather and setting shaped the choices",
 "looks":[{"name":"short evocative name","vibe":"one sentence",
   "items":[{"person_id":"p1","slot":"top|bottom|dress|outerwear|shoes",
     "description":"what it is, in plain words","color_name":"Oatmeal","color_hex":"#D9CBB3",
     "search_query":"...","max_price":45,"owned_id":null}]}]}
Palette has 4 to 6 colors.`;

function imageBlock(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(dataUrl || '');
  if (!m || m[2].length > MAX_IMAGE_CHARS) return null;
  return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } };
}

export function personBudgets(family, budget) {
  const amount = Number(budget?.amount);
  const out = {};
  if (!Number.isFinite(amount) || amount <= 0) return out;
  if (budget.per === 'family') {
    // Babies and small kids get a smaller share than adults.
    const weight = (p) => (Number(p.age) < 4 ? 0.5 : Number(p.age) < 13 ? 0.75 : 1);
    const total = family.reduce((s, p) => s + weight(p), 0) || 1;
    family.forEach((p) => { out[p.id] = Math.round((amount * weight(p)) / total); });
  } else {
    family.forEach((p) => { out[p.id] = Math.round(amount); });
  }
  return out;
}

function describePerson(p, budgets) {
  const age = Number(p.age);
  const ageText = !Number.isFinite(age) ? 'age not given'
    : age < 2 ? `${Math.round(age * 12)} months old` : `${Math.round(age)} years old`;
  const bits = [
    `id ${p.id}`, p.name || p.relation || 'family member', p.relation && p.name ? `(${p.relation})` : '',
    ageText, p.gender || '', p.size ? `size ${p.size}` : '',
    budgets[p.id] ? `budget about $${budgets[p.id]} per look` : 'no budget limit',
  ];
  return '- ' + bits.filter(Boolean).join(', ');
}

export function buildMessages({ quiz = {}, family = [], weather, photos = {} }) {
  const budgets = personBudgets(family, quiz.budget);
  const content = [];
  const lines = [
    `Style: ${(quiz.styles || []).join(', ') || 'not specified'}`,
    quiz.notes ? `Client notes: ${quiz.notes}` : '',
    `Setting: ${quiz.setting || 'not specified'}${quiz.location ? ` in ${quiz.location}` : ''}`,
    quiz.date ? `Shoot date: ${quiz.date}` : 'Shoot date: not set',
    quiz.timeOfDay ? `Time of day: ${quiz.timeOfDay}` : '',
    weather && !weather.error
      ? `Weather (${weather.kind === 'forecast' ? 'forecast' : 'typical for this date'}): high ${weather.highF}°F, low ${weather.lowF}°F, ${weather.precipChance ?? '?'}% chance of rain${weather.condition ? `, ${weather.condition}` : ''}${weather.sunset ? `, sunset ${weather.sunset}` : ''}`
      : 'Weather: unknown, plan for the season and location.',
    quiz.paletteMode === 'chosen' && quiz.colors?.length
      ? `Palette the client chose: ${quiz.colors.join(', ')}. Build the palette around these.`
      : 'Palette: choose one from the inspiration photos and style.',
    'Family:',
    ...family.map((p) => describePerson(p, budgets)),
  ].filter(Boolean);
  content.push({ type: 'text', text: lines.join('\n') });

  (photos.inspiration || []).slice(0, 6).forEach((url, i) => {
    const b = imageBlock(url);
    if (b) content.push({ type: 'text', text: `Inspiration photo ${i + 1}:` }, b);
  });
  if (photos.family) {
    const b = imageBlock(photos.family);
    if (b) content.push({ type: 'text', text: 'Photo of the family, for choosing flattering colors and overall feel:' }, b);
  }
  (photos.owned || []).slice(0, 8).forEach((o) => {
    const b = imageBlock(o.dataUrl);
    if (b) content.push({ type: 'text', text: `Owned piece owned_id "${o.id}" for person ${o.personId}: ${o.label || 'clothing item'}` }, b);
  });
  content.push({ type: 'text', text: 'Plan the three looks now. JSON only.' });
  return { messages: [{ role: 'user', content }], budgets };
}

export function parsePlan(text, family, owned = []) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('The stylist did not return a plan.');
  const plan = JSON.parse(text.slice(start, end + 1));
  const ids = new Set(family.map((p) => p.id));
  const ownedIds = new Set(owned.map((o) => o.id));
  const hex = (h) => (/^#[0-9a-f]{6}$/i.test(h || '') ? h : '#cccccc');
  return {
    palette: (plan.palette || []).slice(0, 6).map((c) => ({ name: String(c.name || ''), hex: hex(c.hex) })),
    summary: String(plan.summary || ''),
    weather_note: String(plan.weather_note || ''),
    looks: (plan.looks || []).slice(0, 3).map((look, li) => ({
      id: `look${li + 1}`,
      name: String(look.name || `Look ${li + 1}`),
      vibe: String(look.vibe || ''),
      items: (look.items || [])
        .filter((it) => ids.has(it.person_id) && SLOTS.includes(it.slot))
        .filter((it, i, arr) => arr.findIndex((x) => x.person_id === it.person_id && x.slot === it.slot) === i)
        .map((it) => ({
          personId: it.person_id,
          slot: it.slot,
          description: String(it.description || ''),
          colorName: String(it.color_name || ''),
          colorHex: hex(it.color_hex),
          query: String(it.search_query || it.description || ''),
          maxPrice: Number(it.max_price) > 0 ? Math.round(Number(it.max_price)) : null,
          ownedId: ownedIds.has(it.owned_id) ? it.owned_id : null,
        })),
    })),
  };
}

export async function planLooks(apiKey, input, model) {
  const { messages } = buildMessages(input);
  const text = await callClaude(apiKey, { model, max_tokens: 16000, system: SYSTEM, messages }, 170000);
  try {
    return parsePlan(text, input.family || [], input.photos?.owned || []);
  } catch (e) {
    const err = new Error('The stylist replied in an unexpected format.');
    err.kind = 'bad_format';
    err.sample = text.slice(0, 300);
    throw err;
  }
}

export { explainStylistError };
