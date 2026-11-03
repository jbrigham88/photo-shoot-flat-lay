# Photo Shoot Flat Lay

A free web app that styles a whole family for a photo shoot. Parents answer a few questions, add inspiration photos, and get three coordinated looks laid out as flat-lay collages of **real, shoppable products** in their budget. They can mix pieces between looks into a final set and shop each one. Every product link is an affiliate link.

## How it works

1. **Quiz**: style, setting (outdoors / indoors / studio), city, optional date, time of day, each family member's age, who they shop for and size, palette, and budget (per person or whole family).
2. **Photos**: inspiration screenshots (Pinterest, Instagram, the location), an optional family photo, and photos of pieces they already own.
3. **Weather** (`/api/weather`): a real forecast when the shoot is within 16 days; otherwise typical highs, lows and rain odds for that week, averaged over the last 5 years. Uses Open-Meteo, no key needed.
4. **Stylist** (`/api/stylist`): Claude reads the answers, weather and photos and plans three looks. Each new piece comes back as a store search with a color and a max price; owned pieces are worked into the looks.
5. **Products** (`/api/products`): each piece is searched on Channel3 (100M+ products across thousands of stores) filtered by age group, gender, in-stock and price. The app shows the real product photo, price and store, prefers product-only shots for the flat lay, and links to the offer URL, which already carries affiliate tracking.
6. **Final set**: tap "Add to set" (or drag onto "Your set" on a computer) to mix pieces across looks. A dress replaces a top and bottom for that person. The bar at the bottom tracks the total against the budget.

## Money

- **Channel3 offers** are affiliate links out of the box; commissions go to the account tied to `CHANNEL3_API_KEY`.
- **Skimlinks (optional)**: set `SKIMLINKS_ID` and the page loads the Skimlinks script, which turns any other outbound store link into an affiliate link.
- **Later**: direct programs (Amazon Associates, Target, Old Navy, Nordstrom via Impact/CJ/Rakuten) for the stores people buy from most, for a bigger share.
- The footer carries the FTC disclosure, and shop links use `rel="sponsored"`.

## Deploy on Vercel

1. Import this repo at <https://vercel.com/new> (Framework preset: **Other**, no build command).
2. In **Settings → Environment Variables** add:
   - `ANTHROPIC_API_KEY`: from <https://console.anthropic.com>
   - `CHANNEL3_API_KEY`: free at <https://trychannel3.com>
   - `SKIMLINKS_ID` (optional)
3. Redeploy. Until the keys are in, the page says what's missing and can show a sample plan.

Local: `npm i -g vercel`, copy `.env.example` to `.env.local`, then `vercel dev`.

## Files

```
index.html, styles.css, app.js   the app (plain HTML/JS, no build step)
api/config.js                    which services are set up
api/weather.js                   forecast or typical weather
api/stylist.js                   Claude plans the looks
api/products.js                  Channel3 product search
lib/                             shared logic, unit-tested in test/
```

## Before launch

- **Cost control**: the stylist and product calls run on your keys. Add rate limiting (for example Vercel's firewall rules or Upstash) before sharing widely.
- **Photos** are resized in the browser and sent only to the stylist call; nothing is stored.
- **Pinterest**: the official API only searches a signed-in user's own pins, so inspiration comes from uploads. A "connect your Pinterest board" option can be added with Pinterest OAuth.
