"use client";

import { useEffect, useState } from "react";
import {
  CITIES,
  QUALITIES,
  DEFAULT_SALES_TAX,
  DEFAULT_SETUP_FEE,
  fmt,
  ageOf,
} from "@/lib/albion";
import ChipGroup from "@/components/ChipGroup";
import {
  GROUPS,
  availableSubs,
  TIER_OPTS,
  QUALITY_OPTS,
  ENCHANT_OPTS,
} from "@/lib/filters";

const qualityLabel = (q: number) =>
  QUALITIES.find((x) => x.value === q)?.label ?? "";

interface ScanRow {
  id: string;
  name: string;
  tier: number;
  enchant: number;
  quality: number;
  from: string;
  to: string;
  buy: number;
  sell: number;
  sellGross: number;
  profit: number;
  margin: number;
  avgSell: number | null;
  vol: number | null;
  volTotal: number | null;
  lastVol: number | null;
  lastDate: string | null;
  recent: { d: string; n: number }[] | null;
  aDate: string;
  bDate: string;
}

export default function FlipScanner() {
  const [marketA, setMarketA] = useState("Caerleon");
  const [marketB, setMarketB] = useState("Black Market");
  const [groups, setGroups] = useState<string[]>(["resources"]);
  const [subs, setSubs] = useState<string[]>([]);
  const [tiers, setTiers] = useState<number[]>([4, 5, 6, 7, 8]);
  const [qualities, setQualities] = useState<number[]>([1]);
  const [enchants, setEnchants] = useState<number[]>([0]);
  const [salesTax, setSalesTax] = useState(DEFAULT_SALES_TAX * 100);
  const [setupFee, setSetupFee] = useState(DEFAULT_SETUP_FEE * 100);
  const [sort, setSort] = useState<"profit" | "margin">("profit");
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [scanned, setScanned] = useState<number | null>(null);
  // Markets the displayed results were actually scanned with (for column headers).
  const [used, setUsed] = useState<{ a: string; b: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const subOptions = availableSubs(groups);

  // Drop selected subcategories that no longer belong to the chosen categories.
  useEffect(() => {
    const valid = new Set(availableSubs(groups).map((s) => s.value));
    setSubs((cur) => cur.filter((s) => valid.has(s)));
  }, [groups]);

  async function scan(sortBy: "profit" | "margin" = sort) {
    if (marketA === marketB) {
      setErr("Pick two different markets.");
      return;
    }
    if (!groups.length || !tiers.length || !qualities.length || !enchants.length) {
      setErr("Select at least one category, tier, quality and enchantment.");
      return;
    }
    setLoading(true);
    setErr(null);
    setRows([]);
    setScanned(null);
    try {
      const params = new URLSearchParams({
        groups: groups.join(","),
        subs: subs.join(","),
        tiers: tiers.join(","),
        qualities: qualities.join(","),
        enchants: enchants.join(","),
        marketA,
        marketB,
        sort: sortBy,
        tax: String(salesTax / 100),
        fee: String(setupFee / 100),
      });
      const res = await fetch(`/api/scan?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `API ${res.status}`);
      setRows(data.results as ScanRow[]);
      setScanned(data.scanned);
      setUsed({ a: data.marketA, b: data.marketB });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border border-ao-border bg-ao-panel p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Market A">
            <select
              value={marketA}
              onChange={(e) => setMarketA(e.target.value)}
              className="w-full rounded border border-ao-border bg-ao-bg px-2 py-1.5 text-sm text-white"
            >
              {CITIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Market B">
            <select
              value={marketB}
              onChange={(e) => setMarketB(e.target.value)}
              className="w-full rounded border border-ao-border bg-ao-bg px-2 py-1.5 text-sm text-white"
            >
              {CITIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>

        <ChipGroup
          label="Categories"
          options={GROUPS}
          selected={groups}
          onChange={setGroups}
        />
        {subOptions.length > 0 && (
          <ChipGroup
            label="Subcategories (optional — all if none)"
            options={subOptions}
            selected={subs}
            onChange={setSubs}
          />
        )}
        <ChipGroup
          label="Tiers"
          options={TIER_OPTS}
          selected={tiers}
          onChange={setTiers}
        />
        <ChipGroup
          label="Qualities"
          options={QUALITY_OPTS}
          selected={qualities}
          onChange={setQualities}
        />
        <ChipGroup
          label="Enchantments"
          options={ENCHANT_OPTS}
          selected={enchants}
          onChange={setEnchants}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tax %">
            <input
              type="number"
              value={salesTax}
              onChange={(e) => setSalesTax(Number(e.target.value))}
              className="w-full rounded border border-ao-border bg-ao-bg px-2 py-1.5 text-sm text-white"
            />
          </Field>
          <Field label="Setup %">
            <input
              type="number"
              value={setupFee}
              onChange={(e) => setSetupFee(Number(e.target.value))}
              className="w-full rounded border border-ao-border bg-ao-bg px-2 py-1.5 text-sm text-white"
            />
          </Field>
        </div>
      </div>

      <button
        onClick={() => scan()}
        disabled={loading}
        className="rounded-md bg-ao-gold px-5 py-2 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-50"
      >
        {loading ? "Scanning…" : "Scan for flips"}
      </button>

      {err && <div className="text-sm text-ao-red">{err}</div>}
      {scanned != null && !loading && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-ao-muted">
            Scanned {scanned} items · {rows.length} profitable flips found.
          </div>
          <div className="flex items-center gap-2 text-xs text-ao-muted">
            Sort by
            <div className="flex gap-1 rounded-md border border-ao-border bg-ao-panel p-0.5">
              {(["profit", "margin"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    if (k === sort) return;
                    setSort(k);
                    scan(k);
                  }}
                  className={`rounded px-2.5 py-1 capitalize ${
                    sort === k ? "bg-ao-gold text-black" : "hover:text-white"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-ao-border">
          <table className="w-full text-sm">
            <thead className="bg-ao-panel text-left text-ao-muted">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Route</th>
                <th className="px-3 py-2 text-right">Buy</th>
                <th className="px-3 py-2 text-right">Sell (net)</th>
                <th
                  className="px-3 py-2 text-right"
                  title="Volume-weighted daily average sell price at the destination market (history). Compare with the current sell — if it's far below, the current quote may be a one-off that won't fill."
                >
                  Avg sell/day
                </th>
                <th
                  className="px-3 py-2 text-right"
                  title="Items actually sold at the destination market on the last completed day (history). For a Black Market destination this is how many it bought that day — hover a cell for the date and recent days."
                >
                  {used?.a === "Black Market" || used?.b === "Black Market"
                    ? "BM bought (last day)"
                    : "Sold (last day)"}
                </th>
                <th className="px-3 py-2 text-right">Profit</th>
                <th className="px-3 py-2 text-right">Margin</th>
                <th className="px-3 py-2 text-right">
                  {used?.a ?? "A"} age
                </th>
                <th className="px-3 py-2 text-right">
                  {used?.b ?? "B"} age
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.id}-${r.quality}`}
                  className="border-t border-ao-border hover:bg-ao-panel/50"
                >
                  <td className="px-3 py-2">
                    <span className="text-ao-gold">
                      T{r.tier}
                      {r.enchant > 0 ? `.${r.enchant}` : ""}
                    </span>{" "}
                    {r.name}
                    {r.quality > 1 && (
                      <span className="ml-2 rounded bg-ao-border px-1.5 text-xs text-ao-muted">
                        {qualityLabel(r.quality)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-ao-muted">
                    {r.from} <span className="text-ao-gold">→</span> {r.to}
                  </td>
                  <td className="px-3 py-2 text-right">{fmt(r.buy)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.sell)}</td>
                  <td
                    className="px-3 py-2 text-right text-ao-muted"
                    title={
                      r.avgSell != null
                        ? `Current sell ${fmt(r.sellGross)} vs daily avg ${fmt(r.avgSell)} at ${r.to}`
                        : undefined
                    }
                  >
                    {fmt(r.avgSell)}
                    {r.avgSell != null && r.sellGross > r.avgSell * 1.3 && (
                      <span
                        className="ml-1 text-ao-red"
                        title="The current sell quote is well above the daily average — it may be a one-off listing that won't actually fill at this price."
                      >
                        ↑
                      </span>
                    )}
                  </td>
                  <td
                    className="px-3 py-2 text-right text-ao-muted"
                    title={
                      r.recent && r.recent.length
                        ? `Last completed day (${r.lastDate}): ${fmt(r.lastVol)} sold at ${r.to}\n\n` +
                          `Actual sold per day (newest last):\n` +
                          r.recent.map((x) => `${x.d}: ${fmt(x.n)}`).join("\n") +
                          `\n\n~30-day avg ${fmt(r.vol)}/day · total ≈ ${fmt(r.volTotal)}`
                        : undefined
                    }
                  >
                    <span className="whitespace-nowrap">
                      {r.lastVol == null ? "—" : fmt(r.lastVol)}
                      {r.lastDate && (
                        <span className="ml-1 text-[10px] text-ao-muted/70">
                          {r.lastDate}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-ao-green">
                    {fmt(r.profit)}
                  </td>
                  <td className="px-3 py-2 text-right text-ao-green">
                    {(r.margin * 100).toFixed(0)}%
                  </td>
                  <td className="px-3 py-2 text-right text-ao-muted">
                    {ageOf(r.aDate)}
                  </td>
                  <td className="px-3 py-2 text-right text-ao-muted">
                    {ageOf(r.bDate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-ao-muted">
        City sells assume listing a sell order (tax + setup fee); the Black Market
        assumes an instant sell into its buy orders (tax only).{" "}
        <strong>Avg sell/day</strong> is the volume-weighted daily average price at
        the destination market — a ↑ flag means the current sell quote sits well
        above it, so the flip may not actually fill at that price.{" "}
        <strong>BM bought (last day)</strong> (or Sold last day) is the actual
        quantity traded at the destination on the most recent completed day, with
        that date shown next to it — for the Black Market, how many it bought that
        day, so higher means your sell is more likely to go through (hover for the
        recent daily breakdown and 30-day average). Prices are crowd-sourced and may
        be stale — verify in-game before trading.
      </p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ao-muted">
      {label}
      {children}
    </label>
  );
}
