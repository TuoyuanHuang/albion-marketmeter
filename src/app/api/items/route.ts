import { NextRequest, NextResponse } from "next/server";
import { searchItems } from "@/lib/items";

// GET /api/items?q=adept  -> ranked item search (server-side, keeps client bundle small)
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  return NextResponse.json(searchItems(q, 25));
}
