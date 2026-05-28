"use client";

import { useState, type ReactNode } from "react";

/// Toggles a card section open/closed with a clickable header. Header is
/// always visible; the children render below when expanded. Persists state
/// in component memory only — refresh resets to defaultOpen.
export default function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = true,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card p-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-baseline justify-between"
        style={{ cursor: "pointer" }}
      >
        <div className="flex items-baseline gap-2">
          <h2 className="font-semibold text-[14px] tracking-tight">{title}</h2>
          <span
            className="text-[10px]"
            style={{ color: "var(--fg-dim)" }}
            aria-hidden
          >
            {open ? "▾" : "▸"}
          </span>
        </div>
        {subtitle && (
          <p
            className="label text-[9px]"
            style={{ color: "var(--fg-dim)" }}
          >
            {subtitle}
          </p>
        )}
      </button>
      {open && <div className="mt-4">{children}</div>}
    </div>
  );
}
