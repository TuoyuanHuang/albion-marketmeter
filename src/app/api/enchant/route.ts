import { NextRequest, NextResponse } from "next/server";
import { AODP_BASE, PriceRow, HistorySeries, isPriced } from "@/lib/albion";
import { enchantablesForScan, getEnchant, displayName, type Item } from "@/lib/items";

// GET /api/enchant?groups=weapons&tiers=4,5,6&steps=1,2,3&city=Caerleon
//   &tax=0.04&fee=0.025&sort=profit&incomplete=0
// Ranks item-enchanting upgrades (Base→.1 with runes, .1→.2 souls, .2→.3 relics)
// by profit: sell the higher-enchant item minus the lower item + materials.
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

async function fetchPrices(ids: string[], locations: string, qualities: string) {
  const url = new URL(`${AODP_BASE}/prices/${ids.map(encodeURIComponent).join(",")}`);
  url.searchParams.set("qualities", qualities);
  url.searchParams.set("locations", locations);
  const res = await fetch(url, {
    headers: { "User-Agent": "albion-market-app" },
    next: { revalidate: 120 },
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return (await res.json()) as PriceRow[];
}

async function fetchHistory(ids: string[], location: string, qualities: string) {
  const url = new URL(`${AODP_BASE}/history/${ids.map(encodeURIComponent).join(",")}`);
  url.searchParams.set("qualities", qualities);
  url.searchParams.set("locations", location);
  url.searchParams.set("time-scale", "24"); // daily resolution
  const res = await fetch(url, {
    headers: { "User-Agent": "albion-market-app" },
    next: { revalidate: 600 },
  });
  if (!res.ok) return [] as HistorySeries[];
  return (await res.json()) as HistorySeries[];
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const groups = csv(sp.get("groups"), "weapons");
  const subs = new Set(csv(sp.get("subs"), ""));
  const tiers = csv(sp.get("tiers"), "4,5,6,7,8").map(Number).filter((n) => n >= 1 && n <= 8);
  const steps = csv(sp.get("steps"), "1,2,3").map(Number).filter((s) => s >= 1 && s <= 3);
  const qualities = csv(sp.get("qualities"), "1").map(Number).filter((q) => q >= 1 && q <= 5);
  // Buy the lower item + materials in one city; sell the enchanted item in
  // another (or instant-sell to the Black Market).
  const buyCity = sp.get("buyCity") ?? sp.get("city") ?? "Caerleon";
  const sellCity = sp.get("sellCity") ?? sp.get("city") ?? buyCity;
  const sellToBM = sellCity === "Black Market";
  const tax = Number(sp.get("tax") ?? "0.04");
  const fee = Number(sp.get("fee") ?? "0.025");
  const includeIncomplete = sp.get("incomplete") === "1";
  const sort = sp.get("sort") === "margin" ? "margin" : "profit";

  if (!groups.length || !tiers.length || !steps.length || !qualities.length) {
    return NextResponse.json(
      { error: "Select at least one category, tier, upgrade step and quality" },
      { status: 400 }
    );
  }

  // Enchantable items in scope (deduped, capped).
  const seen = new Set<string>();
  const items: Item[] = [];
  for (const g of groups) {
    for (const it of enchantablesForScan(g, tiers, ITEM_CAP, subs)) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      items.push(it);
      if (items.length >= ITEM_CAP) break;
    }
    if (items.length >= ITEM_CAP) break;
  }
  if (items.length === 0) return NextResponse.json({ results: [], scanned: 0 });

  // Each selected "step" N is a target: enchant a base item all the way to .N,
  // so we price the base item, the .N item, and every material along the way
  // (runes for .1, souls for .2, relics for .3).
  const priceIds = new Set<string>();
  for (const it of items) {
    const up = getEnchant(it.id);
    if (!up) continue;
    priceIds.add(it.id); // base item
    for (const n of steps) {
      priceIds.add(`${it.id}@${n}`); // target (enchanted) item
      for (let s = 1; s <= n; s++) {
        const mat = up[String(s)];
        if (mat) priceIds.add(mat.id); // rune / soul / relic
      }
    }
  }

  const allIds = Array.from(priceIds);
  const batches: string[][] = [];
  for (let i = 0; i < allIds.length; i += BATCH) batches.push(allIds.slice(i, i + BATCH));

  // Materials are quality 1; items at the selected qualities. Fetch both cities.
  const qualitiesParam = Array.from(new Set([1, ...qualities])).join(",");
  const locations = Array.from(new Set([buyCity, sellCity])).join(",");
  let rows: PriceRow[];
  try {
    rows = (
      await runPool(batches.map((b) => () => fetchPrices(b, locations, qualitiesParam)), CONCURRENCY)
    ).flat();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "scan failed" }, { status: 502 });
  }

  // market[`${id}|${q}|${city}`] = { sellMin, buyMax, date }
  const market = new Map<string, { sellMin?: number; buyMax?: number; date: string }>();
  for (const r of rows) {
    const key = `${r.item_id}|${r.quality}|${r.city}`;
    const cur = market.get(key) ?? { date: "" };
    if (isPriced(r.sell_price_min)) { cur.sellMin = r.sell_price_min; cur.date = r.sell_price_min_date; }
    if (isPriced(r.buy_price_max)) { cur.buyMax = r.buy_price_max; if (!cur.date) cur.date = r.buy_price_max_date; }
    market.set(key, cur);
  }
  // What you pay to acquire an item/material (cheapest sell order in the buy city).
  const buyPrice = (id: string, q: number) => market.get(`${id}|${q}|${buyCity}`)?.sellMin;
  // What you receive selling the enchanted item: list a sell order, or instant-sell to the BM.
  const sellQuote = (id: string, q: number) => {
    const m = market.get(`${id}|${q}|${sellCity}`);
    if (!m) return undefined;
    return sellToBM ? { price: m.buyMax, date: m.date } : { price: m.sellMin, date: m.date };
  };

  // Black Market = instant sell (tax only, no setup fee).
  const feeMul = sellToBM ? 1 - tax : 1 - tax - fee;

  interface MatLine { id: string; name: string; count: number; unit: number | null; cost: number | null; }
  interface Row {
    id: string; name: string; tier: number; step: number; stepLabel: string; quality: number;
    lower: number | null; materials: MatLine[]; matCost: number | null;
    sellGross: number | null; avgSell: number | null; sellNet: number | null; cost: number | null;
    profit: number | null; margin: number | null; complete: boolean; sellDate: string;
    // Sales volume of the enchanted item at the sell market (history, filled below).
    vol: number | null; volTotal: number | null;
    lastVol: number | null; lastDate: string | null;
    recent: { d: string; n: number }[] | null;
  }
  const results: Row[] = [];
  let incompleteCount = 0;

  for (const it of items) {
    const up = getEnchant(it.id);
    if (!up) continue;
    for (const n of steps) {
      const targetId = `${it.id}@${n}`;
      // All upgrade materials from base up to .n (runes, then souls, then relics).
      const matSteps = [];
      for (let s = 1; s <= n; s++) {
        const mat = up[String(s)];
        if (mat) matSteps.push(mat);
      }
      if (matSteps.length === 0) continue;
      const materials: MatLine[] = matSteps.map((m) => {
        const unit = buyPrice(m.id, 1) ?? null;
        return { id: m.id, name: displayName(m.id), count: m.count, unit, cost: unit != null ? unit * m.count : null };
      });
      const matMissing = materials.some((m) => m.cost == null);
      const matCost = matMissing ? null : materials.reduce((s, m) => s + (m.cost ?? 0), 0);

      for (const q of qualities) {
        // Enchanting preserves quality: buy a quality-q base item, sell a quality-q .n item.
        const lower = buyPrice(it.id, q) ?? null;
        const quote = sellQuote(targetId, q);
        const sellGross = quote?.price ?? null;
        const complete = lower != null && !matMissing && sellGross != null;
        if (!complete) {
          incompleteCount++;
          if (!includeIncomplete) continue;
        }

        const cost = lower != null && matCost != null ? lower + matCost : null;
        const sellNet = sellGross != null ? sellGross * feeMul : null;
        const profit = sellNet != null && cost != null ? sellNet - cost : null;
        const margin = profit != null && cost ? profit / cost : null;

        results.push({
          id: targetId,
          name: displayName(it.id),
          tier: it.tier,
          step: n,
          stepLabel: `Base → .${n}`,
          quality: q,
          lower,
          materials,
          matCost,
          sellGross,
          avgSell: null,
          sellNet,
          cost,
          profit,
          margin,
          complete,
          sellDate: quote?.date ?? "",
          vol: null,
          volTotal: null,
          lastVol: null,
          lastDate: null,
          recent: null,
        });
      }
    }
  }

  const key = (r: Row) => {
    const x = r[sort];
    return x == null ? -Infinity : x;
  };
  results.sort((a, b) => key(b) - key(a));
  const top = results.slice(0, 100);

  // Daily sales volume of the enchanted item at the sell market (history),
  // fetched only for the items shown.
  const todayUTC = new Date().toISOString().slice(0, 10);
  const histIds = Array.from(new Set(top.map((r) => r.id)));
  if (histIds.length) {
    const histBatches: string[][] = [];
    for (let i = 0; i < histIds.length; i += BATCH) histBatches.push(histIds.slice(i, i + BATCH));
    let hist: HistorySeries[] = [];
    try {
      hist = (
        await runPool(
          histBatches.map((b) => () => fetchHistory(b, sellCity, qualitiesParam)),
          CONCURRENCY
        )
      ).flat();
    } catch {
      hist = [];
    }
    // id|quality|location -> { avg sell price + volume stats }.
    const stat = new Map<
      string,
      { avg: number; vol: number; total: number; lastVol: number; lastDate: string; recent: { d: string; n: number }[] }
    >();
    for (const s of hist) {
      if (!s.data?.length) continue;
      const pts = [...s.data].sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
      const total = pts.reduce((sum, d) => sum + d.item_count, 0);
      const avg =
        total > 0
          ? pts.reduce((sum, d) => sum + d.avg_price * d.item_count, 0) / total
          : pts.reduce((sum, d) => sum + d.avg_price, 0) / pts.length;
      // Last completed day = newest point that isn't today's partial bucket.
      const complete = pts.filter((d) => d.timestamp.slice(0, 10) < todayUTC);
      const lastPt = (complete.length ? complete : pts)[
        (complete.length ? complete : pts).length - 1
      ];
      stat.set(`${s.item_id}|${s.quality}|${s.location}`, {
        avg,
        vol: total / pts.length,
        total,
        lastVol: lastPt.item_count,
        lastDate: lastPt.timestamp.slice(5, 10),
        recent: pts.slice(-7).map((d) => ({ d: d.timestamp.slice(5, 10), n: d.item_count })),
      });
    }
    for (const r of top) {
      const s = stat.get(`${r.id}|${r.quality}|${sellCity}`);
      if (s) {
        r.vol = s.vol;
        r.volTotal = s.total;
        r.lastVol = s.lastVol;
        r.lastDate = s.lastDate;
        r.recent = s.recent;
        r.avgSell = s.avg;
        // Recompute profit from the historical average sell price (avoids
        // inflated one-off listings). Falls back to the current price otherwise.
        if (r.complete && r.cost != null) {
          r.sellNet = s.avg * feeMul;
          r.profit = r.sellNet - r.cost;
          r.margin = r.cost ? r.profit / r.cost : null;
        }
      }
    }
    // Re-rank with the average-based profit now applied.
    top.sort((a, b) => key(b) - key(a));
  }

  return NextResponse.json({
    results: top,
    scanned: items.length,
    priced: results.filter((r) => r.complete).length,
    incomplete: incompleteCount,
    buyCity,
    sellCity,
  });
}
