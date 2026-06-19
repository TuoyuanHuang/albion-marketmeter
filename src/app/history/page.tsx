"use client";

import { useState } from "react";
import ItemSearch, { ItemHit } from "@/components/ItemSearch";
import { QUALITIES, HistorySeries, fmt } from "@/lib/albion";
import PriceChart from "@/components/PriceChart";

const CHART_CITIES = [
  "Caerleon",
  "Bridgewatch",
  "Lymhurst",
  "Martlock",
  "Thetford",
  "Fort Sterling",
];

const SCALES = [
  { value: "6", label: "Hourly (6h)" },
  { value: "24", label: "Daily" },
];

export default function HistoryPage() {
  const [item, setItem] = useState<ItemHit | null>(null);
  const [quality, setQuality] = useState(1);
  const [scale, setScale] = useState("24");
  const [series, setSeries] = useState<HistorySeries[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load(it: ItemHit, q = quality, s = scale) {
    setItem(it);
    setLoading(true);
    setErr(null);
    setSeries([]);
    try {
      const res = await fetch(
        `/api/history?item=${it.id}&qualities=${q}&scale=${s}&locations=${CHART_CITIES.map(
          encodeURIComponent
        ).join(",")}`
      );
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = (await res.json()) as HistorySeries[];
      setSeries(data.filter((s) => s.data?.length));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Price History</h1>
        <p className="text-sm text-ao-muted">
          Average sell price and traded volume over time, per city.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto]">
        <ItemSearch onSelect={(it) => load(it)} />
        <select
          value={quality}
          onChange={(e) => {
            const q = Number(e.target.value);
            setQuality(q);
            if (item) load(item, q, scale);
          }}
          className="rounded-md border border-ao-border bg-ao-bg px-2 py-2 text-sm"
        >
          {QUALITIES.map((q) => (
            <option key={q.value} value={q.value}>
              {q.label}
            </option>
          ))}
        </select>
        <select
          value={scale}
          onChange={(e) => {
            setScale(e.target.value);
            if (item) load(item, quality, e.target.value);
          }}
          className="rounded-md border border-ao-border bg-ao-bg px-2 py-2 text-sm"
        >
          {SCALES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {item && (
        <div className="text-sm text-ao-muted">
          <span className="text-white">{item.name}</span>{" "}
          <span className="font-mono text-xs">({item.id})</span>
        </div>
      )}
      {err && <div className="text-sm text-ao-red">Error: {err}</div>}
      {loading && <div className="text-sm text-ao-muted">Loading history…</div>}

      {series.length > 0 && (
        <div className="space-y-6">
          <PriceChart series={series} metric="avg_price" title="Average price" />
          <PriceChart
            series={series}
            metric="item_count"
            title="Traded volume (items)"
          />
        </div>
      )}

      {item && !loading && series.length === 0 && !err && (
        <p className="text-sm text-ao-muted">
          No history data available for this item / quality.
        </p>
      )}
      {!item && (
        <p className="text-sm text-ao-muted">
          Search for an item to chart its price history.
        </p>
      )}
    </div>
  );
}
