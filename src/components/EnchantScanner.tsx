"use client";

import { useEffect, useState } from "react";
import {
  TRADE_CITIES,
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
} from "@/lib/filters";

// Green/red for a profit-like number; muted when unknown (missing price data).
const tone = (n: number | null) =>
  n == null ? "text-ao-muted" : n >= 0 ? "text-ao-green" : "text-ao-red";

interface Row {
  id: string;
  name: string;
  tier: number;
  step: number;
  stepLabel: string;
  lowerId: string;
  lower: number | null;
  matId: string;
  matName: string;
  matCount: number;
  matUnit: number | null;
  matCost: number | null;
  sellGross: number | null;
  sellNet: number | null;
  cost: number | null;
  profit: number | null;
  margin: number | null;
  complete: boolean;
  sellDate: string;
}

export default function EnchantScanner() {
  const [city, setCity] = useState("Caerleon");
  const [groups, setGroups] = useState<string[]>(["weapons"]);
  const [subs, setSubs] = useState<string[]>([]);
  const [tiers, setTiers] = useState<number[]>([4, 5, 6, 7, 8]);
  const [steps, setSteps] = useState<number[]>([1, 2, 3]);
  const [salesTax, setSalesTax] = useState(DEFAULT_SALES_TAX * 100);
  const [setupFee, setSetupFee] = useState(DEFAULT_SETUP_FEE * 100);
  const [incomplete, setIncomplete] = useState(false);
  const [sort, setSort] = useState<"profit" | "margin">("profit");
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState<{ scanned: number; priced: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const subOptions = availableSubs(groups);
  useEffect(() => {
    const valid = new Set(availableSubs(groups).map((s) => s.value));
    setSubs((cur) => cur.filter((s) => valid.has(s)));
  }, [groups]);

  async function scan(sortBy: "profit" | "margin" = sort) {
    if (!groups.length || !tiers.length || !steps.length) {
      setErr("Select at least one category, tier and upgrade step.");
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
        city,
        tax: String(salesTax / 100),
        fee: String(setupFee / 100),
        incomplete: incomplete ? "1" : "0",
        sort: sortBy,
      });
      const res = await fetch(`/api/enchant?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `API ${res.status}`);
      setRows(data.results as Row[]);
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
          <Field label="City (buy & sell)">
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full rounded border border-ao-border bg-ao-bg px-2 py-1.5 text-sm text-white"
            >
              {TRADE_CITIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <NumField label="Sales tax %" value={salesTax} onChange={setSalesTax} />
          <NumField label="Setup fee %" value={setupFee} onChange={setSetupFee} />
          <label className="flex items-end gap-2 pb-1.5 text-sm text-white">
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
        <ChipGroup label="Upgrade steps" options={STEP_OPTS} selected={steps} onChange={setSteps} />
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
            items · {city}.
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
                <th className="px-3 py-2">Material</th>
                <th className="px-3 py-2 text-right">Buy item</th>
                <th className="px-3 py-2 text-right">Mat cost</th>
                <th className="px-3 py-2 text-right">Sell (net)</th>
                <th className="px-3 py-2 text-right">Profit</th>
                <th className="px-3 py-2 text-right">Margin</th>
                <th className="px-3 py-2 text-right">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.id}-${r.step}`}
                  className="border-t border-ao-border hover:bg-ao-panel/50"
                >
                  <td className="px-3 py-2">
                    <span className="text-ao-gold">T{r.tier}</span> {r.name}
                  </td>
                  <td className="px-3 py-2 text-ao-muted">{r.stepLabel}</td>
                  <td
                    className="px-3 py-2 text-ao-muted"
                    title={
                      r.matUnit != null
                        ? `${fmt(r.matCount)} × ${r.matName} @ ${fmt(r.matUnit)} ea`
                        : `${fmt(r.matCount)} × ${r.matName} (no price)`
                    }
                  >
                    {fmt(r.matCount)}× {r.matName.replace(/.*'s\s+/, "")}
                  </td>
                  <td className="px-3 py-2 text-right">{fmt(r.lower)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.matCost)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.sellNet)}</td>
                  <td className={`px-3 py-2 text-right font-medium ${tone(r.profit)}`}>
                    {fmt(r.profit)}
                  </td>
                  <td className={`px-3 py-2 text-right ${tone(r.margin)}`}>
                    {r.margin == null ? "—" : `${(r.margin * 100).toFixed(0)}%`}
                  </td>
                  <td className="px-3 py-2 text-right text-ao-muted">{ageOf(r.sellDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-ao-muted">
        Enchanting upgrades a finished item one level: <strong>Base→.1</strong> uses
        runes, <strong>.1→.2</strong> souls, <strong>.2→.3</strong> relics. Profit =
        enchanted sell price (net of tax + setup) − the lower item − the
        runes/souls/relics. Everything is priced in {city} at Normal quality; the
        upgrade has no station fee and no resource return. Prices are crowd-sourced
        and may be stale — verify in-game before committing materials.
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
