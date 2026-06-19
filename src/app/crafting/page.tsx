"use client";

import { useMemo, useState } from "react";
import ItemSearch, { ItemHit } from "@/components/ItemSearch";
import {
  TRADE_CITIES,
  QUALITIES,
  DEFAULT_SALES_TAX,
  DEFAULT_SETUP_FEE,
  PriceRow,
  isPriced,
  fmt,
} from "@/lib/albion";

interface Recipe {
  resources: { id: string; count: number }[];
  silver: number;
  focus: number;
  amount: number;
}
interface RecipeResp {
  item: string;
  recipes: Record<string, Recipe>;
  names: Record<string, string>;
}

export default function CraftingPage() {
  const [item, setItem] = useState<ItemHit | null>(null);
  const [recipeData, setRecipeData] = useState<RecipeResp | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [city, setCity] = useState("Caerleon");
  const [quality, setQuality] = useState(1);
  const [returnRate, setReturnRate] = useState(15.2);
  const [salesTax, setSalesTax] = useState(DEFAULT_SALES_TAX * 100);
  const [setupFee, setSetupFee] = useState(DEFAULT_SETUP_FEE * 100);
  const [stationFee, setStationFee] = useState(0);
  const [recurse, setRecurse] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load(it: ItemHit, opts?: { city?: string; quality?: number }) {
    const c = opts?.city ?? city;
    const q = opts?.quality ?? quality;
    setItem(it);
    setLoading(true);
    setErr(null);
    try {
      const rr = await fetch(`/api/recipe?item=${it.id}`);
      if (rr.status === 404) {
        setRecipeData(null);
        setErr("This item has no crafting recipe.");
        return;
      }
      if (!rr.ok) throw new Error(`recipe API ${rr.status}`);
      const data = (await rr.json()) as RecipeResp;
      setRecipeData(data);

      // Price every item involved (the product + all transitive resources).
      const ids = Array.from(
        new Set([
          it.id,
          ...Object.keys(data.recipes),
          ...Object.values(data.recipes).flatMap((r) =>
            r.resources.map((x) => x.id)
          ),
        ])
      );
      const pr = await fetch(
        `/api/prices?items=${ids.join(",")}&qualities=${q}&locations=${encodeURIComponent(
          c
        )}`
      );
      if (!pr.ok) throw new Error(`prices API ${pr.status}`);
      const rows = (await pr.json()) as PriceRow[];
      const map: Record<string, number> = {};
      for (const row of rows) {
        if (isPriced(row.sell_price_min)) map[row.item_id] = row.sell_price_min;
      }
      setPrices(map);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  const rrr = returnRate / 100;
  const tax = salesTax / 100;
  const fee = setupFee / 100;

  // Per-unit acquisition cost. With `recurse`, sub-materials are crafted when
  // that is cheaper than buying them; otherwise we always buy.
  const cost = useMemo(() => {
    if (!recipeData || !item)
      return null as null | {
        perItem: number;
        breakdown: {
          id: string;
          name: string;
          count: number;
          unit: number;
          crafted: boolean;
          line: number;
        }[];
        materials: number;
        revenue: number;
        profit: number;
        margin: number;
      };

    const { recipes, names } = recipeData;
    const memo = new Map<string, number>();

    const acquire = (id: string, stack: Set<string>): number => {
      if (memo.has(id)) return memo.get(id)!;
      const buy = prices[id] ?? Infinity;
      const r = recipes[id];
      let craft = Infinity;
      if (recurse && r && !stack.has(id)) {
        const next = new Set(stack).add(id);
        const matCost = r.resources.reduce(
          (s, res) => s + acquire(res.id, next) * res.count * (1 - rrr),
          0
        );
        craft = (matCost + r.silver) / r.amount;
      }
      const v = Math.min(buy, craft);
      memo.set(id, v);
      return v;
    };

    const root = recipes[item.id];
    if (!root) return null;

    const breakdown = root.resources.map((res) => {
      const buy = prices[res.id] ?? Infinity;
      const unit = recurse ? acquire(res.id, new Set([item.id])) : buy;
      const eff = res.count * (1 - rrr);
      return {
        id: res.id,
        name: names[res.id] ?? res.id,
        count: res.count,
        unit: isFinite(unit) ? unit : 0,
        crafted: recurse && isFinite(unit) && unit < buy,
        line: isFinite(unit) ? unit * eff : 0,
      };
    });

    const materials =
      breakdown.reduce((s, b) => s + b.line, 0) + root.silver + stationFee;
    const perItem = materials / root.amount;
    const sell = prices[item.id] ?? 0;
    const revenue = sell * (1 - tax - fee);
    const profit = revenue - perItem;
    const margin = perItem > 0 ? profit / perItem : 0;

    return { perItem, breakdown, materials, revenue, profit, margin };
  }, [recipeData, item, prices, rrr, tax, fee, stationFee, recurse]);

  const noRecipe = item && !recipeData && !loading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Crafting Calculator</h1>
        <p className="text-sm text-ao-muted">
          Material cost vs sell price, including return rate and market fees.
        </p>
      </div>

      <ItemSearch
        onSelect={(it) => load(it)}
        placeholder="Search a craftable item… (e.g. Adept's Bag, T6 Axe)"
      />

      <div className="flex flex-wrap items-end gap-3 text-xs text-ao-muted">
        <label className="flex flex-col gap-1">
          City
          <select
            value={city}
            onChange={(e) => {
              setCity(e.target.value);
              if (item) load(item, { city: e.target.value });
            }}
            className="rounded border border-ao-border bg-ao-bg px-2 py-1.5 text-sm text-white"
          >
            {TRADE_CITIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Quality
          <select
            value={quality}
            onChange={(e) => {
              const q = Number(e.target.value);
              setQuality(q);
              if (item) load(item, { quality: q });
            }}
            className="rounded border border-ao-border bg-ao-bg px-2 py-1.5 text-sm text-white"
          >
            {QUALITIES.map((q) => (
              <option key={q.value} value={q.value}>
                {q.label}
              </option>
            ))}
          </select>
        </label>
        <NumField label="Return %" value={returnRate} onChange={setReturnRate} />
        <NumField label="Tax %" value={salesTax} onChange={setSalesTax} />
        <NumField label="Setup %" value={setupFee} onChange={setSetupFee} />
        <NumField label="Station fee" value={stationFee} onChange={setStationFee} width="w-24" />
        <label className="flex items-center gap-2 pb-1.5 text-white">
          <input
            type="checkbox"
            checked={recurse}
            onChange={(e) => setRecurse(e.target.checked)}
          />
          Craft sub-materials when cheaper
        </label>
      </div>

      {err && <div className="text-sm text-ao-red">{err}</div>}
      {loading && <div className="text-sm text-ao-muted">Loading…</div>}
      {noRecipe && (
        <div className="text-sm text-ao-muted">
          No recipe available for this item.
        </div>
      )}

      {item && recipeData && cost && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Material cost / item" value={fmt(cost.perItem)} />
            <Stat
              label="Sell price (net)"
              value={fmt(cost.revenue)}
              sub={`@ ${fmt(prices[item.id])} gross`}
            />
            <Stat
              label="Profit / item"
              value={fmt(cost.profit)}
              tone={cost.profit >= 0 ? "good" : "bad"}
            />
            <Stat
              label="Margin"
              value={`${(cost.margin * 100).toFixed(1)}%`}
              tone={cost.margin >= 0 ? "good" : "bad"}
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-ao-border">
            <table className="w-full text-sm">
              <thead className="bg-ao-panel text-left text-ao-muted">
                <tr>
                  <th className="px-3 py-2">Material</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Unit price</th>
                  <th className="px-3 py-2 text-right">
                    Cost (after {returnRate}% return)
                  </th>
                </tr>
              </thead>
              <tbody>
                {cost.breakdown.map((b) => (
                  <tr key={b.id} className="border-t border-ao-border">
                    <td className="px-3 py-2">
                      {b.name}
                      {b.crafted && (
                        <span className="ml-2 rounded bg-ao-gold/20 px-1.5 text-xs text-ao-gold">
                          crafted
                        </span>
                      )}
                      <span className="ml-2 font-mono text-xs text-ao-muted">
                        {b.id}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">{b.count}</td>
                    <td className="px-3 py-2 text-right">{fmt(b.unit)}</td>
                    <td className="px-3 py-2 text-right">{fmt(b.line)}</td>
                  </tr>
                ))}
                <tr className="border-t border-ao-border text-ao-muted">
                  <td className="px-3 py-2">Crafting silver + station fee</td>
                  <td />
                  <td />
                  <td className="px-3 py-2 text-right">
                    {fmt((recipeData.recipes[item.id]?.silver ?? 0) + stationFee)}
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="border-t border-ao-border bg-ao-panel font-medium">
                  <td className="px-3 py-2" colSpan={3}>
                    Total ({recipeData.recipes[item.id]?.amount ?? 1} produced)
                  </td>
                  <td className="px-3 py-2 text-right">{fmt(cost.materials)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-ao-muted">
            Return rate is applied to all materials for simplicity (in-game it
            excludes artifacts). Material prices are the cheapest sell orders in{" "}
            {city}.
          </p>
        </>
      )}

      {!item && (
        <p className="text-sm text-ao-muted">
          Search a craftable item to calculate profit.
        </p>
      )}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  width = "w-16",
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  width?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      {label}
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`${width} rounded border border-ao-border bg-ao-bg px-2 py-1.5 text-sm text-white`}
      />
    </label>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad";
}) {
  const color =
    tone === "good" ? "text-ao-green" : tone === "bad" ? "text-ao-red" : "";
  return (
    <div className="rounded-xl border border-ao-border bg-ao-panel p-3">
      <div className="text-xs text-ao-muted">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-ao-muted">{sub}</div>}
    </div>
  );
}
