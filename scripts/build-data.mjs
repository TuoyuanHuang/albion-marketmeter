// Downloads the Albion Online binary dumps and produces three slim bundled files:
//   src/data/items.json    -> [{ id, name, tier, group, sub }]
//   src/data/recipes.json  -> { id: { resources, silver, focus, amount, fame, journal } }
//   src/data/journals.json -> { PROFESSION: { tier: maxFame } }
//
// Run with: npm run build:data
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "src", "data");

const ITEMS_JSON = "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/items.json";
const ITEMS_TXT = "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/formatted/items.txt";

// Normalise a value that the XML->JSON converter may emit as object OR array.
const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

// Convert a dump resource id to its market id: "T6_PLANKS_LEVEL1" -> "T6_PLANKS@1".
const marketId = (id) => {
  const m = (id || "").match(/^(.*)_LEVEL(\d)$/);
  return m ? `${m[1]}@${m[2]}` : id;
};

// Which crafting journal an item's crafting fame fills, by @craftingcategory.
// Warrior = plate + warrior weapons, Hunter = leather + hunter weapons,
// Mage = cloth + mage staves, Toolmaker = bags/capes/tools/off-hands.
const JOURNAL_BY_CC = {
  plate_armor: "WARRIOR", plate_helmet: "WARRIOR", plate_shoes: "WARRIOR",
  sword: "WARRIOR", axe: "WARRIOR", mace: "WARRIOR", hammer: "WARRIOR",
  knuckles: "WARRIOR", crossbow: "WARRIOR", quarterstaff: "WARRIOR",
  leather_armor: "HUNTER", leather_helmet: "HUNTER", leather_shoes: "HUNTER",
  bow: "HUNTER", spear: "HUNTER", dagger: "HUNTER", naturestaff: "HUNTER",
  cloth_armor: "MAGE", cloth_helmet: "MAGE", cloth_shoes: "MAGE",
  firestaff: "MAGE", froststaff: "MAGE", arcanestaff: "MAGE",
  holystaff: "MAGE", cursestaff: "MAGE",
  bag: "TOOLMAKER", cape: "TOOLMAKER", tools: "TOOLMAKER",
  offhand: "TOOLMAKER", gatherergear: "TOOLMAKER",
};
const CRAFT_PROFESSIONS = ["WARRIOR", "HUNTER", "MAGE", "TOOLMAKER"];

