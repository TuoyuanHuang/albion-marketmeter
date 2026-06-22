import { NextRequest, NextResponse } from "next/server";
import { AODP_BASE, PriceRow, isPriced } from "@/lib/albion";
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

  // Every id we need a price for: the lower item, the higher item, and the
  // upgrade material for each selected step.
  const priceIds = new Set<string>();
  for (const it of items) {
    const up = getEnchant(it.id);
    if (!up) continue;
    for (const s of steps) {
      const mat = up[String(s)];
      if (!mat) continue;
      priceIds.add(s === 1 ? it.id : `${it.id}@${s - 1}`); // lower item
      priceIds.add(`${it.id}@${s}`); // higher (enchanted) item
      priceIds.add(mat.id); // rune / soul / relic
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

  const STEP_LABEL: Record<number, string> = { 1: "Base → .1", 2: ".1 → .2", 3: ".2 → .3" };
  // Black Market = instant sell (tax only, no setup fee).
  const feeMul = sellToBM ? 1 - tax : 1 - tax - fee;

  interface Row {
    id: string; name: string; tier: number; step: number; stepLabel: string; quality: number;
    lowerId: string; lower: number | null;
    matId: string; matName: string; matCount: number; matUnit: number | null; matCost: number | null;
    sellGross: number | null; sellNet: number | null; cost: number | null;
    profit: number | null; margin: number | null; complete: boolean; sellDate: string;
  }
  const results: Row[] = [];
  let incompleteCount = 0;

  for (const it of items) {
    const up = getEnchant(it.id);
    if (!up) continue;
    for (const s of steps) {
      const mat = up[String(s)];
      if (!mat) continue;
      const lowerId = s === 1 ? it.id : `${it.id}@${s - 1}`;
      const higherId = `${it.id}@${s}`;
      // Material (rune/soul/relic) is always normal quality, bought in the buy city.
      const matUnit = buyPrice(mat.id, 1) ?? null;

      for (const q of qualities) {
        // Enchanting preserves quality: buy a quality-q lower item, sell a quality-q higher item.
        const lower = buyPrice(lowerId, q) ?? null;
        const quote = sellQuote(higherId, q);
        const sellGross = quote?.price ?? null;
        const complete = lower != null && matUnit != null && sellGross != null;
        if (!complete) {
          incompleteCount++;
          if (!includeIncomplete) continue;
        }

        const matCost = matUnit != null ? matUnit * mat.count : null;
        const cost = lower != null && matCost != null ? lower + matCost : null;
        const sellNet = sellGross != null ? sellGross * feeMul : null;
        const profit = sellNet != null && cost != null ? sellNet - cost : null;
        const margin = profit != null && cost ? profit / cost : null;

        results.push({
          id: higherId,
          name: displayName(it.id),
          tier: it.tier,
          step: s,
          stepLabel: STEP_LABEL[s],
          quality: q,
          lowerId,
          lower,
          matId: mat.id,
          matName: displayName(mat.id),
          matCount: mat.count,
          matUnit,
          matCost,
          sellGross,
          sellNet,
          cost,
          profit,
          margin,
          complete,
          sellDate: quote?.date ?? "",
        });
      }
    }
  }

  const key = (r: Row) => {
    const x = r[sort];
    return x == null ? -Infinity : x;
  };
  results.sort((a, b) => key(b) - key(a));

  return NextResponse.json({
    results: results.slice(0, 100),
    scanned: items.length,
    priced: results.filter((r) => r.complete).length,
    incomplete: incompleteCount,
    buyCity,
    sellCity,
  });
}
