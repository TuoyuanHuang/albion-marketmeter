"use client";

import { useEffect, useState } from "react";
import {
  TRADE_CITIES,
  CITIES,
  QUALITIES,
  DEFAULT_SALES_TAX,
  DEFAULT_SETUP_FEE,
  fmt,
  ageOf,
} from "@/lib/albion";
import ChipGroup from "@/components/ChipGroup";
import CraftDetailModal, { DetailTarget } from "@/components/CraftDetailModal";
import {
  CRAFT_GROUPS,
  availableSubs,
  TIER_OPTS,
  QUALITY_OPTS,
  ENCHANT_OPTS,
} from "@/lib/filters";

const JOURNAL_LABEL: Record<string, string> = {
  WARRIOR: "Warrior",
  HUNTER: "Hunter",
  MAGE: "Mage",
  TOOLMAKER: "Toolmaker",
};
const qualityLabel = (q: number) =>
  QUALITIES.find((x) => x.value === q)?.label ?? "";

// Green/red for a profit-like number; muted when unknown (missing price data).
const tone = (n: number | null) =>
  n == null ? "text-ao-muted" : n >= 0 ? "text-ao-green" : "text-ao-red";

interface Row {
  id: string;
  name: string;
  tier: number;
  enchant: number;
  quality: number;
  journal: string | null;
  fame: number;
  sell: number | null;
  sellDate: string;
  matCost: number | null;
  net: number | null;
  journalProfit: number;
  profit: number | null;
  total: number | null;
  journals: number;
  margin: number | null;
  volume: number;
  avgSell: number | null;
  complete: boolean;
}

