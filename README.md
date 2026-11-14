# SustainerPrice — hackathon demo

A public landing page and a clickable member app for **SustainerPrice** (Flexible Ownership Living). Built from `../SustainerPrice_Product_Spec.pdf`.

Plain HTML + Tailwind (Play CDN) + Leaflet. No build step; deploys to Vercel as static files.

## Run

```bash
npm start      # http://localhost:5173  (tiny Node static server, no dependencies)
npm test       # unit tests for the pricing / swap / upsize logic (node:test)
```

ES modules need a server; opening `index.html` straight from disk will not work.

## Pages

| Page | Spec features |
|---|---|
| `index.html` — landing | L1 hero, L2 problem stats, L3 how it works, L4 equity calculator, L5 tier cards with floor plans, L6 network map + rent comparison + portfolio spread, L7 amenities / management / community, L8 partners, L9 FAQ + waitlist |
| `app.html` — member demo | M1 dashboard (now with profile + community cards), M2 swap request, M3 upsize, M4 co-op vote, M5 guest suite booking, **Communities** comparison, **Data** tables with add/remove user. **Reset demo** in the header restores the seed data. |

## Data model (`js/db.js`, `js/schema.js`, `js/seed.js`)

Three tables, joined user → property → community:

| Table | Fields | Rules |
|---|---|---|
| **User** | `id`, `firstName`, `lastName`, `dateOfBirth`, `shares`, `propertyId` → Portfolio | Age ≥ 18; whole shares, at most the home's tier total (S 200 / M 300 / L 600); one user per home |
| **Portfolio** | `id`, `tier` (S/M/L), `communityId` → Community | One row per home. Occupied homes can't be changed or removed |
| **Community** | `id`, `riskLevel` (1–5), `location`, `amenities` (list), `safetyLevel` (1–5) | A community with homes can't be removed |

- Repository API per table: `findAll(predicate)`, `findById`, `create`, `update`, `remove`. Writes return `{ ok, value }` or `{ ok: false, errors }` and never mutate rows (all rows are frozen).
- Queries: `resolveUser(id)` (user + property + community + tier + age), `freeUnits({ communityId, tier })`, `occupantOf(propertyId)`, `communityStats()`.
- The member app derives the demo member's name, shares, home and tier from user `u-001`. Swaps and upsizes move them to a free home in the portfolio, and swap availability counts free homes.
- State persists in `localStorage` (key `sp-demo-state-v2`).
- `supabase/schema.sql` has the same tables for a real backend. Users hold personal data, so they get **no** anon access; communities and portfolio are public-read.
- Seed people and the community risk/safety scores are fictional demo data.

## Structure

```
index.html, app.html
css/styles.css          component classes (buttons, cards, chips, bars)
js/data.js              mock data: tiers, buildings, member, stats (edit numbers here)
js/seed.js              seed rows for the user / portfolio / community tables
js/schema.js            field validation for the three tables
js/db.js                in-memory database (repositories + joins), unit-tested
js/app-data.js          views for profile, community, comparison and data tables
js/model.js             pure business logic — no DOM, fully unit-tested
js/landing.js, app.js   page controllers
js/ui.js                escaping, icons, schematic floor plans
js/waitlist.js          waitlist adapter (Supabase or browser-only demo mode)
js/config.js            Supabase URL + anon key (empty = demo mode)
supabase/waitlist.sql   table + insert-only RLS policy
supabase/schema.sql     users / portfolio / communities tables + RLS
tests/model.test.js, tests/db.test.js
scripts/serve.mjs       local static server
```

## Product rules implemented (`js/model.js`)

| Rule | Source |
|---|---|
| $250 per share; tiers S 200 / M 300 / L 600 shares at $200 / $300 / $600 a month | Spec §5, §11 |
| Ownership accrues evenly to 100% after 240 months at the base fee | Spec §5 (buy-back rule) |
| Paying above the base fee buys extra shares at $250 | Spec §9 calculator logic |
| Swaps need 30–60 days' notice; equity unchanged | Spec §7 |
| Contested swaps go to the member with the most priority points | Spec §7 |
| Upsize shows shares needed, lump-sum vs. higher-monthly options | Spec §7 (M3) |

Building availability, cut-off points, building value index and vote tallies are **illustrative mock data**, labelled as such in the UI.

## Waitlist storage

Demo mode (default) saves sign-ups to the visitor's browser only. To collect real sign-ups:

1. Create a Supabase project and run `supabase/waitlist.sql` in its SQL editor.
2. Put the project URL and the **anon** key in `js/config.js`. The anon key is public by design; RLS allows inserts only — nobody can read the list with it.

## Deploy (Vercel)

`vercel` from this folder, or import the repo in the Vercel dashboard with framework preset **Other** and no build command. The output directory is the project root.

## Known gaps / next steps

- Tailwind Play CDN is fine for a demo; for production, compile Tailwind instead.
- No real auth, payments or share issuance (non-goals for the hackathon).
- Open spec questions still affect numbers: entry stake, funding the $0 buy-back, real monthly fees vs. ~$1,820 NYC market rent, swap fee.
