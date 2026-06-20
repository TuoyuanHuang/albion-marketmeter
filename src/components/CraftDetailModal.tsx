"use client";

import { useEffect, useMemo, useState } from "react";
import { fmt, ageOf, QUALITIES } from "@/lib/albion";

const JOURNAL_LABEL: Record<string, string> = {
  WARRIOR: "Warrior",
  HUNTER: "Hunter",
  MAGE: "Mage",
  TOOLMAKER: "Toolmaker",
};

interface Quote {
  price: number;
  date: string;
}
interface Detail {
  item: string;
  name: string;
  tier: number;
  enchant: number;
  quality: number;
  amount: number;
  silver: number;
  fame: number;
  journal: string | null;
  city: string;
  product: { id: string } & Quote;
  resources: ({ id: string; name: string; count: number } & Quote)[];
  journalInfo:
    | {
        profession: string;
        maxFame: number;
        emptyId: string;
        fullId: string;
        empty: Quote;
        full: Quote;
      }
    | null;
}

export interface DetailTarget {
  item: string; // base id (no @enchant)
  enchant: number;
  quality: number;
}

export default function CraftDetailModal({
  target,
  city,
  rr,
  tax,
  fee,
  quantity,
  useJournals,
  onClose,
}: {
  target: DetailTarget;
  city: string;
  rr: number; // 0..1
  tax: number;
  fee: number;
  quantity: number;
  useJournals: boolean;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Editable price overrides (start from market, user can change).
  const [resPrice, setResPrice] = useState<Record<string, number>>({});
  const [productPrice, setProductPrice] = useState(0);
  const [emptyPrice, setEmptyPrice] = useState(0);
  const [fullPrice, setFullPrice] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setErr(null);
    const params = new URLSearchParams({
      item: target.item,
      enchant: String(target.enchant),
      quality: String(target.quality),
      city,
    });
    fetch(`/api/craft-detail?${params}`, { signal: ctrl.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `API ${r.status}`);
        return d as Detail;
      })
      .then((d) => {
        setDetail(d);
        setResPrice(Object.fromEntries(d.resources.map((x) => [x.id, x.price])));
        setProductPrice(d.product.price);
        setEmptyPrice(d.journalInfo?.empty.price ?? 0);
        setFullPrice(d.journalInfo?.full.price ?? 0);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setErr(e.message);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [target, city]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const calc = useMemo(() => {
    if (!detail) return null;
    const matCost = detail.resources.reduce(
      (s, r) => s + (resPrice[r.id] || 0) * r.count * (1 - rr),
      0
    );
    const totalCost = matCost + detail.silver;
    const revenue = productPrice * detail.amount * (1 - tax - fee);
    let journalProfit = 0;
    if (useJournals && detail.journalInfo && detail.fame) {
      const perFame =
        (fullPrice * (1 - tax - fee) - emptyPrice) / detail.journalInfo.maxFame;
      journalProfit = detail.fame * perFame;
    }
    const profitPerCraft = revenue + journalProfit - totalCost;
    const amount = detail.amount || 1;
    const journalsFilled = detail.journalInfo
      ? (detail.fame * quantity) / detail.journalInfo.maxFame
      : 0;
    return {
      matCost,
      revenue,
      journalProfit,
      perItem: profitPerCraft / amount,
      total: (profitPerCraft / amount) * quantity,
      margin: totalCost > 0 ? profitPerCraft / totalCost : 0,
      journalsFilled,
    };
  }, [detail, resPrice, productPrice, emptyPrice, fullPrice, rr, tax, fee, quantity, useJournals]);

  const qLabel = QUALITIES.find((q) => q.value === target.quality)?.label ?? "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-ao-border bg-ao-panel shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-ao-border p-4">
          <div>
            <div className="text-lg font-semibold">
              <span className="text-ao-gold">
                T{detail?.tier ?? target.item.match(/^T(\d)/)?.[1]}
                {target.enchant > 0 ? `.${target.enchant}` : ""}
              </span>{" "}
              {detail?.name ?? target.item}
              {target.quality > 1 && (
                <span className="ml-2 rounded bg-ao-border px-1.5 text-xs text-ao-muted">
                  {qLabel}
                </span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-ao-muted">
              Recipe &amp; prices in {city}. Edit any price to recompute.
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-ao-muted hover:bg-ao-border hover:text-white"
          >
            ✕
          </button>
        </div>

        {loading && <div className="p-4 text-sm text-ao-muted">Loading recipe…</div>}
        {err && <div className="p-4 text-sm text-ao-red">{err}</div>}

        {detail && calc && (
          <div className="space-y-4 p-4">
            {/* Materials */}
            <div>
              <div className="mb-1 text-xs font-medium uppercase text-ao-muted">
                Materials (after {(rr * 100).toFixed(1)}% return)
              </div>
              <div className="overflow-hidden rounded-lg border border-ao-border">
                <table className="w-full text-sm">
                  <thead className="bg-ao-bg text-left text-ao-muted">
                    <tr>
                      <th className="px-3 py-1.5">Material</th>
                      <th className="px-3 py-1.5 text-right">Qty</th>
                      <th className="px-3 py-1.5 text-right">Unit price</th>
                      <th className="px-3 py-1.5 text-right">Updated</th>
                      <th className="px-3 py-1.5 text-right">Line cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.resources.map((r) => (
                      <tr key={r.id} className="border-t border-ao-border">
                        <td className="px-3 py-1.5">
                          {r.name}
                          <span className="ml-2 font-mono text-xs text-ao-muted">
                            {r.id}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right">{r.count}</td>
                        <td className="px-3 py-1.5 text-right">
                          <PriceInput
                            value={resPrice[r.id] ?? 0}
                            onChange={(v) =>
                              setResPrice((p) => ({ ...p, [r.id]: v }))
                            }
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right text-xs text-ao-muted">
                          {r.price ? ageOf(r.date) : "no data"}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {fmt((resPrice[r.id] || 0) * r.count * (1 - rr))}
                        </td>
                      </tr>
                    ))}
                    {detail.silver > 0 && (
                      <tr className="border-t border-ao-border text-ao-muted">
                        <td className="px-3 py-1.5" colSpan={4}>
                          Crafting silver fee
                        </td>
                        <td className="px-3 py-1.5 text-right">{fmt(detail.silver)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Product + journal prices */}
            <div className="grid gap-3 sm:grid-cols-2">
              <EditCard
                label={`Sell price (${qLabel})`}
                value={productPrice}
                onChange={setProductPrice}
                age={detail.product.price ? ageOf(detail.product.date) : "no data"}
              />
              {detail.journalInfo && useJournals && (
                <div className="rounded-lg border border-ao-border p-3">
                  <div className="text-xs text-ao-muted">
                    {JOURNAL_LABEL[detail.journalInfo.profession]}&apos;s Journal ·{" "}
                    {fmt(detail.fame)} fame/craft
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="text-xs text-ao-muted">
                      Empty buy
                      <PriceInput value={emptyPrice} onChange={setEmptyPrice} block />
                    </label>
                    <label className="text-xs text-ao-muted">
                      Full sell
                      <PriceInput value={fullPrice} onChange={setFullPrice} block />
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Result */}
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Material cost / ea" value={fmt(calc.matCost / detail.amount)} />
              <Stat label="Sell net / ea" value={fmt(calc.revenue / detail.amount)} />
              <Stat
                label="Journal + / ea"
                value={calc.journalProfit > 0 ? `+${fmt(calc.journalProfit / detail.amount)}` : "—"}
              />
              <Stat
                label="Profit / ea"
                value={fmt(calc.perItem)}
                tone={calc.perItem >= 0 ? "good" : "bad"}
              />
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span>
                Total ×{quantity}:{" "}
                <span className={calc.total >= 0 ? "text-ao-green" : "text-ao-red"}>
                  {fmt(calc.total)}
                </span>
              </span>
              <span>
                Margin:{" "}
                <span className={calc.margin >= 0 ? "text-ao-green" : "text-ao-red"}>
                  {(calc.margin * 100).toFixed(0)}%
                </span>
              </span>
              {detail.journalInfo && useJournals && (
                <span className="text-ao-muted">
                  Fills {calc.journalsFilled.toFixed(1)} journal(s)
                </span>
              )}
            </div>

            <button
              onClick={() => {
                setResPrice(
                  Object.fromEntries(detail.resources.map((x) => [x.id, x.price]))
                );
                setProductPrice(detail.product.price);
                setEmptyPrice(detail.journalInfo?.empty.price ?? 0);
                setFullPrice(detail.journalInfo?.full.price ?? 0);
              }}
              className="rounded-md border border-ao-border px-3 py-1.5 text-xs text-ao-muted hover:text-white"
            >
              Reset to market prices
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PriceInput({
  value,
  onChange,
  block,
}: {
  value: number;
  onChange: (n: number) => void;
  block?: boolean;
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`${block ? "mt-1 w-full" : "w-28"} rounded border border-ao-border bg-ao-bg px-2 py-1 text-right text-sm text-white focus:border-ao-gold`}
    />
  );
}

function EditCard({
  label,
  value,
  onChange,
  age,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  age: string;
}) {
  return (
    <div className="rounded-lg border border-ao-border p-3">
      <div className="flex items-center justify-between text-xs text-ao-muted">
        <span>{label}</span>
        <span>{age}</span>
      </div>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded border border-ao-border bg-ao-bg px-2 py-1.5 text-right text-sm text-white focus:border-ao-gold"
      />
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  const color = tone === "good" ? "text-ao-green" : tone === "bad" ? "text-ao-red" : "";
  return (
    <div className="rounded-lg border border-ao-border bg-ao-bg p-2.5">
      <div className="text-xs text-ao-muted">{label}</div>
      <div className={`mt-0.5 font-semibold ${color}`}>{value}</div>
    </div>
  );
}
