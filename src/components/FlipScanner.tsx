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

// Mirrors SCAN_GROUPS in lib/items (kept here to avoid importing the item DB
// into the client bundle).
const GROUPS = [
  { value: "resources", label: "Refined res." },
  { value: "raw", label: "Raw res." },
  { value: "weapons", label: "Weapons" },
  { value: "armors", label: "Armor" },
  { value: "head", label: "Helmets" },
  { value: "shoes", label: "Shoes" },
  { value: "offhands", label: "Off-hands" },
  { value: "bags", label: "Bags" },
  { value: "capes", label: "Capes" },
  { value: "consumables", label: "Food & potions" },
  { value: "mounts", label: "Mounts" },
  { value: "artefacts", label: "Artifacts" },
];

// Subcategories per category (raw shopsubcategory1 value -> friendly label).
const SUBGROUPS: Record<string, { value: string; label: string }[]> = {
  weapons: [
    { value: "sword", label: "Sword" },
    { value: "axe", label: "Axe" },
    { value: "mace", label: "Mace" },
    { value: "hammer", label: "Hammer" },
    { value: "spear", label: "Spear" },
    { value: "dagger", label: "Dagger" },
    { value: "quarterstaff", label: "Quarterstaff" },
    { value: "knuckles", label: "War Gloves" },
    { value: "bow", label: "Bow" },
    { value: "crossbow", label: "Crossbow" },
    { value: "firestaff", label: "Fire Staff" },
    { value: "froststaff", label: "Frost Staff" },
    { value: "arcanestaff", label: "Arcane Staff" },
    { value: "holystaff", label: "Holy Staff" },
    { value: "naturestaff", label: "Nature Staff" },
    { value: "cursestaff", label: "Curse Staff" },
  ],
  armors: [
    { value: "cloth_armor", label: "Cloth" },
    { value: "leather_armor", label: "Leather" },
    { value: "plate_armor", label: "Plate" },
  ],
  head: [
    { value: "cloth_helmet", label: "Cloth" },
    { value: "leather_helmet", label: "Leather" },
    { value: "plate_helmet", label: "Plate" },
  ],
  shoes: [
    { value: "cloth_shoes", label: "Cloth" },
    { value: "leather_shoes", label: "Leather" },
    { value: "plate_shoes", label: "Plate" },
  ],
  offhands: [
    { value: "shieldtype", label: "Shield" },
    { value: "torchtype", label: "Torch" },
    { value: "booktype", label: "Tome" },
  ],
  resources: [
    { value: "resources", label: "Raw mats" },
    { value: "refinedresources", label: "Refined" },
    { value: "alchemy", label: "Alchemy" },
    { value: "fish", label: "Fish" },
  ],
  raw: [
    { value: "wood", label: "Wood" },
    { value: "ore", label: "Ore" },
    { value: "fiber", label: "Fiber" },
    { value: "hide", label: "Hide" },
    { value: "rock", label: "Rock" },
    { value: "fish", label: "Fish" },
  ],
  bags: [
    { value: "bags", label: "Bags" },
    { value: "satchels", label: "Satchels" },
  ],
  consumables: [
    { value: "food", label: "Food" },
    { value: "potions", label: "Potions" },
    { value: "tomes", label: "Tomes" },
  ],
  mounts: [
    { value: "basemounts", label: "Base" },
    { value: "raremounts", label: "Rare" },
    { value: "battle_mount", label: "Battle" },
  ],
};

// Available subcategories for the currently-selected categories (deduped).
function availableSubs(selectedGroups: string[]) {
  const seen = new Set<string>();
  const out: { value: string; label: string }[] = [];
  for (const g of selectedGroups) {
    for (const s of SUBGROUPS[g] ?? []) {
      if (seen.has(s.value)) continue;
      seen.add(s.value);
      out.push(s);
    }
  }
  return out;
}

const TIER_OPTS = [1, 2, 3, 4, 5, 6, 7, 8].map((t) => ({
  value: t,
  label: `T${t}`,
}));
const QUALITY_OPTS = QUALITIES.map((q) => ({ value: q.value, label: q.label }));
const ENCHANT_OPTS = [0, 1, 2, 3].map((e) => ({
  value: e,
  label: e === 0 ? "Base" : `.${e}`,
}));

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
  profit: number;
  margin: number;
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
        assumes an instant sell into its buy orders (tax only). Prices are
        crowd-sourced and may be stale — verify in-game before trading.
      </p>
    </div>
  );
}

// Multi-select chip list. Generic over the value type (string | number).
function ChipGroup<T extends string | number>({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  selected: T[];
  onChange: React.Dispatch<React.SetStateAction<T[]>>;
}) {
  // Functional updates so multiple toggles in one batch don't clobber each other.
  const toggle = (v: T) =>
    onChange((cur) =>
      cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]
    );
  const allOn = selected.length === options.length;
  return (
    <div className="flex flex-col gap-1 text-xs text-ao-muted">
      <div className="flex items-center justify-between">
        <span>{label}</span>
        <button
          type="button"
          onClick={() => onChange(allOn ? [] : options.map((o) => o.value))}
          className="text-ao-muted hover:text-white"
        >
          {allOn ? "Clear" : "All"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => toggle(o.value)}
            className={`rounded px-2.5 py-1 text-xs font-medium ${
              selected.includes(o.value)
                ? "bg-ao-gold text-black"
                : "bg-ao-bg text-ao-muted hover:text-white"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
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
