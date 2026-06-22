import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Albion Market — EU",
  description:
    "Flip finder, crafting profit calculator and price history for Albion Online (Europe server), powered by the Albion Online Data Project.",
};

const NAV = [
  { href: "/", label: "Home" },
  { href: "/flips", label: "Flip Finder" },
  { href: "/crafting", label: "Crafting Calc" },
  { href: "/craft-suggest", label: "Craft Suggest" },
  { href: "/enchanting", label: "Enchanting" },
  { href: "/history", label: "Price History" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-ao-border bg-ao-panel">
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-bold">
              <span className="text-ao-gold">⚒ Albion Market</span>
              <span className="rounded bg-ao-border px-1.5 py-0.5 text-xs text-ao-muted">
                EU
              </span>
            </Link>
            <nav className="flex gap-1 text-sm">
              {NAV.slice(1).map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded px-3 py-1.5 text-ao-muted hover:bg-ao-border hover:text-white"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 py-8 text-xs text-ao-muted">
          Market data from the{" "}
          <a
            className="text-ao-gold hover:underline"
            href="https://www.albion-online-data.com/"
            target="_blank"
            rel="noreferrer"
          >
            Albion Online Data Project
          </a>
          . Prices are crowd-sourced and may be stale. Not affiliated with
          Sandbox Interactive.
        </footer>
      </body>
    </html>
  );
}
