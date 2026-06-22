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
import {
  ENCHANT_GROUPS,
  STEP_OPTS,
  availableSubs,
  TIER_OPTS,
  QUALITY_OPTS,
} from "@/lib/filters";

// Green/red for a profit-like number; muted when unknown (missing price data).
const tone = (n: number | null) =>
  n == null ? "text-ao-muted" : n >= 0 ? "text-ao-green" : "text-ao-red";

const qualityLabel = (q: number) =>
  QUALITIES.find((x) => x.value === q)?.label ?? "";

interface Row {
  id: string;
  name: string;
  tier: number;
  step: number;
  stepLabel: string;
  quality: number;
  lower: number | null;
  materials: { id: string; name: string; count: number; unit: number | null; cost: number | null }[];
  matCost: number | null;
  sellGross: number | null;
  avgSell: number | null;
  sellNet: number | null;
  cost: number | null;
  profit: number | null;
  margin: number | null;
  complete: boolean;
  sellDate: string;
  vol: number | null;
  volTotal: number | null;
  lastVol: number | null;
  lastDate: string | null;
  recent: { d: string; n: number }[] | null;
}

export default function EnchantScanner() {
  const [buyCity, setBuyCity] = useState("Caerleon");
  const [sellCity, setSellCity] = useState("Caerleon");
  const [groups, setGroups] = useState<string[]>(["weapons"]);
  const [subs, setSubs] = useState<string[]>([]);
  const [tiers, setTiers] = useState<number[]>([4, 5, 6, 7, 8]);
  const [steps, setSteps] = useState<number[]>([1, 2, 3]);
  const [qualities, setQualities] = useState<number[]>([1]);
  const [salesTax, setSalesTax] = useState(DEFAULT_SALES_TAX * 100);
  const [setupFee, setSetupFee] = useState(DEFAULT_SETUP_FEE * 100);
  const [useAvg, setUseAvg] = useState(true);
  const [incomplete, setIncomplete] = useState(false);
  const [sort, setSort] = useState<"profit" | "margin">("profit");
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState<{ scanned: number; priced: number } | null>(null);
  // Sell city the displayed rows were scanned with (for the volume column header).
  const [usedSell, setUsedSell] = useState("");
  // Whether the displayed rows used the average sell price (for the column header).
  const [usedAvg, setUsedAvg] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const subOptions = availableSubs(groups);
  useEffect(() => {
    const valid = new Set(availableSubs(groups).map((s) => s.value));
    setSubs((cur) => cur.filter((s) => valid.has(s)));
  }, [groups]);

  async function scan(sortBy: "profit" | "margin" = sort) {
    if (!groups.length || !tiers.length || !steps.length || !qualities.length) {
      setErr("Select at least one category, tier, upgrade step and quality.");
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
        steps: steps.join(","),
        qualities: qualities.join(","),
        buyCity,
        sellCity,
        tax: String(salesTax / 100),
        fee: String(setupFee / 100),
        avg: useAvg ? "1" : "0",
        incomplete: incomplete ? "1" : "0",
        sort: sortBy,
      });
      const res = await fetch(`/api/enchant?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `API ${res.status}`);
      setRows(data.results as Row[]);
      setMeta({ scanned: data.scanned, priced: data.priced });
      setUsedSell(data.sellCity ?? sellCity);
      setUsedAvg(data.avg ?? useAvg);
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
          <Field label="Buy city (item + materials)">
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
          <Field label="Sell city (enchanted)">
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
          <NumField label="Sales tax %" value={salesTax} onChange={setSalesTax} />
          <NumField label="Setup fee %" value={setupFee} onChange={setSetupFee} />
          <label
            className="flex items-center gap-2 text-sm text-white sm:col-span-2"
            title="On: profit uses the volume-weighted historical average sell price. Off: uses the current cheapest sell order (can be an inflated one-off listing)."
          >
            <input
              type="checkbox"
              checked={useAvg}
              onChange={(e) => setUseAvg(e.target.checked)}
            />
            Use average sell price (vs current sell order)
          </label>
          <label className="flex items-center gap-2 text-sm text-white sm:col-span-2">
            <input
              type="checkbox"
              checked={incomplete}
              onChange={(e) => setIncomplete(e.target.checked)}
            />
            Show rows missing price data
          </label>
        </div>

        <ChipGroup label="Categories" options={ENCHANT_GROUPS} selected={groups} onChange={setGroups} />
        {subOptions.length > 0 && (
          <ChipGroup
            label="Subcategories (optional — all if none)"
            options={subOptions}
            selected={subs}
            onChange={setSubs}
          />
        )}
        <ChipGroup label="Tiers" options={TIER_OPTS} selected={tiers} onChange={setTiers} />
        <ChipGroup label="Qualities" options={QUALITY_OPTS} selected={qualities} onChange={setQualities} />
        <ChipGroup
          label="Enchant to (chains all upgrades from base)"
          options={STEP_OPTS}
          selected={steps}
          onChange={setSteps}
        />
      </div>

      <button
        onClick={() => scan()}
        disabled={loading}
        className="rounded-md bg-ao-gold px-5 py-2 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-50"
      >
        {loading ? "Scanning…" : "Find profitable enchants"}
      </button>

      {err && <div className="text-sm text-ao-red">{err}</div>}
      {meta && !loading && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-ao-muted">
            {rows.length} shown · {meta.priced} priced from {meta.scanned} enchantable
            items · {buyCity} → {sellCity}.
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
                <th className="px-3 py-2">Upgrade</th>
                <th className="px-3 py-2">Materials</th>
                <th className="px-3 py-2 text-right">Buy item</th>
                <th className="px-3 py-2 text-right">Mat cost</th>
                <th
                  className="px-3 py-2 text-right"
                  title={
                    usedAvg
                      ? "Net proceeds from selling the enchanted item, using the volume-weighted historical average sell price (net of tax + setup)."
                      : "Net proceeds from selling the enchanted item at the current cheapest sell order (net of tax + setup)."
                  }
                >
                  {usedAvg ? "Avg sell (net)" : "Sell (net)"}
                </th>
                <th className="px-3 py-2 text-right">Profit</th>
                <th className="px-3 py-2 text-right">Margin</th>
                <th
                  className="px-3 py-2 text-right"
                  title="Items actually sold of the enchanted item at the sell market on the last completed day (history). For a Black Market destination this is how many it bought that day — hover a cell for the date and recent days."
                >
                  {usedSell === "Black Market" ? "BM bought (last day)" : "Sold (last day)"}
                </th>
                <th className="px-3 py-2 text-right">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.id}-${r.step}-${r.quality}`}
                  className="border-t border-ao-border hover:bg-ao-panel/50"
                >
                  <td className="px-3 py-2">
                    <span className="text-ao-gold">T{r.tier}</span> {r.name}
                    {r.quality > 1 && (
                      <span className="ml-2 rounded bg-ao-border px-1.5 text-xs text-ao-muted">
                        {qualityLabel(r.quality)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-ao-muted">{r.stepLabel}</td>
                  <td
                    className="px-3 py-2 text-ao-muted"
                    title={r.materials
                      .map(
                        (m) =>
                          `${fmt(m.count)} × ${m.name}${
                            m.unit != null ? ` @ ${fmt(m.unit)} = ${fmt(m.cost)}` : " (no price)"
                          }`
                      )
                      .join("\n")}
                  >
                    {r.materials.map((m) => m.name.replace(/.*'s\s+/, "")).join("+")}
                  </td>
                  <td className="px-3 py-2 text-right">{fmt(r.lower)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.matCost)}</td>
                  <td
                    className="px-3 py-2 text-right"
                    title={
                      r.avgSell != null
                        ? `Avg sell ${fmt(r.avgSell)} (gross) · current listing ${fmt(r.sellGross)}`
                        : r.sellGross != null
                        ? `No history — using current listing ${fmt(r.sellGross)}`
                        : undefined
                    }
                  >
                    {fmt(r.sellNet)}
                  </td>
                  <td className={`px-3 py-2 text-right font-medium ${tone(r.profit)}`}>
                    {fmt(r.profit)}
                  </td>
                  <td className={`px-3 py-2 text-right ${tone(r.margin)}`}>
                    {r.margin == null ? "—" : `${(r.margin * 100).toFixed(0)}%`}
                  </td>
                  <td
                    className="px-3 py-2 text-right text-ao-muted"
                    title={
                      r.recent && r.recent.length
                        ? `Last completed day (${r.lastDate}): ${fmt(r.lastVol)} sold at ${usedSell}\n\n` +
                          `Actual sold per day (newest last):\n` +
                          r.recent.map((x) => `${x.d}: ${fmt(x.n)}`).join("\n") +
                          `\n\n~30-day avg ${fmt(r.vol)}/day · total ≈ ${fmt(r.volTotal)}`
                        : undefined
                    }
                  >
                    <span className="whitespace-nowrap">
                      {r.lastVol == null ? "—" : fmt(r.lastVol)}
                      {r.lastDate && (
                        <span className="ml-1 text-[10px] text-ao-muted/70">{r.lastDate}</span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-ao-muted">{ageOf(r.sellDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-ao-muted">
        Each row enchants a <strong>base item all the way to the target level</strong>,
        chaining every upgrade: <strong>.1</strong> uses runes, <strong>.2</strong>{" "}
        adds souls, <strong>.3</strong> adds relics. Profit = enchanted sell price −
        the base item − all the runes/souls/relics. With{" "}
        <strong>Use average sell price</strong> on (default), the sell price is the
        volume-weighted historical average (net of tax + setup) so a single inflated
        order can&apos;t distort it; off, it uses the current cheapest sell order. The
        base item + materials are
        bought in {buyCity}; the enchanted item is sold in {sellCity}
        {sellCity === "Black Market" ? " (instant-sell, tax only)" : ""}. Enchanting
        preserves quality, so each row buys and sells at the same quality; materials
        are Normal quality. No station fee or resource return.{" "}
        <strong>Sold (last day)</strong> is how many of the enchanted item actually
        traded at {sellCity} on the most recent completed day (hover for the recent
        daily breakdown) — low volume means it may sit unsold. Prices are
        crowd-sourced and may be stale — verify in-game before committing materials.
      </p>
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
