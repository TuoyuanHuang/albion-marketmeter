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

interface Row {
  id: string;
  name: string;
  tier: number;
  enchant: number;
  quality: number;
  journal: string | null;
  fame: number;
  sell: number;
  sellDate: string;
  matCost: number;
  net: number;
  journalProfit: number;
  profit: number;
  total: number;
  journals: number;
  margin: number;
  volume: number;
}

export default function CraftSuggest() {
  const [city, setCity] = useState("Caerleon");
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

  async function scan(sortBy: "profit" | "total" | "margin" = sort) {
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
        city,
        rr: String(returnRate / 100),
        tax: String(salesTax / 100),
        fee: String(setupFee / 100),
        journals: useJournals ? "1" : "0",
        quantity: String(quantity),
        minVol: String(minVol),
        volPeriod,
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

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border border-ao-border bg-ao-panel p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                onChange={(e) => setVolPeriod(e.target.value as "day" | "week")}
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
            craftables in {city}.
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
                <th className="px-3 py-2 text-right">Sold/day</th>
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
                  <td className={`px-3 py-2 text-right font-medium ${r.profit >= 0 ? "text-ao-green" : "text-ao-red"}`}>
                    {fmt(r.profit)}
                  </td>
                  <td className={`px-3 py-2 text-right ${r.total >= 0 ? "text-ao-green" : "text-ao-red"}`}>
                    {fmt(r.total)}
                  </td>
                  <td className={`px-3 py-2 text-right ${r.margin >= 0 ? "text-ao-green" : "text-ao-red"}`}>
                    {(r.margin * 100).toFixed(0)}%
                  </td>
                  <td className="px-3 py-2 text-right text-ao-muted">
                    {r.volume >= 0 ? r.volume.toFixed(1) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-ao-muted">{ageOf(r.sellDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-ao-muted">
        Profit/ea = product sell (net of tax + setup, at the chosen quality) +
        journal value − material cost (after return rate). Journal value uses live
        empty/full journal prices; <strong>Total ×{quantity}</strong> scales by your
        craft quantity (≈ {fmt(rows[0]?.journals ?? 0)} journals filled for the top
        row). Sold/day is the average daily volume in {city} over the last ~month.
        Click any row to open its recipe and edit prices. Prices are crowd-sourced
        and may be stale.
      </p>

      {detail && (
        <CraftDetailModal
          target={detail}
          city={city}
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
