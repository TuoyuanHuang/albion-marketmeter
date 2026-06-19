import { NextRequest, NextResponse } from "next/server";
import { AODP_BASE, PriceRow, HistorySeries, isPriced } from "@/lib/albion";
import {
  craftablesForScan,
  getRecipe,
  displayName,
  JOURNALS,
} from "@/lib/items";

// GET /api/craft-suggest?groups=weapons&tiers=4,5&city=Caerleon&qualities=1,2
//   &enchants=0,1&rr=0.15&tax=0.04&fee=0.025&journals=1&quantity=100
//   &minVol=5&volPeriod=day&sort=profit
// Ranks craftable (item × enchant × quality) variants by profit per craft,
// including return rate, journal value, and an optional sales-volume filter.
export const dynamic = "force-dynamic";

const BATCH = 100;
const ITEM_CAP = 600;
const CONCURRENCY = 6;
const VOL_CANDIDATES = 300; // variants we fetch sales volume for

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
  const url = new URL(`${AODP_BASE}/prices/${ids.map(encodeURIComponent).join(",")}`);
  url.searchParams.set("qualities", qualities);
  url.searchParams.set("locations", city);
  const res = await fetch(url, {
    headers: { "User-Agent": "albion-market-app" },
    next: { revalidate: 120 },
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return (await res.json()) as PriceRow[];
}

async function fetchHistory(ids: string[], city: string, qualities: string) {
  const url = new URL(`${AODP_BASE}/history/${ids.map(encodeURIComponent).join(",")}`);
  url.searchParams.set("qualities", qualities);
  url.searchParams.set("locations", city);
  url.searchParams.set("time-scale", "24");
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
  const qualities = csv(sp.get("qualities"), "1").map(Number).filter((q) => q >= 1 && q <= 5);
  const enchants = csv(sp.get("enchants"), "0").map(Number).filter((e) => e >= 0 && e <= 3);
  const city = sp.get("city") ?? "Caerleon";
  const rr = Math.max(0, Math.min(0.5, Number(sp.get("rr") ?? "0.152")));
  const tax = Number(sp.get("tax") ?? "0.04");
  const fee = Number(sp.get("fee") ?? "0.025");
  const useJournals = sp.get("journals") !== "0";
  const quantity = Math.max(1, Number(sp.get("quantity") ?? "100"));
  const minVol = Math.max(0, Number(sp.get("minVol") ?? "0"));
  const volPeriod = sp.get("volPeriod") === "week" ? "week" : "day";
  const minDaily = volPeriod === "week" ? minVol / 7 : minVol;
  const sort = (["profit", "margin", "total"] as const).includes(
    sp.get("sort") as never
  )
    ? (sp.get("sort") as "profit" | "margin" | "total")
    : "profit";

  if (!groups.length || !tiers.length || !qualities.length || !enchants.length) {
    return NextResponse.json(
      { error: "Select at least one category, tier, quality and enchantment" },
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
  if (items.length === 0) return NextResponse.json({ results: [], scanned: 0 });

  // Resolve the recipe for an (item, enchant) pair (null if that enchant has no recipe).
  const recipeFor = (id: string, e: number) => {
    const base = getRecipe(id);
    if (!base) return null;
    if (e === 0) return { res: base.resources, silver: base.silver, fame: base.fame ?? 0, journal: base.journal ?? null, amount: base.amount || 1 };
    const er = base.ench?.[String(e)];
    if (!er) return null;
    return { res: er.resources, silver: er.silver, fame: er.fame, journal: base.journal ?? null, amount: base.amount || 1 };
  };

  // Collect every id we need a price for.
  const priceIds = new Set<string>();
  const journalIds = new Set<string>();
  for (const it of items) {
    for (const e of enchants) {
      const r = recipeFor(it.id, e);
      if (!r) continue;
      priceIds.add(it.id + (e > 0 ? `@${e}` : "")); // product
      for (const res of r.res) priceIds.add(res.id); // materials
      if (useJournals && r.journal && JOURNALS[r.journal]?.[it.tier]) {
        const base = `T${it.tier}_JOURNAL_${r.journal}`;
        journalIds.add(base);
        journalIds.add(`${base}_FULL`);
      }
    }
  }
  for (const j of journalIds) priceIds.add(j);

  const qualitiesParam = Array.from(new Set([1, ...qualities])).join(",");
  const allIds = Array.from(priceIds);
  const priceBatches: string[][] = [];
  for (let i = 0; i < allIds.length; i += BATCH) priceBatches.push(allIds.slice(i, i + BATCH));

  let rows: PriceRow[];
  try {
    rows = (
      await runPool(priceBatches.map((b) => () => fetchPrices(b, city, qualitiesParam)), CONCURRENCY)
    ).flat();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "scan failed" }, { status: 502 });
  }

  const price = new Map<string, Map<number, number>>();
  const pdate = new Map<string, Map<number, string>>();
  for (const r of rows) {
    if (!isPriced(r.sell_price_min)) continue;
    (price.get(r.item_id) ?? price.set(r.item_id, new Map()).get(r.item_id)!).set(r.quality, r.sell_price_min);
    (pdate.get(r.item_id) ?? pdate.set(r.item_id, new Map()).get(r.item_id)!).set(r.quality, r.sell_price_min_date);
  }
  const priceAt = (id: string, q: number) => price.get(id)?.get(q);

  interface Variant {
    id: string; name: string; tier: number; enchant: number; quality: number;
    journal: string | null; fame: number;
    sell: number; sellDate: string; matCost: number; net: number;
    journalProfit: number; profit: number; total: number; journals: number;
    margin: number; volume: number;
  }
  const variants: Variant[] = [];
  let missing = 0;

  for (const it of items) {
    for (const e of enchants) {
      const r = recipeFor(it.id, e);
      if (!r) continue;
      const productId = it.id + (e > 0 ? `@${e}` : "");

      // Material cost after return rate (materials are normal quality).
      let matCost = 0;
      let incomplete = false;
      for (const res of r.res) {
        const p = priceAt(res.id, 1);
        if (!isPriced(p)) { incomplete = true; break; }
        matCost += p * res.count * (1 - rr);
      }
      if (incomplete) continue;
      const totalCost = matCost + r.silver;

      // Journal value per fame, and journals filled for the chosen quantity.
      let perFame = 0;
      if (useJournals && r.journal && r.fame) {
        const base = `T${it.tier}_JOURNAL_${r.journal}`;
        const maxFame = JOURNALS[r.journal]?.[it.tier];
        const full = priceAt(`${base}_FULL`, 1);
        const empty = priceAt(base, 1);
        if (maxFame && isPriced(full)) {
          const emptyCost = isPriced(empty) ? empty : 0;
          perFame = (full * (1 - tax - fee) - emptyCost) / maxFame;
        }
      }
      const journalProfitPerCraft = r.fame * perFame;
      const maxFame = r.journal ? JOURNALS[r.journal]?.[it.tier] ?? 0 : 0;
      const journalsFilled = maxFame ? (r.fame * quantity) / maxFame : 0;

      for (const q of qualities) {
        const productPrice = priceAt(productId, q);
        if (!isPriced(productPrice)) { missing++; continue; }
        const revenue = productPrice * r.amount * (1 - tax - fee);
        const profitPerCraft = revenue + journalProfitPerCraft - totalCost;
        const profit = profitPerCraft / r.amount;
        variants.push({
          id: productId, name: displayName(it.id), tier: it.tier, enchant: e, quality: q,
          journal: r.journal, fame: r.fame,
          sell: productPrice, sellDate: pdate.get(productId)?.get(q) ?? "",
          matCost: matCost / r.amount, net: revenue / r.amount,
          journalProfit: journalProfitPerCraft / r.amount,
          profit, total: profit * quantity, journals: journalsFilled,
          margin: totalCost > 0 ? profitPerCraft / totalCost : 0,
          volume: 0,
        });
      }
    }
  }

  // Sales volume for the strongest candidates (avg items sold per day in `city`).
  variants.sort((a, b) => b.profit - a.profit);
  const candidates = variants.slice(0, VOL_CANDIDATES);
  const volIds = Array.from(new Set(candidates.map((v) => v.id)));
  const volBatches: string[][] = [];
  for (let i = 0; i < volIds.length; i += BATCH) volBatches.push(volIds.slice(i, i + BATCH));
  const histSeries = (
    await runPool(volBatches.map((b) => () => fetchHistory(b, city, qualitiesParam)), CONCURRENCY)
  ).flat();
  const volume = new Map<string, number>(); // `${id}|${quality}` -> avg daily volume
  for (const s of histSeries) {
    if (!s.data?.length) continue;
    const avg = s.data.reduce((sum, d) => sum + d.item_count, 0) / s.data.length;
    volume.set(`${s.item_id}|${s.quality}`, avg);
  }
  for (const v of candidates) v.volume = volume.get(`${v.id}|${v.quality}`) ?? 0;

  // Volume filter applies only to the candidates we have volume for.
  let result = candidates;
  if (minDaily > 0) result = result.filter((v) => v.volume >= minDaily);

  result.sort((a, b) => b[sort] - a[sort]);

  return NextResponse.json({
    results: result.slice(0, 100),
    scanned: items.length,
    priced: variants.length,
    missing,
    city,
    quantity,
  });
}
