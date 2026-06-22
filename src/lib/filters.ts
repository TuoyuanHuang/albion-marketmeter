// Shared filter option lists for the flip scanner and craft-suggestion scanner.
import { QUALITIES } from "@/lib/albion";

export const GROUPS = [
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

// Crafting categories that make sense to scan for "what's worth crafting".
export const CRAFT_GROUPS = GROUPS.filter((g) =>
  ["resources", "weapons", "armors", "head", "shoes", "offhands", "bags", "capes", "consumables"].includes(
    g.value
  )
);

// Gear categories that can be enchanted with runes/souls/relics.
export const ENCHANT_GROUPS = GROUPS.filter((g) =>
  ["weapons", "armors", "head", "shoes", "offhands", "bags", "capes"].includes(
    g.value
  )
);

// Enchant upgrade steps (one enchant level each).
export const STEP_OPTS = [
  { value: 1, label: "Base → .1" },
  { value: 2, label: ".1 → .2" },
  { value: 3, label: ".2 → .3" },
];

// Subcategories per category (raw shopsubcategory1 value -> friendly label).
export const SUBGROUPS: Record<string, { value: string; label: string }[]> = {
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
export function availableSubs(selectedGroups: string[]) {
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

export const TIER_OPTS = [1, 2, 3, 4, 5, 6, 7, 8].map((t) => ({
  value: t,
  label: `T${t}`,
}));

export const QUALITY_OPTS = QUALITIES.map((q) => ({
  value: q.value,
  label: q.label,
}));

export const ENCHANT_OPTS = [0, 1, 2, 3].map((e) => ({
  value: e,
  label: e === 0 ? "Base" : `.${e}`,
}));