async function main() {
  console.log("Fetching item display names…");
  const txt = await (await fetch(ITEMS_TXT)).text();
  /** id -> display name */
  const nameMap = new Map();
  for (const line of txt.split("\n")) {
    // Format: "  123: T4_BAG : Adept's Bag"
    const m = line.match(/^\s*\d+:\s*(\S+)\s*:\s*(.+?)\s*$/);
    if (m) nameMap.set(m[1].trim(), m[2].trim());
  }
  console.log(`  ${nameMap.size} names`);

  console.log("Fetching item dump (recipes)…");
  const dump = (await (await fetch(ITEMS_JSON)).json()).items;

  // Categories in the dump that can hold craftable/tradeable items.
  const CATEGORIES = [
    "simpleitem",
    "consumableitem",
    "consumablefrominventoryitem",
    "equipmentitem",
    "weapon",
    "mount",
    "furnitureitem",
    "journalitem",
    "farmableitem",
  ];

  // Pass 1: item value of every item (used to compute crafting fame). A crafted
  // item's fame ≈ the sum of the item values of the resources consumed.
  const itemValue = new Map();
  for (const cat of Object.keys(dump)) {
    for (const it of asArray(dump[cat])) {
      const id = it?.["@uniquename"];
      if (id && it["@itemvalue"] != null) {
        itemValue.set(id, Number(it["@itemvalue"]) || 0);
      }
    }
  }

  // Journal fame capacity per profession/tier (T2–T8).
  const journals = {};
  for (const it of asArray(dump.journalitem)) {
    const m = (it["@uniquename"] || "").match(/^T(\d)_JOURNAL_([A-Z]+)$/);
    if (!m) continue;
    const prof = m[2];
    if (!CRAFT_PROFESSIONS.includes(prof)) continue;
    (journals[prof] ??= {})[m[1]] = Number(it["@maxfame"] || 0);
  }

  const items = [];
  const recipes = {};
  // Item-enchanting upgrade costs: { id: { "1": {id,count}, "2": {...}, "3": {...} } }
  // i.e. how many runes/souls/relics it takes to upgrade a finished item one
  // enchant level (.1 uses runes, .2 souls, .3 relics).
  const enchants = {};
  const seen = new Set();

  // Pass 2: items + recipes.
  for (const cat of CATEGORIES) {
    for (const it of asArray(dump[cat])) {
      const id = it["@uniquename"];
      if (!id || seen.has(id)) continue;
      seen.add(id);

      const tierMatch = id.match(/^T(\d)_/);
      const tier = tierMatch ? Number(tierMatch[1]) : 0;
      const name = nameMap.get(id) || id;
      // Friendly shop grouping used by the flip scanner filters.
      const group = it["@shopcategory"] || "";
      const sub = it["@shopsubcategory1"] || "";

      items.push({ id, name, tier, group, sub });

      // craftingrequirements may be a single object or an array of recipes.
      const reqs = asArray(it.craftingrequirements);
      if (reqs.length === 0) continue;

      // Pick the simplest standard recipe: the one whose resources contain no
      // faction tokens (those are the alternative faction-crafting recipes).
      let chosen = null;
      for (const r of reqs) {
        const res = asArray(r.craftresource);
        if (res.length === 0) continue;
        const hasToken = res.some((x) => /_TOKEN_/.test(x["@uniquename"] || ""));
        if (!hasToken) { chosen = r; break; }
        if (!chosen) chosen = r; // fallback
      }
      if (!chosen) continue;

      const resources = asArray(chosen.craftresource)
        .map((x) => ({ id: x["@uniquename"], count: Number(x["@count"]) }))
        .filter((x) => x.id && x.count > 0);
      if (resources.length === 0) continue;

      // Crafting fame for one craft ≈ sum of consumed resource item values.
      const fame = resources.reduce(
        (s, r) => s + (itemValue.get(r.id) || 0) * r.count,
        0
      );
      const journal = JOURNAL_BY_CC[it["@craftingcategory"]] || null;

      const recipe = {
        resources,
        silver: Number(chosen["@silver"] || 0),
        focus: Number(chosen["@craftingfocus"] || 0),
        amount: Number(chosen["@amountcrafted"] || 1),
        fame,
        journal,
      };

      // Enchanted recipes (levels 1-3) from the item's enchantments node. Each
      // uses enchanted materials (_LEVEL ids) and yields proportionally more fame.
      const ench = {};
      for (const e of asArray(it.enchantments?.enchantment)) {
        const lvl = Number(e["@enchantmentlevel"]);
        if (!(lvl >= 1 && lvl <= 3)) continue;
        const cr = e.craftingrequirements;
        const eres = asArray(cr?.craftresource)
          .map((x) => ({
            id: marketId(x["@uniquename"]),
            count: Number(x["@count"]),
            _dump: x["@uniquename"],
          }))
          .filter((x) => x.id && x.count > 0);
        if (eres.length === 0) continue;
        const efame = eres.reduce(
          (s, r) => s + (itemValue.get(r._dump) || 0) * r.count,
          0
        );
        ench[lvl] = {
          resources: eres.map(({ id, count }) => ({ id, count })),
          silver: Number(cr["@silver"] || 0),
          focus: Number(cr["@craftingfocus"] || 0),
          fame: efame,
        };
      }
      if (Object.keys(ench).length) recipe.ench = ench;

      recipes[id] = recipe;

      // Item-enchanting path: runes/souls/relics needed to upgrade the finished
      // item one enchant level (independent of the crafting path above).
      const upg = {};
      for (const e of asArray(it.enchantments?.enchantment)) {
        const lvl = Number(e["@enchantmentlevel"]);
        if (!(lvl >= 1 && lvl <= 3)) continue;
        const ur = asArray(e.upgraderequirements?.upgraderesource)
          .map((x) => ({ id: x["@uniquename"], count: Number(x["@count"]) }))
          .filter((x) => x.id && x.count > 0);
        if (ur.length) upg[lvl] = ur[0]; // single rune/soul/relic resource
      }
      if (Object.keys(upg).length) enchants[id] = upg;
    }
  }

  // Keep only tiered tradeable items for the searchable list (drops dev/test junk).
  const tradeable = items.filter((i) => i.tier >= 1 && /^T\d_/.test(i.id));
  tradeable.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  await writeFile(join(DATA_DIR, "items.json"), JSON.stringify(tradeable));
  await writeFile(join(DATA_DIR, "recipes.json"), JSON.stringify(recipes));
  await writeFile(join(DATA_DIR, "journals.json"), JSON.stringify(journals));
  await writeFile(join(DATA_DIR, "enchants.json"), JSON.stringify(enchants));

  const withJournal = Object.values(recipes).filter((r) => r.journal).length;
  console.log(
    `Wrote ${tradeable.length} items, ${Object.keys(recipes).length} recipes ` +
      `(${withJournal} with a journal), ${Object.keys(enchants).length} enchantable items, ` +
      `journals for ${Object.keys(journals).join(", ")}.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
