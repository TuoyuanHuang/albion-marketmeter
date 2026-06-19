"use client";

import { useState } from "react";
import ItemSearch, { ItemHit } from "@/components/ItemSearch";
import FlipScanner from "@/components/FlipScanner";
import {
  CITIES,
  QUALITIES,
  DEFAULT_SALES_TAX,
  DEFAULT_SETUP_FEE,
  PriceRow,
  isPriced,
  fmt,
  ageOf,
} from "@/lib/albion";

interface CityView {
  city: string;
  buyCost: number | null; // sell_price_min = instant buy cost here
  buyAge: string;
  listNet: number | null; // net if you list a sell order at this city's sell_price_min
  instantNet: number | null; // net if you instant-sell into the highest buy order
  buyOrder: number | null; // buy_price_max
  buyOrderAge: string;
}

export default function FlipsPage() {
  const [mode, setMode] = useState<"scan" | "single">("scan");
  const [item, setItem] = useState<ItemHit | null>(null);
  const [quality, setQuality] = useState(1);
  const [salesTax, setSalesTax] = useState(DEFAULT_SALES_TAX * 100);
  const [setupFee, setSetupFee] = useState(DEFAULT_SETUP_FEE * 100);
  const [rows, setRows] = useState<CityView[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const tax = salesTax / 100;
  const fee = setupFee / 100;

  async function load(it: ItemHit, q = quality) {
    setItem(it);
    setLoading(true);
    setErr(null);
    setRows([]);
    try {
      const res = await fetch(
        `/api/prices?items=${it.id}&qualities=${q}&locations=${CITIES.map(
          encodeURIComponent
        ).join(",")}`
      );
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = (await res.json()) as PriceRow[];
      const byCity = new Map(data.map((r) => [r.city, r]));
      const views: CityView[] = CITIES.map((city) => {
        const r = byCity.get(city);
        const sellMin = r && isPriced(r.sell_price_min) ? r.sell_price_min : null;
        const buyMax = r && isPriced(r.buy_price_max) ? r.buy_price_max : null;
        return {
          city,
          buyCost: sellMin,
          buyAge: r ? ageOf(r.sell_price_min_date) : "—",
          listNet: sellMin != null ? sellMin * (1 - tax - fee) : null,
          instantNet: buyMax != null ? buyMax * (1 - tax) : null,
          buyOrder: buyMax,
          buyOrderAge: r ? ageOf(r.buy_price_max_date) : "—",
        };
      });
      setRows(views);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  // Best route: cheapest city to buy -> city with highest net sell (list or instant).
  const buyCandidates = rows.filter(
    (r) => r.buyCost != null && r.city !== "Black Market"
  );
  const bestBuy = buyCandidates.reduce<CityView | null>(
    (best, r) => (best == null || r.buyCost! < best.buyCost! ? r : best),
    null
  );
  type SellOpt = { city: string; net: number; mode: "list" | "instant" };
  const sellOpts: SellOpt[] = [];
  for (const r of rows) {
    if (r.listNet != null && r.city !== "Black Market")
      sellOpts.push({ city: r.city, net: r.listNet, mode: "list" });
    if (r.instantNet != null)
      sellOpts.push({ city: r.city, net: r.instantNet, mode: "instant" });
  }
  const bestSell = sellOpts.reduce<SellOpt | null>(
    (best, s) => (best == null || s.net > best.net ? s : best),
    null
  );
  const route =
    bestBuy && bestSell && bestBuy.city !== bestSell.city
      ? {
          buy: bestBuy,
          sell: bestSell,
          profit: bestSell.net - bestBuy.buyCost!,
          margin: (bestSell.net - bestBuy.buyCost!) / bestBuy.buyCost!,
        }
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Flip Finder</h1>
        <p className="text-sm text-ao-muted">
          Buy low in one city, sell high in another. Net values include market
          fees.
        </p>
      </div>

      <div className="flex gap-1 rounded-lg border border-ao-border bg-ao-panel p-1 text-sm">
        <button
          onClick={() => setMode("scan")}
          className={`flex-1 rounded-md px-3 py-1.5 ${
            mode === "scan" ? "bg-ao-border text-white" : "text-ao-muted"
          }`}
        >
          Scan biggest spreads
        </button>
        <button
          onClick={() => setMode("single")}
          className={`flex-1 rounded-md px-3 py-1.5 ${
            mode === "single" ? "bg-ao-border text-white" : "text-ao-muted"
          }`}
        >
          Single item
        </button>
      </div>

      {mode === "scan" && <FlipScanner />}

      {mode === "single" && (
        <>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto_auto]">
        <ItemSearch onSelect={(it) => load(it)} />
        <select
          value={quality}
          onChange={(e) => {
            const q = Number(e.target.value);
            setQuality(q);
            if (item) load(item, q);
          }}
          className="rounded-md border border-ao-border bg-ao-bg px-2 py-2 text-sm"
        >
          {QUALITIES.map((q) => (
            <option key={q.value} value={q.value}>
              {q.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs text-ao-muted">
          Tax %
          <input
            type="number"
            value={salesTax}
            onChange={(e) => setSalesTax(Number(e.target.value))}
            className="w-16 rounded border border-ao-border bg-ao-bg px-2 py-1 text-sm text-white"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-ao-muted">
          Setup %
          <input
            type="number"
            value={setupFee}
            onChange={(e) => setSetupFee(Number(e.target.value))}
            className="w-16 rounded border border-ao-border bg-ao-bg px-2 py-1 text-sm text-white"
          />
        </label>
      </div>

      {item && (
        <div className="text-sm text-ao-muted">
          Showing <span className="text-white">{item.name}</span>{" "}
          <span className="font-mono text-xs">({item.id})</span>
        </div>
      )}
      {err && <div className="text-sm text-ao-red">Error: {err}</div>}
      {loading && <div className="text-sm text-ao-muted">Loading prices…</div>}

      {route && (
        <div className="rounded-xl border border-ao-gold/40 bg-ao-panel p-4">
          <div className="text-sm text-ao-muted">Best route</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-lg">
            <span className="font-semibold">{route.buy.city}</span>
            <span className="text-ao-muted">buy @ {fmt(route.buy.buyCost)}</span>
            <span className="text-ao-gold">→</span>
            <span className="font-semibold">{route.sell.city}</span>
            <span className="text-ao-muted">
              {route.sell.mode === "list" ? "list" : "instant"} net{" "}
              {fmt(route.sell.net)}
            </span>
          </div>
          <div className="mt-2 flex gap-6 text-sm">
            <span>
              Profit / unit:{" "}
              <span
                className={route.profit >= 0 ? "text-ao-green" : "text-ao-red"}
              >
                {fmt(route.profit)}
              </span>
            </span>
            <span>
              Margin:{" "}
              <span
                className={route.margin >= 0 ? "text-ao-green" : "text-ao-red"}
              >
                {(route.margin * 100).toFixed(1)}%
              </span>
            </span>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-ao-border">
          <table className="w-full text-sm">
            <thead className="bg-ao-panel text-left text-ao-muted">
              <tr>
                <th className="px-3 py-2">City</th>
                <th className="px-3 py-2 text-right">Buy here</th>
                <th className="px-3 py-2 text-right">Sell-order net</th>
                <th className="px-3 py-2 text-right">Instant-sell net</th>
                <th className="px-3 py-2 text-right">Buy order</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isBestBuy = bestBuy?.city === r.city;
                const isBestSell = bestSell?.city === r.city;
                return (
                  <tr
                    key={r.city}
                    className="border-t border-ao-border hover:bg-ao-panel/50"
                  >
                    <td className="px-3 py-2 font-medium">
                      {r.city}
                      {isBestBuy && (
                        <span className="ml-2 rounded bg-ao-green/20 px-1.5 text-xs text-ao-green">
                          buy
                        </span>
                      )}
                      {isBestSell && (
                        <span className="ml-2 rounded bg-ao-gold/20 px-1.5 text-xs text-ao-gold">
                          sell
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {fmt(r.buyCost)}
                      <span className="ml-1 text-xs text-ao-muted">
                        {r.buyCost != null ? r.buyAge : ""}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">{fmt(r.listNet)}</td>
                    <td className="px-3 py-2 text-right">{fmt(r.instantNet)}</td>
                    <td className="px-3 py-2 text-right text-ao-muted">
                      {fmt(r.buyOrder)}
                      <span className="ml-1 text-xs">
                        {r.buyOrder != null ? r.buyOrderAge : ""}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!item && (
        <p className="text-sm text-ao-muted">
          Search for an item above to see cross-city flip opportunities.
        </p>
      )}
        </>
      )}
    </div>
  );
}
