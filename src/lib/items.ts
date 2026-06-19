import itemsData from "@/data/items.json";
import recipesData from "@/data/recipes.json";

export interface Item {
  id: string;
  name: string;
  tier: number;
  group: string;
  sub: string;
}

// Tier/quality prefix words Albion prepends to item names. Stripped during
// search so "bag" matches every tier and the prefix doesn't add noise.
const TIER_PREFIXES = new Set([
  "beginner's",
  "novice's",
  "journeyman's",
  "adept's",
  "expert's",
  "master's",
  "grandmaster's",
  "elder's",
]);

// Bare tier words (no apostrophe-s), so a typed "expert" is also ignored.
const TIER_WORDS = new Set(
  [...TIER_PREFIXES].map((w) => w.replace(/'s$/, ""))
);

// Drop a leading tier-prefix word from an item name (handles ' and ’).
function stripTierPrefix(s: string): string {
  const norm = s.replace(/’/g, "'").toLowerCase().trimStart();
  const sp = norm.indexOf(" ");
  if (sp === -1) return norm;
  const first = norm.slice(0, sp);
  return TIER_PREFIXES.has(first) ? norm.slice(sp + 1).trimStart() : norm;
}

// Tokenise a query, dropping tier words wherever they appear ("expert bag",
// "adept's bag", "bag" all reduce to ["bag"]).
function queryTerms(query: string): string[] {
  return query
    .replace(/’/g, "'")
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t && !TIER_PREFIXES.has(t) && !TIER_WORDS.has(t));
}

export interface Recipe {
  resources: { id: string; count: number }[];
  silver: number;
  focus: number;
  amount: number;
}

export const ITEMS = itemsData as Item[];
export const RECIPES = recipesData as Record<string, Recipe>;

const byId = new Map(ITEMS.map((i) => [i.id, i]));

// Pre-compute the prefix-stripped search name for every item.
const searchName = new Map(ITEMS.map((i) => [i.id, stripTierPrefix(i.name)]));

export const getItem = (id: string): Item | undefined => byId.get(id);
export const getRecipe = (id: string): Recipe | undefined => RECIPES[id];

export const displayName = (id: string): string => byId.get(id)?.name ?? id;

// Lightweight ranked search over the item list. Matches on name and id,
// prioritising prefix matches so "T4 bag" / "adept" behave sensibly.
export function searchItems(query: string, limit = 30): Item[] {
  // Drop tier words from the query so "expert bag" / "adept's bag" → "bag".
  const terms = queryTerms(query);
  if (terms.length === 0) return [];
  const scored: { item: Item; score: number }[] = [];
  for (const item of ITEMS) {
    const name = searchName.get(item.id)!; // prefix-stripped, lowercase
    const id = item.id.toLowerCase();
    let score = 0;
    let ok = true;
    for (const t of terms) {
      if (name.startsWith(t)) score += 4;
      else if (name.includes(t)) score += 2;
      else if (id.includes(t)) score += 1;
      else { ok = false; break; }
    }
    if (ok) scored.push({ item, score });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.item.name.length - b.item.name.length ||
      a.item.tier - b.item.tier
  );
  return scored.slice(0, limit).map((s) => s.item);
}

// Groups offered in the flip scanner, in a sensible order. Each maps to one or
// more raw shopcategory values from the dump.
export const SCAN_GROUPS: { key: string; label: string; cats: string[] }[] = [
  { key: "resources", label: "Refined resources", cats: ["crafting"] },
  { key: "raw", label: "Raw resources", cats: ["gathering"] },
  { key: "weapons", label: "Weapons", cats: ["weapons"] },
  { key: "armors", label: "Armor (chest)", cats: ["armors"] },
  { key: "head", label: "Helmets", cats: ["head"] },
  { key: "shoes", label: "Shoes", cats: ["shoes"] },
  { key: "offhands", label: "Off-hands", cats: ["offhands"] },
  { key: "bags", label: "Bags", cats: ["bags"] },
  { key: "capes", label: "Capes", cats: ["capes"] },
  { key: "consumables", label: "Food & potions", cats: ["consumables"] },
  { key: "mounts", label: "Mounts", cats: ["mounts"] },
  { key: "artefacts", label: "Artifacts", cats: ["artefacts"] },
];

const GROUP_BY_KEY = new Map(SCAN_GROUPS.map((g) => [g.key, g]));

// Items matching a scan group + tier set, capped to keep the upstream scan
// bounded. Excludes the Caerleon/faction cape skins and unique map markers via
// the simple tier filter already applied at build time.
export function itemsForScan(
  groupKey: string,
  tiers: number[],
  cap = 400,
  subs?: Set<string>
): Item[] {
  const group = GROUP_BY_KEY.get(groupKey);
  if (!group) return [];
  const cats = new Set(group.cats);
  const tierSet = new Set(tiers);
  const useSubs = subs && subs.size > 0;
  const out: Item[] = [];
  for (const it of ITEMS) {
    if (!cats.has(it.group)) continue;
    if (tierSet.size && !tierSet.has(it.tier)) continue;
    if (useSubs && !subs!.has(it.sub)) continue;
    out.push(it);
    if (out.length >= cap) break;
  }
  return out;
}
