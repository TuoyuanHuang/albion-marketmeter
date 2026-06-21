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
  // Buy materials in one city; sell the product in another (or the Black Market).
  const buyCity = sp.get("buyCity") ?? sp.get("city") ?? "Caerleon";
  const sellCity = sp.get("sellCity") ?? sp.get("city") ?? buyCity;
  const sellToBM = sellCity === "Black Market";
  const includeIncomplete = sp.get("incomplete") === "1";
  const rr = Math.max(0, Math.min(0.5, Number(sp.get("rr") ?? "0.152")));
  const tax = Number(sp.get("tax") ?? "0.04");
  const fee = Number(sp.get("fee") ?? "0.025");
  const useJournals = sp.get("journals") !== "0";
  const quantity = Math.max(1, Number(sp.get("quantity") ?? "100"));
  const minVol = Math.max(0, Number(sp.get("minVol") ?? "0"));
  const volPeriod = sp.get("volPeriod") === "week" ? "week" : "day";
  // Volume is reported and filtered in the selected period's units (×7 for a week).
  const volMult = volPeriod === "week" ? 7 : 1;
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

  // Fetch both cities at once; pick the right city per role afterwards.
  const locations = Array.from(new Set([buyCity, sellCity])).join(",");
  let rows: PriceRow[];
  try {
    rows = (
      await runPool(priceBatches.map((b) => () => fetchPrices(b, locations, qualitiesParam)), CONCURRENCY)
    ).flat();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "scan failed" }, { status: 502 });
  }

  // market[`${id}|${q}|${city}`] = { sellMin, buyMax, date }
  const market = new Map<string, { sellMin?: number; buyMax?: number; date: string }>();
  for (const r of rows) {
    const key = `${r.item_id}|${r.quality}|${r.city}`;
    const cur = market.get(key) ?? { date: "" };
    if (isPriced(r.sell_price_min)) {
      cur.sellMin = r.sell_price_min;
      cur.date = r.sell_price_min_date;
    }
    if (isPriced(r.buy_price_max)) {
      cur.buyMax = r.buy_price_max;
      if (!cur.date) cur.date = r.buy_price_max_date;
    }
    market.set(key, cur);
  }
  const buyPrice = (id: string, q: number) => market.get(`${id}|${q}|${buyCity}`)?.sellMin;
  // What you receive selling the product: list a sell order in a city, or instant-sell to the BM.
  const sellQuote = (id: string, q: number) => {
    const m = market.get(`${id}|${q}|${sellCity}`);
    if (!m) return undefined;
    return sellToBM ? { price: m.buyMax, date: m.date } : { price: m.sellMin, date: m.date };
  };

  interface Variant {
    id: string; name: string; tier: number; enchant: number; quality: number;
    journal: string | null; fame: number;
    sell: number | null; sellDate: string; matCost: number | null; net: number | null;
    journalProfit: number; profit: number | null; total: number | null; journals: number;
    margin: number | null; volume: number; avgSell: number | null; complete: boolean;
    // Raw per-craft inputs kept so we can recompute the profit from the historical
    // average sell price once it's fetched. Stripped before the response.
    _matSum: number; _silver: number; _amount: number; _jpc: number;
  }
  const variants: Variant[] = [];
  let incompleteCount = 0;

  // Fee multiplier on the sale: Black Market is instant-sell (tax only, no setup fee).
  const feeMul = sellToBM ? 1 - tax : 1 - tax - fee;

  for (const it of items) {
    for (const e of enchants) {
      const r = recipeFor(it.id, e);
      if (!r) continue;
      const productId = it.id + (e > 0 ? `@${e}` : "");

      // Material cost after return rate (materials bought in buyCity, normal quality).
      let matSum = 0;
      let matMissing = false;
      for (const res of r.res) {
        const p = buyPrice(res.id, 1);
        if (!isPriced(p)) { matMissing = true; break; }
        matSum += p * res.count * (1 - rr);
      }
      const matCost = matMissing ? null : matSum;
      const totalCost = matMissing ? null : matSum + r.silver;

      // Journal value per fame (empty bought + full sold in buyCity).
      let perFame = 0;
      if (useJournals && r.journal && r.fame) {
        const base = `T${it.tier}_JOURNAL_${r.journal}`;
        const maxFame = JOURNALS[r.journal]?.[it.tier];
        const full = buyPrice(`${base}_FULL`, 1);
        const empty = buyPrice(base, 1);
        if (maxFame && isPriced(full)) {
          const emptyCost = isPriced(empty) ? empty : 0;
          perFame = (full * (1 - tax - fee) - emptyCost) / maxFame;
        }
      }
      const journalProfitPerCraft = r.fame * perFame;
      const maxFame = r.journal ? JOURNALS[r.journal]?.[it.tier] ?? 0 : 0;
      const journalsFilled = maxFame ? (r.fame * quantity) / maxFame : 0;

      for (const q of qualities) {
        const quote = sellQuote(productId, q);
        const productPrice = quote?.price;
        const productOk = isPriced(productPrice);
        const complete = !matMissing && productOk;
        if (!complete && !includeIncomplete) { incompleteCount++; continue; }
        if (!complete) incompleteCount++;

        const revenue = productOk ? productPrice! * r.amount * feeMul : null;
        const profitPerCraft =
          complete ? revenue! + journalProfitPerCraft - totalCost! : null;
        const amount = r.amount || 1;
        variants.push({
          id: productId, name: displayName(it.id), tier: it.tier, enchant: e, quality: q,
          journal: r.journal, fame: r.fame,
          sell: productOk ? productPrice! : null,
          sellDate: quote?.date ?? "",
          matCost: matCost != null ? matCost / amount : null,
          net: revenue != null ? revenue / amount : null,
          journalProfit: journalProfitPerCraft / amount,
          profit: profitPerCraft != null ? profitPerCraft / amount : null,
          total: profitPerCraft != null ? (profitPerCraft / amount) * quantity : null,
          journals: journalsFilled,
          margin: profitPerCraft != null && totalCost ? profitPerCraft / totalCost : null,
          volume: 0, avgSell: null, complete,
          _matSum: matSum, _silver: r.silver, _amount: amount, _jpc: journalProfitPerCraft,
        });
      }
    }
  }

  // Rank complete variants by profit first; incomplete (manual-entry) ones last.
  const rank = (v: Variant) => (v.profit == null ? -Infinity : v.profit);
  variants.sort((a, b) => rank(b) - rank(a));
  const candidates = variants.slice(0, VOL_CANDIDATES);

  // Sales volume where you sell (avg items sold per day).
  const volIds = Array.from(new Set(candidates.map((v) => v.id)));
  const volBatches: string[][] = [];
  for (let i = 0; i < volIds.length; i += BATCH) volBatches.push(volIds.slice(i, i + BATCH));
  const histSeries = (
    await runPool(volBatches.map((b) => () => fetchHistory(b, sellCity, qualitiesParam)), CONCURRENCY)
  ).flat();
  const volume = new Map<string, number>();
  const avgSell = new Map<string, number>(); // volume-weighted average sell price
  for (const s of histSeries) {
    if (!s.data?.length) continue;
    const key = `${s.item_id}|${s.quality}`;
    const totalVol = s.data.reduce((sum, d) => sum + d.item_count, 0);
    volume.set(key, totalVol / s.data.length);
    const weighted = s.data.reduce((sum, d) => sum + d.avg_price * d.item_count, 0);
    avgSell.set(
      key,
      totalVol > 0
        ? weighted / totalVol
        : s.data.reduce((sum, d) => sum + d.avg_price, 0) / s.data.length
    );
  }
  for (const v of candidates) {
    // Daily average × period multiplier → volume in the selected unit (per day/week).
    v.volume = (volume.get(`${v.id}|${v.quality}`) ?? 0) * volMult;
    v.avgSell = avgSell.get(`${v.id}|${v.quality}`) ?? null;

    // Recompute Net/Profit/Total/Margin from the historical average sell price so a
    // single inflated listing can't distort the numbers. When there's no history we
    // keep the current-price figures already computed above (best available).
    if (v.complete && v.avgSell != null) {
      const revenue = v.avgSell * v._amount * feeMul;
      const totalCost = v._matSum + v._silver;
      const profitPerCraft = revenue + v._jpc - totalCost;
      v.net = revenue / v._amount;
      v.profit = profitPerCraft / v._amount;
      v.total = (profitPerCraft / v._amount) * quantity;
      v.margin = totalCost ? profitPerCraft / totalCost : null;
    }
  }

  // Filter uses the same period units as the column, so the input and column agree.
  let result = candidates;
  if (minVol > 0) result = result.filter((v) => v.complete && v.volume >= minVol);

  const sortKey = (v: Variant) => {
    const x = v[sort];
    return x == null ? -Infinity : x;
  };
  result.sort((a, b) => sortKey(b) - sortKey(a));

  // Drop the internal recompute helpers before sending.
  const out = result.slice(0, 100).map((v) => {
    const c = { ...v };
    delete (c as Partial<Variant>)._matSum;
    delete (c as Partial<Variant>)._silver;
    delete (c as Partial<Variant>)._amount;
    delete (c as Partial<Variant>)._jpc;
    return c;
  });

  return NextResponse.json({
    results: out,
    scanned: items.length,
    priced: variants.filter((v) => v.complete).length,
    incomplete: incompleteCount,
    buyCity,
    sellCity,
    quantity,
    volPeriod,
  });
}
