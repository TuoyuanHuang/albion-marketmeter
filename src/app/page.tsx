import Link from "next/link";

const CARDS = [
  {
    href: "/flips",
    title: "Flip Finder",
    desc: "Find profitable buy-low / sell-high trades between cities, after market tax.",
    icon: "⇄",
  },
  {
    href: "/crafting",
    title: "Crafting Calculator",
    desc: "Compare material cost vs sell price for any craftable item, with return-rate and fees.",
    icon: "⚒",
  },
  {
    href: "/craft-suggest",
    title: "Crafting Suggestions",
    desc: "Scan all craftable items and rank what's worth crafting, including journal value.",
    icon: "💡",
  },
  {
    href: "/history",
    title: "Price History",
    desc: "Chart historical average price and traded volume across cities over time.",
    icon: "📈",
  },
];

export default function Home() {
  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-ao-border bg-ao-panel p-6">
        <h1 className="text-2xl font-bold text-ao-gold">
          Albion Online Market Tools
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ao-muted">
          Live and historical market data for the <strong>Europe</strong>{" "}
          server, sourced from the Albion Online Data Project. Search any item to
          find arbitrage between cities, calculate crafting profit, or chart
          price trends.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="group rounded-xl border border-ao-border bg-ao-panel p-5 transition hover:border-ao-gold"
          >
            <div className="text-3xl">{c.icon}</div>
            <h2 className="mt-3 font-semibold group-hover:text-ao-gold">
              {c.title}
            </h2>
            <p className="mt-1 text-sm text-ao-muted">{c.desc}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
