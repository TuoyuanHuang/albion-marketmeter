"use client";

import React from "react";

// Multi-select chip list. Generic over the value type (string | number).
// Uses functional state updates so multiple toggles in one batch don't clobber.
export default function ChipGroup<T extends string | number>({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  selected: T[];
  onChange: React.Dispatch<React.SetStateAction<T[]>>;
}) {
  const toggle = (v: T) =>
    onChange((cur) =>
      cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]
    );
  const allOn = selected.length === options.length;
  return (
    <div className="flex flex-col gap-1 text-xs text-ao-muted">
      <div className="flex items-center justify-between">
        <span>{label}</span>
        <button
          type="button"
          onClick={() => onChange(allOn ? [] : options.map((o) => o.value))}
          className="text-ao-muted hover:text-white"
        >
          {allOn ? "Clear" : "All"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => toggle(o.value)}
            className={`rounded px-2.5 py-1 text-xs font-medium ${
              selected.includes(o.value)
                ? "bg-ao-gold text-black"
                : "bg-ao-bg text-ao-muted hover:text-white"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
