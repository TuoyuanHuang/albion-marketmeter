import { NextRequest, NextResponse } from "next/server";
import { AODP_BASE, PriceRow, isPriced } from "@/lib/albion";
import { getRecipe, getItem, displayName, JOURNALS } from "@/lib/items";

// GET /api/craft-detail?item=T6_2H_AXE&enchant=1&quality=1&city=Caerleon
// Returns the recipe used for one (item, enchant) plus current market prices for
// the product, every material, and the journals — so the client can let the
// user override prices and recompute.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const item = sp.get("item");
  const enchant = Math.max(0, Math.min(3, Number(sp.get("enchant") ?? "0")));
  const quality = Math.max(1, Math.min(5, Number(sp.get("quality") ?? "1")));
  const city = sp.get("city") ?? "Caerleon";
  if (!item) {
    return NextResponse.json({ error: "item required" }, { status: 400 });
  }

  const base = getRecipe(item);
  if (!base) {
    return NextResponse.json({ error: "no recipe" }, { status: 404 });
  }
  const er = enchant > 0 ? base.ench?.[String(enchant)] : null;
  if (enchant > 0 && !er) {
    return NextResponse.json({ error: "no recipe at this enchant" }, { status: 404 });
  }
  const resources = er ? er.resources : base.resources;
  const silver = er ? er.silver : base.silver;
  const fame = (er ? er.fame : base.fame) ?? 0;
  const journal = base.journal ?? null;
  const amount = base.amount || 1;
  const tier = getItem(item)?.tier ?? 0;
  const productId = item + (enchant > 0 ? `@${enchant}` : "");

  // Journal ids for this item's profession + tier.
  let journalInfo: null | {
    profession: string;
    maxFame: number;
    emptyId: string;
    fullId: string;
  } = null;
  if (journal && JOURNALS[journal]?.[tier]) {
    const baseJ = `T${tier}_JOURNAL_${journal}`;
    journalInfo = {
      profession: journal,
      maxFame: JOURNALS[journal][tier],
      emptyId: baseJ,
      fullId: `${baseJ}_FULL`,
    };
  }

  // Price everything (products at chosen quality, the rest at quality 1).
  const ids = [
    productId,
    ...resources.map((r) => r.id),
    ...(journalInfo ? [journalInfo.emptyId, journalInfo.fullId] : []),
  ];
  const url = new URL(`${AODP_BASE}/prices/${ids.map(encodeURIComponent).join(",")}`);
  url.searchParams.set("qualities", Array.from(new Set([1, quality])).join(","));
  url.searchParams.set("locations", city);

  let rows: PriceRow[] = [];
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "albion-market-app" },
      next: { revalidate: 60 },
    });
    if (res.ok) rows = (await res.json()) as PriceRow[];
  } catch {
    /* leave prices empty -> user can fill manually */
  }

  const price = new Map<string, { price: number; date: string }>();
  for (const r of rows) {
    if (!isPriced(r.sell_price_min)) continue;
    // product keyed by quality; materials/journals are quality 1.
    const key = `${r.item_id}|${r.quality}`;
    price.set(key, { price: r.sell_price_min, date: r.sell_price_min_date });
  }
  const at = (id: string, q: number) => price.get(`${id}|${q}`);

  return NextResponse.json({
    item,
    name: displayName(item),
    tier,
    enchant,
    quality,
    amount,
    silver,
    fame,
    journal,
    city,
    product: { id: productId, ...(at(productId, quality) ?? { price: 0, date: "" }) },
    resources: resources.map((r) => ({
      id: r.id,
      name: displayName(r.id),
      count: r.count,
      ...(at(r.id, 1) ?? { price: 0, date: "" }),
    })),
    journalInfo: journalInfo
      ? {
          ...journalInfo,
          empty: at(journalInfo.emptyId, 1) ?? { price: 0, date: "" },
          full: at(journalInfo.fullId, 1) ?? { price: 0, date: "" },
        }
      : null,
  });
}
