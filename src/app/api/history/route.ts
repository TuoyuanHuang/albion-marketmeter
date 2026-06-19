import { NextRequest, NextResponse } from "next/server";
import { AODP_BASE, HistorySeries } from "@/lib/albion";

// GET /api/history?item=T4_BAG&qualities=1&locations=Caerleon,Bridgewatch&scale=24
// Proxies the AODP price-history endpoint.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const item = sp.get("item");
  if (!item) {
    return NextResponse.json({ error: "item required" }, { status: 400 });
  }
  const qualities = sp.get("qualities") ?? "1";
  const locations = sp.get("locations");
  const scale = sp.get("scale") ?? "24"; // hours per data point (1, 6, or 24)

  const url = new URL(`${AODP_BASE}/history/${encodeURIComponent(item)}`);
  url.searchParams.set("qualities", qualities);
  url.searchParams.set("time-scale", scale);
  if (locations) url.searchParams.set("locations", locations);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "albion-market-app" },
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `upstream ${res.status}` },
        { status: 502 }
      );
    }
    const data = (await res.json()) as HistorySeries[];
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch failed" },
      { status: 502 }
    );
  }
}