export default function CraftSuggest() {
  const [buyCity, setBuyCity] = useState("Caerleon");
  const [sellCity, setSellCity] = useState("Caerleon");
  const [groups, setGroups] = useState<string[]>(["weapons"]);
  const [subs, setSubs] = useState<string[]>([]);
  const [tiers, setTiers] = useState<number[]>([4, 5, 6, 7, 8]);
  const [qualities, setQualities] = useState<number[]>([1]);
  const [enchants, setEnchants] = useState<number[]>([0]);
  const [returnRate, setReturnRate] = useState(15.2);
  const [salesTax, setSalesTax] = useState(DEFAULT_SALES_TAX * 100);
  const [setupFee, setSetupFee] = useState(DEFAULT_SETUP_FEE * 100);
  const [useJournals, setUseJournals] = useState(true);
  const [quantity, setQuantity] = useState(100);
  const [minVol, setMinVol] = useState(0);
  const [volPeriod, setVolPeriod] = useState<"day" | "week">("day");
  // The period the currently displayed rows were scanned with (column units).
  const [rowsPeriod, setRowsPeriod] = useState<"day" | "week">("day");
  const [incomplete, setIncomplete] = useState(false);
  const [sort, setSort] = useState<"profit" | "total" | "margin">("profit");
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState<{ scanned: number; priced: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailTarget | null>(null);

  const subOptions = availableSubs(groups);
  useEffect(() => {
    const valid = new Set(availableSubs(groups).map((s) => s.value));
    setSubs((cur) => cur.filter((s) => valid.has(s)));
  }, [groups]);

  async function scan(
    sortBy: "profit" | "total" | "margin" = sort,
    period: "day" | "week" = volPeriod
  ) {
    if (!groups.length || !tiers.length || !qualities.length || !enchants.length) {
      setErr("Select at least one category, tier, quality and enchantment.");
      return;
    }
    setLoading(true);
    setErr(null);
    setRows([]);
    setMeta(null);
    try {
      const params = new URLSearchParams({
        groups: groups.join(","),
        subs: subs.join(","),
        tiers: tiers.join(","),
        qualities: qualities.join(","),
        enchants: enchants.join(","),
        buyCity,
        sellCity,
        rr: String(returnRate / 100),
        tax: String(salesTax / 100),
        fee: String(setupFee / 100),
        journals: useJournals ? "1" : "0",
        quantity: String(quantity),
        minVol: String(minVol),
        volPeriod: period,
        incomplete: incomplete ? "1" : "0",
        sort: sortBy,
      });
      const res = await fetch(`/api/craft-suggest?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `API ${res.status}`);
      setRows(data.results as Row[]);
      setRowsPeriod(period);
      setMeta({ scanned: data.scanned, priced: data.priced });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border border-ao-border bg-ao-panel p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Buy city (materials)">
            <select
              value={buyCity}
              onChange={(e) => setBuyCity(e.target.value)}
              className="w-full rounded border border-ao-border bg-ao-bg px-2 py-1.5 text-sm text-white"
            >
              {TRADE_CITIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Sell city (product)">
            <select
              value={sellCity}
              onChange={(e) => setSellCity(e.target.value)}
              className="w-full rounded border border-ao-border bg-ao-bg px-2 py-1.5 text-sm text-white"
            >
              {CITIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <NumField label="Craft quantity" value={quantity} onChange={setQuantity} />
          <Field label={`Min sales / ${volPeriod} (0 = off)`}>
            <div className="flex gap-1">
              <input
                type="number"
                value={minVol}
                onChange={(e) => setMinVol(Number(e.target.value))}
                className="w-full rounded border border-ao-border bg-ao-bg px-2 py-1.5 text-sm text-white"
              />
              <select
                value={volPeriod}
                onChange={(e) => {
                  const p = e.target.value as "day" | "week";
                  setVolPeriod(p);
                  // Re-scan so the volume column and the filter both use the new unit.
                  if (meta) scan(sort, p);
                }}
                className="rounded border border-ao-border bg-ao-bg px-1 py-1.5 text-sm text-white"
              >
                <option value="day">/day</option>
                <option value="week">/week</option>
              </select>
            </div>
          </Field>
          <label className="flex items-end gap-2 pb-1.5 text-sm text-white">
            <input
              type="checkbox"
              checked={useJournals}
              onChange={(e) => setUseJournals(e.target.checked)}
            />
            Include journal value
          </label>
          <label className="flex items-center gap-2 text-sm text-white sm:col-span-2">
            <input
              type="checkbox"
              checked={incomplete}
              onChange={(e) => setIncomplete(e.target.checked)}
            />
            Show items missing price data (open one to enter prices)
          </label>
        </div>

        <ChipGroup label="Categories" options={CRAFT_GROUPS} selected={groups} onChange={setGroups} />
        {subOptions.length > 0 && (
          <ChipGroup
            label="Subcategories (optional — all if none)"
            options={subOptions}
            selected={subs}
            onChange={setSubs}
          />
        )}
        <ChipGroup label="Tiers" options={TIER_OPTS} selected={tiers} onChange={setTiers} />
        <ChipGroup label="Sell qualities" options={QUALITY_OPTS} selected={qualities} onChange={setQualities} />
        <ChipGroup label="Enchantments" options={ENCHANT_OPTS} selected={enchants} onChange={setEnchants} />

        <div className="grid gap-3 sm:grid-cols-3">
          <NumField label="Return rate %" value={returnRate} onChange={setReturnRate} />
          <NumField label="Sales tax %" value={salesTax} onChange={setSalesTax} />
          <NumField label="Setup fee %" value={setupFee} onChange={setSetupFee} />
        </div>
      </div>

      <button
        onClick={() => scan()}
        disabled={loading}
        className="rounded-md bg-ao-gold px-5 py-2 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-50"
      >
        {loading ? "Scanning…" : "Find profitable crafts"}
      </button>

      {err && <div className="text-sm text-ao-red">{err}</div>}
      {meta && !loading && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-ao-muted">
            {rows.length} shown · {meta.priced} priced variants from {meta.scanned}{" "}
            craftables · {buyCity} → {sellCity}.
          </div>
          <div className="flex items-center gap-2 text-xs text-ao-muted">
            Sort by
            <div className="flex gap-1 rounded-md border border-ao-border bg-ao-panel p-0.5">
              {(["profit", "total", "margin"] as const).map((k) => (
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
                  {k === "total" ? "Total" : k}
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
                <th className="px-3 py-2">Journal</th>
                <th className="px-3 py-2 text-right">Mat cost</th>
                <th className="px-3 py-2 text-right">Net</th>
                <th className="px-3 py-2 text-right">Journal +</th>
                <th className="px-3 py-2 text-right">Profit/ea</th>
                <th className="px-3 py-2 text-right">Total ×{quantity}</th>
                <th className="px-3 py-2 text-right">Margin</th>
                <th
                  className="px-3 py-2 text-right"
                  title="Volume-weighted average sell price over ~the last month (history). This is the price used for Net, Profit, Total and Margin. The ↑ flag marks rows where the current market listing sits well above this average."
                >
                  Avg sell
                </th>
                <th className="px-3 py-2 text-right">Sold/{rowsPeriod}</th>
                <th className="px-3 py-2 text-right">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.id}-${r.quality}`}
                  onClick={() =>
                    setDetail({
                      item: r.id.split("@")[0],
                      enchant: r.enchant,
                      quality: r.quality,
                    })
                  }
                  className="cursor-pointer border-t border-ao-border hover:bg-ao-panel/50"
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
                    {r.journal ? JOURNAL_LABEL[r.journal] : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">{fmt(r.matCost)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.net)}</td>
                  <td className="px-3 py-2 text-right text-ao-muted">
                    {r.journalProfit > 0 ? `+${fmt(r.journalProfit)}` : "—"}
                  </td>
                  <td className={`px-3 py-2 text-right font-medium ${tone(r.profit)}`}>
                    {fmt(r.profit)}
                  </td>
                  <td className={`px-3 py-2 text-right ${tone(r.total)}`}>
                    {fmt(r.total)}
                  </td>
                  <td className={`px-3 py-2 text-right ${tone(r.margin)}`}>
                    {r.margin == null ? "—" : `${(r.margin * 100).toFixed(0)}%`}
                  </td>
                  <td
                    className="px-3 py-2 text-right text-ao-muted"
                    title={
                      r.sell != null && r.avgSell != null
                        ? `Current sell ${fmt(r.sell)} vs avg ${fmt(r.avgSell)}`
                        : undefined
                    }
                  >
                    {fmt(r.avgSell)}
                    {r.sell != null &&
                      r.avgSell != null &&
                      r.sell > r.avgSell * 1.3 && (
                        <span
                          className="ml-1 text-ao-red"
                          title="The current market listing is well above this average. Profit here uses the average, so listing at the current price could sell slower."
                        >
                          ↑
                        </span>
                      )}
                  </td>
                  <td className="px-3 py-2 text-right text-ao-muted">
                    {r.complete ? r.volume.toFixed(1) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-ao-muted">{ageOf(r.sellDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-ao-muted">
        <strong>Net</strong> = the average sell price after market fees (tax +
        setup). <strong>Profit/ea</strong> = Net + journal value − material cost
        (after return rate). Net, Profit, Total and Margin use the{" "}
        <strong>historical average sell price</strong> (the Avg sell column), not the
        current listing, so a single inflated order can&apos;t distort them — rows
        without history fall back to the current price. Journal value uses live
        empty/full journal prices; <strong>Total ×{quantity}</strong> scales by your
        craft quantity (≈ {fmt(rows[0]?.journals ?? 0)} journals filled for the top
        row). Materials are bought in {buyCity}; the product is sold in {sellCity}
        {sellCity === "Black Market" ? " (instant-sell, tax only)" : ""}. Sold/
        {rowsPeriod} is the average volume in {sellCity} (per {rowsPeriod}). Click
        any row to open its recipe
        and edit prices — handy for {""}
        <strong>items missing data</strong>. Prices are crowd-sourced and may be
        stale.
      </p>

      {detail && (
        <CraftDetailModal
          target={detail}
          buyCity={buyCity}
          sellCity={sellCity}
          rr={returnRate / 100}
          tax={salesTax / 100}
          fee={setupFee / 100}
          quantity={quantity}
          useJournals={useJournals}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded border border-ao-border bg-ao-bg px-2 py-1.5 text-sm text-white"
      />
    </Field>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ao-muted">
      {label}
      {children}
    </label>
  );
}
