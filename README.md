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

## Deploy on Cloudflare Pages (free)

1. Sign up at <https://dash.cloudflare.com/sign-up>.
2. Go to **Workers & Pages → Create → Pages → Connect to Git**, authorize GitHub, and pick this repo.
3. Build settings: Framework preset **None**, build command **empty**, build output directory **public**.
4. Click **Save and Deploy**. You get a link like `photo-shoot-flat-lay.pages.dev`.
5. Open the project's **Settings → Variables and Secrets**, add these as **Secrets** for Production:
   - `ANTHROPIC_API_KEY`: from <https://console.anthropic.com>
   - `CHANNEL3_API_KEY`: free at <https://trychannel3.com>
   - `SKIMLINKS_ID` (optional)
6. Go to **Deployments** and retry the latest deployment so the keys take effect. Until they're in, the page says what's missing and can show a sample plan.

Every push to `main` redeploys automatically. Cloudflare's free plan allows 100,000 API requests a day and, unlike Vercel's free plan, isn't limited to non-commercial use. Its CPU limit per request is small, so photos are shrunk in the browser before upload; if the stylist ever fails on large photo sets, the Workers Paid plan ($5/month) raises the limit.

Local: copy `.dev.vars.example` to `.dev.vars`, then `npm run dev`.

## Files

```
public/                          the app (plain HTML/CSS/JS, no build step)
functions/api/config.js          which services are set up
functions/api/weather.js         forecast or typical weather
functions/api/stylist.js         Claude plans the looks
functions/api/products.js        Channel3 product search
wrangler.toml                    Cloudflare Pages settings
lib/                             shared logic, unit-tested in test/
```

## Before launch

- **Cost control**: the stylist and product calls run on your keys. Add rate limiting (Cloudflare → Security → WAF rate limiting rules) before sharing widely.
- **Photos** are resized in the browser and sent only to the stylist call; nothing is stored.
- **Pinterest**: the official API only searches a signed-in user's own pins, so inspiration comes from uploads. A "connect your Pinterest board" option can be added with Pinterest OAuth.
