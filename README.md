# Photo Shoot Flat Lay

A free web app that styles a whole family for a photo shoot. Parents answer a few questions, add inspiration photos, and get three coordinated looks laid out as flat-lay collages of **real, shoppable products** in their budget. They can mix pieces between looks into a final set and shop each one. Every product link is an affiliate link.

## How it works

1. **Quiz**: style, setting, city, optional date, time of day, each family member's age, department and size, palette, and budget (per person or whole family).
2. **Photos**: inspiration screenshots, an optional family photo, and photos of pieces they already own.
3. **Weather** (`/api/weather`): forecast within 16 days, otherwise typical weather for that week (Open-Meteo, no key).
4. **Plan** (`/api/stylist`): Claude plans three looks. Garments only (outerwear, top, dress, bottom, shoes), no accessories.
5. **Search** (`/api/products`): each piece is searched on Channel3 with age group, gender, new condition, in stock, US/USD and price filters. Listings are dropped if they are for the wrong department, an accessory, a multi-pack, or have no product-only photo. Photos use Channel3's background-removed image of the piece itself, never on-model shots.
6. **The edit** (`/api/curate`): before a look is shown, Claude looks at the candidate photos for every piece together and picks the set that reads best as one family. Anything that fails (wrong person, clashing color, neon trim, cheap-looking, wrong garment) gets a better search and a second check.
7. **Results**: swipe between the three looks. Each look is one flat lay with the whole family's pieces grouped by person, and a shelf of the actual products below with price, store and Shop link.
8. **Swap** (`/api/replace`): drag a piece off the flat lay (or tap Swap), choose one or more reasons, and the stylist plans a replacement, searches, and ranks the options that pass the same edit (`/api/curate` with `mode: "rank"`). Pick one from the row of options.

Prices shown are the exact offer the Shop link goes to, straight from the feed: the lowest new, in-stock USD offer within that piece's budget.

**AI cost**: the edit step sends product photos to Claude, so a full run (plan + 3 looks) costs roughly 30–60 cents on Sonnet. To lower it, set `ANTHROPIC_CURATE_MODEL` to a cheaper Claude model for the edit and swap steps.

## Keeping trends current

`lib/trends.js` holds the trend brief the stylist, the edit step and swaps all follow: palettes, silhouettes and fabrics per family member, and what's dated. It is researched from current family-photo styling guides, Pinterest Predicts and season trend reports, and picks the Fall/Winter or Spring/Summer brief from the shoot date. Refresh it each season (update the text and `TRENDS_UPDATED`).

## Photos of pieces you own

Uploads (including shop screenshots) are cut out before use: Claude finds the garment in the photo (`/api/locate`), the browser crops to it, and Cloudflare Images removes the background (`/api/cutout`, the `IMAGES` binding; included in Cloudflare's free Images allowance). If background removal isn't available, the crop is used.

## Money

- **Channel3 offers** are affiliate links out of the box; commissions go to the account tied to `CHANNEL3_API_KEY`.
- **Skimlinks (optional)**: set `SKIMLINKS_ID` and the page loads the Skimlinks script, which turns any other outbound store link into an affiliate link.
- **Later**: direct programs (Amazon Associates, Target, Old Navy, Nordstrom via Impact/CJ/Rakuten) for the stores people buy from most, for a bigger share.
- The footer carries the FTC disclosure, and shop links use `rel="sponsored"`.

## Deploy on Cloudflare (free)

The app runs as a Cloudflare Worker: `public/` is served as static files and `/api/*` runs `src/worker.js`.

1. Sign up at <https://dash.cloudflare.com/sign-up>.
2. Go to **Workers & Pages → Create → Import a repository**, connect GitHub and pick this repo.
3. Keep the defaults: project name `photo-shoot-flat-lay`, build command empty, deploy command `npx wrangler deploy`. Click **Deploy**. You get a link like `photo-shoot-flat-lay.<your-subdomain>.workers.dev`.
4. Open the Worker's **Settings → Variables and Secrets** and add these as type **Secret**:
   - `ANTHROPIC_API_KEY`: from <https://console.anthropic.com>
   - `CHANNEL3_API_KEY`: free at <https://trychannel3.com>
   - `SKIMLINKS_ID` (optional)
   Saving a secret deploys it right away. Until the keys are in, the page says what's missing and can show a sample plan.

Every push to `main` redeploys automatically. Cloudflare's free plan allows 100,000 requests a day and, unlike Vercel's free plan, isn't limited to non-commercial use. Its CPU limit per request is small, so photos are shrunk in the browser before upload; if the stylist ever fails on large photo sets, the Workers Paid plan ($5/month) raises the limit.

Local: copy `.dev.vars.example` to `.dev.vars`, then `npm run dev`.

## Files

```
public/                          the app (plain HTML/CSS/JS, no build step)
src/worker.js                    routes /api/* to the handlers below
functions/api/config.js          which services are set up
functions/api/weather.js         forecast or typical weather
functions/api/stylist.js         Claude plans the looks
functions/api/products.js        Channel3 product search
functions/api/curate.js          the photo-based edit of each look
functions/api/replace.js         plans a replacement from swap feedback
functions/api/locate.js          finds a garment in an uploaded photo
functions/api/cutout.js          removes the background (Cloudflare Images)
lib/trends.js                    current trend brief
wrangler.toml                    Cloudflare settings
lib/                             shared logic, unit-tested in test/
```

## Before launch

- **Cost control**: the stylist and product calls run on your keys. Add rate limiting (Cloudflare → Security → WAF rate limiting rules) before sharing widely.
- **Photos** are resized in the browser and sent only to the stylist call; nothing is stored.
- **Pinterest**: the official API only searches a signed-in user's own pins, so inspiration comes from uploads. A "connect your Pinterest board" option can be added with Pinterest OAuth.
