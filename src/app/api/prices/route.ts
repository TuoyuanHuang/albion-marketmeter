import { NextRequest, NextResponse } from "next/server";
import { AODP_BASE, PriceRow } from "@/lib/albion";

// GET /api/prices?items=T4_BAG,T5_BAG&qualities=1,2&locations=Caerleon
// Proxies the AODP current-prices endpoint (avoids browser CORS, adds caching).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const items = sp.get("items");
  if (!items) {
    return NextResponse.json({ error: "items required" }, { status: 400 });
  }
  const qualities = sp.get("qualities") ?? "1";
  const locations = sp.get("locations");

  const url = new URL(`${AODP_BASE}/prices/${encodeURIComponent(items)}`);
  url.searchParams.set("qualities", qualities);
  if (locations) url.searchParams.set("locations", locations);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "albion-market-app" },
      // Cache current prices briefly to be kind to the upstream API.
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `upstream ${res.status}` },
        { status: 502 }
      );
    }
    const data = (await res.json()) as PriceRow[];
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=60" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch failed" },
      { status: 502 }
    );
  }
}
