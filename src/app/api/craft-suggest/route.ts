import { NextRequest, NextResponse } from "next/server";
import { AODP_BASE, PriceRow, isPriced } from "@/lib/albion";
import {
  craftablesForScan,
  getRecipe,
  displayName,
  JOURNALS,
} from "@/lib/items";

// GET /api/craft-suggest?groups=weapons&tiers=4,5,6&city=Caerleon&quality=1
//   &rr=0.15&tax=0.04&fee=0.025&journals=1&sort=profit
// Ranks craftable items by profit per craft: product sell value (at the chosen
// quality, net of fees) + journal value − material cost (after return rate).
export const dynamic = "force-dynamic";

const BATCH = 100;
const ITEM_CAP = 600;
const CONCURRENCY = 6;

async function runPool<T>(tasks: (() => Promise<T>)[], limit: number) {
  const out: T[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      out[i] = await tasks[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return out;
}

const csv = (v: string | null, fb: string) =>
  (v ?? fb).split(",").map((s) => s.trim()).filter(Boolean);

async function fetchPrices(ids: string[], city: string, qualities: string) {
  const url = new URL(
    `${AODP_BASE}/prices/${ids.map(encodeURIComponent).join(",")}`
  );
  url.searchParams.set("qualities", qualities);
  url.searchParams.set("locations", city);
  const res = await fetch(url, {
    headers: { "User-Agent": "albion-market-app" },
    next: { revalidate: 120 },
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return (await res.json()) as PriceRow[];
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const groups = csv(sp.get("groups"), "weapons");
  const subs = new Set(csv(sp.get("subs"), ""));
  const tiers = csv(sp.get("tiers"), "4,5,6,7,8")
    .map(Number)
    .filter((n) => n >= 1 && n <= 8);
  const city = sp.get("city") ?? "Caerleon";
  const quality = Math.max(1, Math.min(5, Number(sp.get("quality") ?? "1")));
  const rr = Math.max(0, Math.min(0.5, Number(sp.get("rr") ?? "0.152")));
  const tax = Number(sp.get("tax") ?? "0.04");
  const fee = Number(sp.get("fee") ?? "0.025");
  const useJournals = sp.get("journals") !== "0";
  const sort = sp.get("sort") === "margin" ? "margin" : "profit";

  if (!groups.length || !tiers.length) {
    return NextResponse.json(
      { error: "Select at least one category and tier" },
      { status: 400 }
    );
  }

  // Craftable products in scope (deduped, capped).
  const seen = new Set<string>();
  const items = [];
  for (const g of groups) {
    for (const it of craftablesForScan(g, tiers, ITEM_CAP, subs)) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      items.push(it);
      if (items.length >= ITEM_CAP) break;
    }
    if (items.length >= ITEM_CAP) break;
  }
  if (items.length === 0) {
    return NextResponse.json({ results: [], scanned: 0 });
  }

  // Collect every id we need a price for: products, materials, journals.
  const priceIds = new Set<string>();
  const journalIds = new Set<string>();
  for (const it of items) {
    priceIds.add(it.id);
    const r = getRecipe(it.id);
    if (!r) continue;
    for (const res of r.resources) priceIds.add(res.id);
    if (useJournals && r.journal && JOURNALS[r.journal]?.[it.tier]) {
      const base = `T${it.tier}_JOURNAL_${r.journal}`;
      journalIds.add(base);
      journalIds.add(`${base}_FULL`);
    }
  }
  for (const j of journalIds) priceIds.add(j);

  // Products are priced at the chosen quality; everything else at quality 1.
  const qualities = Array.from(new Set([1, quality])).join(",");
  const allIds = Array.from(priceIds);
  const batches: string[][] = [];
  for (let i = 0; i < allIds.length; i += BATCH) {
    batches.push(allIds.slice(i, i + BATCH));
  }

  let rows: PriceRow[];
  try {
    rows = (
      await runPool(
        batches.map((b) => () => fetchPrices(b, city, qualities)),
        CONCURRENCY
      )
    ).flat();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "scan failed" },
      { status: 502 }
    );
  }

  // price[id][quality] = cheapest sell order; pdate keeps that quote's date.
  const price = new Map<string, Map<number, number>>();
  const pdate = new Map<string, Map<number, string>>();
  for (const r of rows) {
    if (!isPriced(r.sell_price_min)) continue;
    let m = price.get(r.item_id);
    if (!m) price.set(r.item_id, (m = new Map()));
    m.set(r.quality, r.sell_price_min);
    let d = pdate.get(r.item_id);
    if (!d) pdate.set(r.item_id, (d = new Map()));
    d.set(r.quality, r.sell_price_min_date);
  }
  const priceAt = (id: string, q: number) => price.get(id)?.get(q);

  const results = [];
  let missing = 0;
  for (const it of items) {
    const r = getRecipe(it.id)!;
    const productPrice = priceAt(it.id, quality);
    if (!isPriced(productPrice)) {
      missing++;
      continue;
    }

    // Material cost after return rate (materials are normal quality).
    let matCost = 0;
    let incomplete = false;
    for (const res of r.resources) {
      const p = priceAt(res.id, 1);
      if (!isPriced(p)) {
        incomplete = true;
        break;
      }
      matCost += p * res.count * (1 - rr);
    }
    if (incomplete) {
      missing++;
      continue;
    }
    const totalCost = matCost + r.silver;

    const revenue = productPrice * r.amount * (1 - tax - fee);

    // Journal value: sell full journals (net), buy empty ones, per fame filled.
    let journalProfit = 0;
    let journalPerFame = 0;
    if (useJournals && r.journal && r.fame) {
      const base = `T${it.tier}_JOURNAL_${r.journal}`;
      const maxFame = JOURNALS[r.journal]?.[it.tier];
      const empty = priceAt(base, 1);
      const full = priceAt(`${base}_FULL`, 1);
      if (maxFame && isPriced(full)) {
        // Empty journals are sometimes unlisted; treat a missing empty as 0 cost.
        const emptyCost = isPriced(empty) ? empty : 0;
        journalPerFame = (full * (1 - tax - fee) - emptyCost) / maxFame;
        journalProfit = r.fame * journalPerFame;
      }
    }

    const profit = revenue + journalProfit - totalCost;
    const amount = r.amount || 1;
    results.push({
      id: it.id,
      name: displayName(it.id),
      tier: it.tier,
      journal: r.journal ?? null,
      fame: r.fame ?? 0,
      sell: productPrice, // gross product price at chosen quality
      sellDate: pdate.get(it.id)?.get(quality) ?? "",
      matCost: matCost / amount,
      net: revenue / amount,
      journalProfit: journalProfit / amount,
      profit: profit / amount,
      margin: totalCost > 0 ? profit / totalCost : 0,
    });
  }

  results.sort((a, b) => b[sort] - a[sort]);

  return NextResponse.json({
    results: results.slice(0, 100),
    scanned: items.length,
    priced: results.length,
    missing,
    city,
  });
}
