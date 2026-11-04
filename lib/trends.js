// What's on trend right now for family photo shoots. Researched from current
// family-photo styling guides, Pinterest Predicts 2026, and Fall/Winter 2026
// trend reports. Refresh each season (see README → "Keeping trends current").

export const TRENDS_UPDATED = '2026-11-04';

const FALL_WINTER = `CURRENT TRENDS: FALL / WINTER 2026 FAMILY PHOTOS
Overall feel: warm, textural, timeless-but-current. Think a Pinterest-ready flat lay from a styling blog: earthy neutrals with one or two deeper accents, lots of knit texture, polished but easy to move in. Coordinated, never matching.

Palettes that are working now (pick one family and stay inside it):
- Warm neutrals: cream, oatmeal, camel, mocha, chocolate brown, plus dark denim.
- Earth + berry: cream, camel, chocolate with burgundy/wine as the accent.
- Earth + green: cream, tan, chocolate with olive or deep forest/pine green.
- Navy anchor: navy, cream, camel, cognac brown, a touch of sage or dusty blue.
- Holiday jewel: one or two people in a jewel tone (burgundy, emerald, deep navy velvet) against cream, camel and brown.
- Icy blue ("cool blue", a Pinterest 2026 trend): powder or dusty blue with cream, oatmeal and soft gray; good for winter or snowy settings.
Accent colors must come from the palette. No bright one-off accents (lime, neon, hot pink, kelly green, bright purple, primary red/blue/yellow) unless the client asked for them.

Textures and details that read current: cable knit, rib knit, waffle knit, chunky knit, pointelle, corduroy, suede, brushed flannel, velvet (holiday), lace and lace trim (women and girls; "Laced Up" is a Pinterest 2026 trend), smocking, ruffle collars, scallop trim, Peter Pan or statement collars, henley necklines.
Pattern: at most one or two people in a soft pattern (small floral, muted plaid, gingham, subtle stripe). Everyone else in solids or texture.

MOM (pick from):
- Knit midi or maxi sweater dress in cream, oatmeal, mocha or burgundy; flowy midi dress in a small floral or solid with long sleeves; velvet midi dress for holiday.
- Lace or ruffle-collar blouse, ribbed polo sweater, henley sweater, or oversized cable crewneck with wide-leg dark or medium-wash jeans, a pleated midi skirt, or a satin slip skirt.
- Layer only if it is part of the look: suede or leather bomber, long camel coat (dressy/winter), sweater vest over a blouse.
- Shoes: knee-high or tall suede/leather boots in tan or brown, heeled ankle boots, Mary Jane flats, two-tone cap-toe ballet flats, loafers.
- Dated / avoid: skinny jeans, distressed or ripped denim, bodycon, graphic tees, athleisure, chunky platform sneakers, booties with cut-outs.

DAD (pick from):
- Half-zip or quarter-zip sweater (waffle or French rib), fisherman/cable crewneck, oatmeal or forest-green knit, henley sweater, Oxford or brushed-flannel button-down (muted plaid at most), ribbed polo sweater.
- Straight-fit dark jeans, chinos or corduroy trousers in khaki, navy, olive or brown, pleated wool trousers for dressy.
- Layer only if it is part of the look: suede or leather bomber, chore or field jacket, wool overcoat for dressy winter.
- Shoes: brown suede chukka boots, leather Chelsea or lace-up boots, penny loafers, clean leather sneakers only for casual.
- Avoid: logo polos, athletic wear, hoodies, cargo shorts, bright sneakers, skinny fit.

GIRLS:
- Dresses: corduroy pinafore over a cream knit or blouse, smocked or tiered dress (small floral, gingham, muted plaid), knit sweater dress, lace or ruffle-collar dress, velvet dress for holiday.
- Separates: pleated or scallop-trim skirt with a cream or brown sweater; cardigan with a Peter Pan collar.
- Tights in cream, tan, brown or burgundy rib-knit with dresses and skirts in cool weather.
- Shoes: Mary Jane flats (brown, cream, burgundy), tan or brown ankle boots, cowboy boots only for western/rustic.
- Avoid: puffers, leggings with tunics, sparkly or neon prints, character prints, sneakers with dresses.

BOYS:
- Cable or waffle-knit henley sweater, cream crewneck, cardigan (cable or shawl collar), Johnny-collar or Oxford shirt, quarter-zip, muted plaid button-down.
- Corduroy pants (brown, navy, camel), chinos, straight dark jeans.
- Shoes: mini versions of dad's boots (brown leather/suede chukka or Chelsea), loafers, plain leather sneakers in neutral for casual.
- Avoid: graphic tees, athletic joggers, hoodies, bright sneakers, puffers.

TODDLERS AND BABIES:
- Knit or bubble rompers, cable cardigan + legging sets, corduroy overalls or shortalls over a knit, smocked bubbles, sweater sets, Peter Pan collar rompers.
- Colors: cream, oatmeal, dusty blue, sage, camel, soft brown.
- Shoes: soft-sole booties, moccasins, Mary Janes for walkers.

LAYERS AND WEATHER:
- These are seasonal style photos, not cold-weather gear. Dress for the season (long sleeves, knits, tights, boots) but never add a functional warmth layer.
- Never recommend puffers, parkas, ski or rain jackets, fleece, softshells, hoodies or athletic outerwear.
- Only add outerwear when the piece itself is a style element that makes the collage better: cardigan, sweater vest, suede or leather bomber, chore jacket, denim or corduroy jacket for casual, long wool or camel coat for dressy winter. Most looks need no outerwear at all.
`;

const SPRING_SUMMER = `CURRENT TRENDS: SPRING / SUMMER FAMILY PHOTOS
Overall feel: light, airy, relaxed. Linen, gauze, eyelet, seersucker and gingham; soft whites and creams with sage, dusty blue, butter yellow or blush; small florals on one or two people.
Mom: flowy midi dresses (small floral, eyelet, linen), linen sets. Dad: linen or Oxford shirts, chinos or linen trousers. Girls: smocked or tiered dresses, gingham, eyelet. Boys: linen or Oxford shirts, Johnny collars, chino shorts or linen pants. Babies: rompers and bubbles. Shoes: leather sandals, espadrilles, loafers, Mary Janes, clean leather sneakers.
Avoid: neon, graphics, logos, athletic wear, flip-flops.
No outerwear unless it is a light style layer (linen shirt-jacket, cardigan).`;

// Northern-hemisphere seasons by month; spring/summer uses the lighter brief.
export function trendBrief(dateIso) {
  const d = dateIso ? new Date(`${dateIso}T12:00:00Z`) : new Date();
  const m = d.getUTCMonth() + 1;
  return m >= 4 && m <= 8 ? SPRING_SUMMER : FALL_WINTER;
}
