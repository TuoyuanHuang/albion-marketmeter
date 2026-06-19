"use client";

import { useEffect, useRef, useState } from "react";

export interface ItemHit {
  id: string;
  name: string;
  tier: number;
  category: string;
}

// Debounced item autocomplete backed by /api/items.
export default function ItemSearch({
  onSelect,
  placeholder = "Search an item… (e.g. Adept's Bag, T6 axe)",
}: {
  onSelect: (item: ItemHit) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ItemHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!q.trim()) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/items?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        const data = (await res.json()) as ItemHit[];
        setHits(data);
        setActive(0);
        setOpen(true);
      } catch {
        /* aborted */
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const pick = (item: ItemHit) => {
    onSelect(item);
    setQ("");
    setHits([]);
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, hits.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && hits[active]) {
            e.preventDefault();
            pick(hits[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        className="w-full rounded-md border border-ao-border bg-ao-bg px-3 py-2 text-sm outline-none focus:border-ao-gold"
      />
      {open && hits.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-md border border-ao-border bg-ao-panel shadow-xl">
          {hits.map((h, i) => (
            <li
              key={h.id}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(h);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm ${
                i === active ? "bg-ao-border" : ""
              }`}
            >
              <span>
                <span className="text-ao-gold">T{h.tier}</span> {h.name}
              </span>
              <span className="font-mono text-xs text-ao-muted">{h.id}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
