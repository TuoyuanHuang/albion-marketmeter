import { NextRequest, NextResponse } from "next/server";
import { AODP_BASE, PriceRow, HistorySeries, isPriced } from "@/lib/albion";
import { itemsForScan, displayName, type Item } from "@/lib/items";

// GET /api/scan?groups=resources,weapons&tiers=4,5,6&marketA=Caerleon
//             &marketB=Black Market&qualities=1,2&enchants=0,1&tax=0.04&fee=0.025
// Scans every (item × enchant × quality) variant in the selected groups/tiers
// across two markets and returns the biggest flip opportunities by profit.
export const dynamic = "force-dynamic";

const BATCH = 100; // item ids per upstream request
const ITEM_CAP = 1500; // distinct base items per scan (keeps upstream bounded)
const CONCURRENCY = 6; // simultaneous upstream requests

// Runs async tasks with a bounded number in flight at once.
async function runPool<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, worker)
  );
  return results;
}

async function fetchBatch(
  ids: string[],
  locations: string,
  qualities: string
): Promise<PriceRow[]> {
  const url = new URL(
    `${AODP_BASE}/prices/${ids.map(encodeURIComponent).join(",")}`
  );
  url.searchParams.set("qualities", qualities);
  url.searchParams.set("locations", locations);
  const res = await fetch(url, {
    headers: { "User-Agent": "albion-market-app" },
    next: { revalidate: 120 },
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return (await res.json()) as PriceRow[];
}

async function fetchHistory(
  ids: string[],
  locations: string,
  qualities: string
): Promise<HistorySeries[]> {
  const url = new URL(
    `${AODP_BASE}/history/${ids.map(encodeURIComponent).join(",")}`
  );
  url.searchParams.set("qualities", qualities);
  url.searchParams.set("locations", locations);
  url.searchParams.set("time-scale", "24"); // daily resolution
  const res = await fetch(url, {
    headers: { "User-Agent": "albion-market-app" },
    next: { revalidate: 600 },
  });
  if (!res.ok) return [];
  return (await res.json()) as HistorySeries[];
}

const csv = (v: string | null, fallback: string) =>
  (v ?? fallback).split(",").map((s) => s.trim()).filter(Boolean);

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const groups = csv(sp.get("groups"), "resources");
  const tiers = csv(sp.get("tiers"), "4,5,6,7,8")
    .map(Number)
    .filter((n) => n >= 1 && n <= 8);
  const qualities = csv(sp.get("qualities"), "1")
    .map(Number)
    .filter((q) => q >= 1 && q <= 5);
  const enchants = csv(sp.get("enchants"), "0")
    .map(Number)
    .filter((e) => e >= 0 && e <= 3);
  // Optional subcategory filter (e.g. "firestaff", "dagger"). Empty = all subs.
  const subs = new Set(csv(sp.get("subs"), ""));
  const marketA = sp.get("marketA") ?? "Caerleon";
  const marketB = sp.get("marketB") ?? "Black Market";
  const tax = Number(sp.get("tax") ?? "0.04");
  const fee = Number(sp.get("fee") ?? "0.025");
  const sort = sp.get("sort") === "margin" ? "margin" : "profit";

  if (marketA === marketB) {
    return NextResponse.json(
      { error: "Pick two different markets" },
      { status: 400 }
    );
  }
  if (!groups.length || !tiers.length || !qualities.length || !enchants.length) {
    return NextResponse.json(
      { error: "Select at least one category, tier, quality and enchantment" },
      { status: 400 }
    );
  }

  // Union of items across the selected categories, deduped and capped.
  const seen = new Set<string>();
  const items: Item[] = [];
  for (const g of groups) {
    for (const it of itemsForScan(g, tiers, ITEM_CAP, subs)) {
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

  const locations = `${marketA},${marketB}`;
  const qParam = qualities.join(",");

  // One set of batches per enchant level (enchant lives in the item id; quality
  // is a query param, so all qualities come back in the same request).
  const tasks: (() => Promise<PriceRow[]>)[] = [];
  for (const e of enchants) {
    const suffix = e > 0 ? `@${e}` : "";
    for (let i = 0; i < items.length; i += BATCH) {
      const ids = items.slice(i, i + BATCH).map((it) => it.id + suffix);
      tasks.push(() => fetchBatch(ids, locations, qParam));
    }
  }

  let rows: PriceRow[];
  try {
    rows = (await runPool(tasks, CONCURRENCY)).flat();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "scan failed" },
      { status: 502 }
    );
  }

  // Index prices by "<item_id>|<quality>" -> market -> row.
  const priced = new Map<string, Map<string, PriceRow>>();
  for (const r of rows) {
    const key = `${r.item_id}|${r.quality}`;
    let m = priced.get(key);
    if (!m) priced.set(key, (m = new Map()));
    m.set(r.city, r);
  }

  const isBM = (m: string) => m === "Black Market";
  // What it costs to instantly buy one unit here (cheapest sell order).
  const acquire = (r?: PriceRow) =>
    r && !isBM(r.city) && isPriced(r.sell_price_min) ? r.sell_price_min : null;
  // Net silver from selling one unit here, after fees.
  const sellNet = (r?: PriceRow): number | null => {
    if (!r) return null;
    if (isBM(r.city)) {
      // Black Market only has buy orders -> instant sell into them.
      return isPriced(r.buy_price_max) ? r.buy_price_max * (1 - tax) : null;
    }
    // City: list a sell order at the current cheapest price (undercut), then tax.
    return isPriced(r.sell_price_min)
      ? r.sell_price_min * (1 - tax - fee)
      : null;
  };

  const results = [];
  for (const it of items) {
    for (const e of enchants) {
      const fullId = it.id + (e > 0 ? `@${e}` : "");
      for (const q of qualities) {
        const m = priced.get(`${fullId}|${q}`);
        if (!m) continue;
        const ra = m.get(marketA);
        const rb = m.get(marketB);

        let best: {
          from: string;
          to: string;
          buy: number;
          sell: number;
          sellGross: number;
          profit: number;
          buyDate: string;
          sellDate: string;
        } | null = null;

        for (const [src, dst, srcRow, dstRow] of [
          [marketA, marketB, ra, rb],
          [marketB, marketA, rb, ra],
        ] as const) {
          const buy = acquire(srcRow);
          const sell = sellNet(dstRow);
          if (buy == null || sell == null) continue;
          const profit = sell - buy;
          if (!best || profit > best.profit) {
            best = {
              from: src,
              to: dst,
              buy,
              sell,
              // Gross destination price the sell relies on (before fees).
              sellGross: isBM(dst)
                ? dstRow!.buy_price_max
                : dstRow!.sell_price_min,
              profit,
              // Timestamps of the exact quotes this flip relies on.
              buyDate: srcRow!.sell_price_min_date,
              sellDate: isBM(dst)
                ? dstRow!.buy_price_max_date
                : dstRow!.sell_price_min_date,
            };
          }
        }

        if (best && best.profit > 0) {
          // Quote dates keyed to the fixed markets (not the buy/sell direction).
          const aDate = best.from === marketA ? best.buyDate : best.sellDate;
          const bDate = best.from === marketB ? best.buyDate : best.sellDate;
          results.push({
            id: fullId,
            name: displayName(it.id),
            tier: it.tier,
            enchant: e,
            quality: q,
            ...best,
            aDate,
            bDate,
            margin: best.profit / best.buy,
            // History-derived stats at the sell market (filled in below).
            avgSell: null as number | null, // volume-weighted daily avg price
            vol: null as number | null, // avg items traded per day
            volTotal: null as number | null, // total items traded over the window
            recent: null as { d: string; n: number }[] | null, // last days' actual sold counts
          });
        }
      }
    }
  }

  results.sort((a, b) => b[sort] - a[sort]);
  const top = results.slice(0, 100);

  // Daily average sell price at each flip's destination market (volume-weighted
  // history). Fetched only for the items actually shown.
  const histIds = Array.from(new Set(top.map((r) => r.id)));
  if (histIds.length) {
    const histBatches: string[][] = [];
    for (let i = 0; i < histIds.length; i += BATCH)
      histBatches.push(histIds.slice(i, i + BATCH));
    let hist: HistorySeries[] = [];
    try {
      hist = (
        await runPool(
          histBatches.map((b) => () => fetchHistory(b, locations, qParam)),
          CONCURRENCY
        )
      ).flat();
    } catch {
      hist = [];
    }
    // id|quality|location -> { avg price, avg daily volume, total volume, recent days }.
    const stat = new Map<
      string,
      { avg: number; vol: number; total: number; recent: { d: string; n: number }[] }
    >();
    for (const s of hist) {
      if (!s.data?.length) continue;
      // Sort chronologically so "recent" is the latest days (AODP is usually
      // already ascending, but don't rely on it).
      const pts = [...s.data].sort((a, b) =>
        a.timestamp < b.timestamp ? -1 : 1
      );
      const total = pts.reduce((sum, d) => sum + d.item_count, 0);
      const wAvg =
        total > 0
          ? pts.reduce((sum, d) => sum + d.avg_price * d.item_count, 0) / total
          : pts.reduce((sum, d) => sum + d.avg_price, 0) / pts.length;
      stat.set(`${s.item_id}|${s.quality}|${s.location}`, {
        avg: wAvg,
        vol: total / pts.length, // average items traded per day
        total,
        // Actual items sold per day for the most recent days (the in-game
        // market-history numbers), newest last.
        recent: pts.slice(-7).map((d) => ({ d: d.timestamp.slice(5, 10), n: d.item_count })),
      });
    }
    for (const r of top) {
      const s = stat.get(`${r.id}|${r.quality}|${r.to}`);
      if (s) {
        r.avgSell = s.avg;
        r.vol = s.vol;
        r.volTotal = s.total;
        r.recent = s.recent;
      }
    }
  }

  return NextResponse.json({
    results: top,
    scanned: items.length,
    variants: items.length * enchants.length * qualities.length,
    marketA,
    marketB,
  });
}
