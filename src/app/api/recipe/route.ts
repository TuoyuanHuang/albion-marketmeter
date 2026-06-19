import { NextRequest, NextResponse } from "next/server";
import { getRecipe, displayName } from "@/lib/items";
import type { Recipe } from "@/lib/items";

// GET /api/recipe?item=T4_BAG
// Returns the recipe plus every transitive sub-recipe and a name map, so the
// client can compute "buy materials" vs "craft sub-materials" without bundling
// the full recipe database.
export async function GET(req: NextRequest) {
  const item = req.nextUrl.searchParams.get("item");
  if (!item) {
    return NextResponse.json({ error: "item required" }, { status: 400 });
  }
  const root = getRecipe(item);
  if (!root) {
    return NextResponse.json(
      { error: "no recipe for item" },
      { status: 404 }
    );
  }

  const recipes: Record<string, Recipe> = {};
  const names: Record<string, string> = {};

  const visit = (id: string) => {
    if (recipes[id]) return;
    const r = getRecipe(id);
    names[id] = displayName(id);
    if (!r) return;
    recipes[id] = r;
    for (const res of r.resources) {
      names[res.id] = displayName(res.id);
      visit(res.id);
    }
  };
  visit(item);

  return NextResponse.json({ item, recipes, names });
}
