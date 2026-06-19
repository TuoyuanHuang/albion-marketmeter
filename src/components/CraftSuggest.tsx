"use client";

import { useEffect, useState } from "react";
import {
  TRADE_CITIES,
  QUALITIES,
  DEFAULT_SALES_TAX,
  DEFAULT_SETUP_FEE,
  fmt,
  ageOf,
} from "@/lib/albion";
import ChipGroup from "@/components/ChipGroup";
import { CRAFT_GROUPS, availableSubs, TIER_OPTS } from "@/lib/filters";

const JOURNAL_LABEL: Record<string, string> = {
  WARRIOR: "Warrior",
  HUNTER: "Hunter",
  MAGE: "Mage",
  TOOLMAKER: "Toolmaker",
};

interface Row {
  id: string;
  name: string;
  tier: number;
  journal: string | null;
  fame: number;
  sell: number;
  sellDate: string;
  matCost: number;
  net: number;
  journalProfit: number;
  profit: number;
  margin: number;
}

export default function CraftSuggest() {
  const [city, setCity] = useState("Caerleon");
  const [quality, setQuality] = useState(1);
  const [groups, setGroups] = useState<string[]>(["weapons"]);
  const [subs, setSubs] = useState<string[]>([]);
  const [tiers, setTiers] = useState<number[]>([4, 5, 6, 7, 8]);
  const [returnRate, setReturnRate] = useState(15.2);
  const [salesTax, setSalesTax] = useState(DEFAULT_SALES_TAX * 100);
  const [setupFee, setSetupFee] = useState(DEFAULT_SETUP_FEE * 100);
  const [useJournals, setUseJournals] = useState(true);
  const [sort, setSort] = useState<"profit" | "margin">("profit");
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState<{ scanned: number; priced: number } | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const subOptions = availableSubs(groups);
  useEffect(() => {
    const valid = new Set(availableSubs(groups).map((s) => s.value));
    setSubs((cur) => cur.filter((s) => valid.has(s)));
  }, [groups]);

  async function scan(sortBy: "profit" | "margin" = sort) {
    if (!groups.length || !tiers.length) {
      setErr("Select at least one category and tier.");
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
        city,
        quality: String(quality),
        rr: String(returnRate / 100),
        tax: String(salesTax / 100),
        fee: String(setupFee / 100),
        journals: useJournals ? "1" : "0",
        sort: sortBy,
      });
      const res = await fetch(`/api/craft-suggest?${params}`);
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

  const qLabel = QUALITIES.find((q) => q.value === quality)?.label ?? "";

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border border-ao-border bg-ao-panel p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="City (buy mats + sell)">
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
          <Field label="Sell quality">
            <select
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              className="w-full rounded border border-ao-border bg-ao-bg px-2 py-1.5 text-sm text-white"
            >
              {QUALITIES.map((q) => (
                <option key={q.value} value={q.value}>
                  {q.label}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-end gap-2 pb-1.5 text-sm text-white">
            <input
              type="checkbox"
              checked={useJournals}
              onChange={(e) => setUseJournals(e.target.checked)}
            />
            Include journal value
          </label>
        </div>

        <ChipGroup
          label="Categories"
          options={CRAFT_GROUPS}
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
            {meta.priced} of {meta.scanned} craftable items had enough price data
            · selling at {qLabel} in {city}.
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
                <th className="px-3 py-2">Journal</th>
                <th className="px-3 py-2 text-right">Mat cost</th>
                <th className="px-3 py-2 text-right">Sell</th>
                <th className="px-3 py-2 text-right">Net</th>
                <th className="px-3 py-2 text-right">Journal +</th>
                <th className="px-3 py-2 text-right">Profit</th>
                <th className="px-3 py-2 text-right">Margin</th>
                <th className="px-3 py-2 text-right">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-ao-border hover:bg-ao-panel/50">
                  <td className="px-3 py-2">
                    <span className="text-ao-gold">T{r.tier}</span> {r.name}
                  </td>
                  <td className="px-3 py-2 text-ao-muted">
                    {r.journal ? JOURNAL_LABEL[r.journal] : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">{fmt(r.matCost)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.sell)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.net)}</td>
                  <td className="px-3 py-2 text-right text-ao-muted">
                    {r.journalProfit > 0 ? `+${fmt(r.journalProfit)}` : "—"}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-medium ${
                      r.profit >= 0 ? "text-ao-green" : "text-ao-red"
                    }`}
                  >
                    {fmt(r.profit)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right ${
                      r.margin >= 0 ? "text-ao-green" : "text-ao-red"
                    }`}
                  >
                    {(r.margin * 100).toFixed(0)}%
                  </td>
                  <td className="px-3 py-2 text-right text-ao-muted">
                    {ageOf(r.sellDate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-ao-muted">
        Profit per item = product sell price (net of tax + setup fee) + journal
        value − material cost (after return rate). Journal value assumes you fill
        empty journals while crafting and sell them full. Material prices are the
        cheapest sell orders in {city}; crafted output quality is assumed to be the
        selected sell quality. Prices are crowd-sourced and may be stale.
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
