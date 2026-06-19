// Shared Albion / AODP constants and types.

// AODP regional API. Markets are shared per region; Europe is the default here.
export const AODP_BASE = "https://europe.albion-online-data.com/api/v2/stats";

// Royal cities + Brecilien + the Caerleon Black Market.
export const CITIES = [
  "Bridgewatch",
  "Caerleon",
  "Fort Sterling",
  "Lymhurst",
  "Martlock",
  "Thetford",
  "Brecilien",
  "Black Market",
] as const;
export type City = (typeof CITIES)[number];

// Trading cities used by default in the flip finder (excludes Black Market,
// which only accepts sell orders to mobs).
export const TRADE_CITIES: City[] = [
  "Bridgewatch",
  "Caerleon",
  "Fort Sterling",
  "Lymhurst",
  "Martlock",
  "Thetford",
  "Brecilien",
];

export const QUALITIES = [
  { value: 1, label: "Normal" },
  { value: 2, label: "Good" },
  { value: 3, label: "Outstanding" },
  { value: 4, label: "Excellent" },
  { value: 5, label: "Masterpiece" },
] as const;

// Market fees. Defaults assume Premium status.
//  - salesTax: % taken from a completed sale (4% premium / 8% non-premium)
//  - setupFee: % listing fee paid up-front to place a sell order (2.5%)
export const DEFAULT_SALES_TAX = 0.04;
export const DEFAULT_SETUP_FEE = 0.025;

export interface PriceRow {
  item_id: string;
  city: string;
  quality: number;
  sell_price_min: number;
  sell_price_min_date: string;
  sell_price_max: number;
  buy_price_min: number;
  buy_price_max: number;
  buy_price_max_date: string;
}

export interface HistoryPoint {
  item_count: number;
  avg_price: number;
  timestamp: string;
}

export interface HistorySeries {
  location: string;
  item_id: string;
  quality: number;
  data: HistoryPoint[];
}

// "0" prices from the API mean "no data", not free — treat them as missing.
export const isPriced = (n: number | undefined | null): n is number =>
  typeof n === "number" && n > 0;

export function fmt(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

// How stale a quote is, in a compact human form.
export function ageOf(date: string | undefined): string {
  if (!date) return "—";
  const ms = Date.now() - new Date(date + "Z").getTime();
  if (ms < 0) return "now";
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
