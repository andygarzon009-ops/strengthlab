"use client";

import { useState } from "react";
import Link from "next/link";

type Projection = {
  exerciseName: string;
  baseWeight: number;
  baseReps: number;
  oneRepMax: number;
};

/// `href`, when set, turns the card into an entry point for a dedicated
/// strength page: the header links there and the footer swaps its inline
/// "view all" toggle for a link to the full trend.
export default function Projections({
  items,
  href,
}: {
  items: Projection[];
  href?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  if (items.length === 0) return null;

  const TOP = 5;
  // When linking out, always show just the top 5 — the full list lives on
  // the destination page.
  const visible = !href && showAll ? items : items.slice(0, TOP);
  const hasMore = items.length > TOP;

  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between mb-4">
        {href ? (
          <Link href={href} className="flex items-center gap-1">
            <h2 className="font-semibold text-[14px] tracking-tight">
              Projections
            </h2>
            <span className="text-[14px]" style={{ color: "var(--fg-dim)" }}>
              ›
            </span>
          </Link>
        ) : (
          <h2 className="font-semibold text-[14px] tracking-tight">
            Projections
          </h2>
        )}
        <p
          className="label text-[9px]"
          style={{ color: "var(--fg-dim)" }}
        >
          Estimated 1RM
        </p>
      </div>

      <div className="space-y-2">
        {visible.map((p, i) => (
          <div
            key={p.exerciseName}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
            }}
          >
            <span
              className="nums text-[11px] w-4 shrink-0"
              style={{
                fontFamily: "var(--font-geist-mono)",
                color: "var(--fg-dim)",
              }}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold truncate">
                {p.exerciseName}
              </p>
              <p
                className="text-[10px] mt-0.5 nums"
                style={{
                  fontFamily: "var(--font-geist-mono)",
                  color: "var(--fg-dim)",
                }}
              >
                from {p.baseWeight} × {p.baseReps}
              </p>
            </div>
            <p
              className="nums text-[15px] font-bold shrink-0"
              style={{
                fontFamily: "var(--font-geist-mono)",
                color: "var(--accent)",
              }}
            >
              {Math.round(p.oneRepMax)}
              <span className="text-[10px] font-normal opacity-70 ml-0.5">
                lb
              </span>
            </p>
          </div>
        ))}
      </div>

      {href ? (
        <Link
          href={href}
          className="mt-3 w-full text-[11px] font-semibold py-2 rounded-lg transition-colors block text-center"
          style={{
            color: "var(--accent)",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
          }}
        >
          View strength trend →
        </Link>
      ) : (
        hasMore && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="mt-3 w-full text-[11px] font-semibold py-2 rounded-lg transition-colors"
            style={{
              color: "var(--accent)",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
            }}
          >
            {showAll
              ? "Show top 5"
              : `View all ${items.length} projections`}
          </button>
        )
      )}

      <p
        className="text-[10px] mt-3"
        style={{ color: "var(--fg-dim)" }}
      >
        Epley formula · weight × (1 + reps ÷ 30)
      </p>
    </div>
  );
}
