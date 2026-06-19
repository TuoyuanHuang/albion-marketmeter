# Albion Market (EU)

A web app for Albion Online traders, built on live and historical market data
from the [Albion Online Data Project](https://www.albion-online-data.com/).
Defaults to the **Europe** server.

## Features

- **Flip Finder** — pick any item and see buy/sell prices across all cities.
  Highlights the best buy-low / sell-high route and its profit & margin after
  market fees (sales tax + setup fee, both configurable).
- **Crafting Calculator** — material cost vs. sell price for any craftable item,
  with a configurable resource **return rate**, market fees, and a "craft
  sub-materials when cheaper" mode that recursively prices intermediate goods.
- **Crafting Suggestions** — scans craftable items in the chosen categories and
  ranks what's worth crafting: product sell value (at a chosen quality, net of
  fees) + **journal value** − material cost (after return rate). Crafting fame is
  derived from resource item values; journals are mapped by profession
  (Warrior/Hunter/Mage/Toolmaker) and valued from live empty/full journal prices.
- **Price History** — average price and traded volume over time, charted per
  city (daily or 6-hour resolution).

## Stack

- Next.js (App Router) + React + TypeScript
- Tailwind CSS, Recharts
- Server-side API routes proxy AODP (handles CORS + caching)

## Data

Item names and crafting recipes come from the
[ao-data/ao-bin-dumps](https://github.com/ao-data/ao-bin-dumps) game dump. The
`build:data` script downloads the dump and produces two slim bundled files in
`src/data/` (`items.json`, `recipes.json`). Re-run it after game patches:

```bash
npm run build:data
```

## Develop

```bash
npm install
npm run build:data   # generate src/data/* (already committed)
npm run dev          # http://localhost:3007
```

## Notes

- Prices are crowd-sourced by the AODP client and can be stale; each quote shows
  its age. "0" prices from the API mean "no data" and are treated as missing.
- Fees default to Premium values (4% sales tax, 2.5% setup). The crafting return
  rate defaults to 15.2% (standard city bonus) and is applied to all materials
  for simplicity — in-game it excludes artifacts.
- To target a different region, change `AODP_BASE` in `src/lib/albion.ts`
  (`west` / `east` / `europe`).
- Not affiliated with Sandbox Interactive.
