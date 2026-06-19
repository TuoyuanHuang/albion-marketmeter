"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { HistorySeries, fmt } from "@/lib/albion";

const COLORS = [
  "#d4a72c",
  "#2ea043",
  "#58a6ff",
  "#db61a2",
  "#f0883e",
  "#a371f7",
];

export default function PriceChart({
  series,
  metric,
  title,
}: {
  series: HistorySeries[];
  metric: "avg_price" | "item_count";
  title: string;
}) {
  // Merge all city series into rows keyed by timestamp.
  const byTime = new Map<string, Record<string, number | string>>();
  for (const s of series) {
    for (const p of s.data) {
      const row = byTime.get(p.timestamp) ?? { timestamp: p.timestamp };
      row[s.location] = p[metric];
      byTime.set(p.timestamp, row);
    }
  }
  const rows = Array.from(byTime.values()).sort((a, b) =>
    String(a.timestamp).localeCompare(String(b.timestamp))
  );
  const cities = series.map((s) => s.location);

  return (
    <div className="rounded-xl border border-ao-border bg-ao-panel p-4">
      <h3 className="mb-2 text-sm font-medium text-ao-muted">{title}</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={rows} margin={{ top: 5, right: 10, bottom: 0, left: 10 }}>
          <CartesianGrid stroke="#30363d" strokeDasharray="3 3" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={(t) => String(t).slice(5, 10)}
            stroke="#8b949e"
            fontSize={11}
          />
          <YAxis
            stroke="#8b949e"
            fontSize={11}
            width={60}
            tickFormatter={(v) =>
              v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
            }
          />
          <Tooltip
            contentStyle={{
              background: "#161b22",
              border: "1px solid #30363d",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "#8b949e" }}
            formatter={(v: number) => fmt(v)}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {cities.map((c, i) => (
            <Line
              key={c}
              type="monotone"
              dataKey={c}
              stroke={COLORS[i % COLORS.length]}
              dot={false}
              strokeWidth={2}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
