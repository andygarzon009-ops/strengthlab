"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteFoodLog } from "@/lib/actions/food";

type Row = {
  id: string;
  meal: string;
  name: string;
  portion: string | null;
  kcal: number;
  proteinG: number;
  photoUrl: string | null;
};

const ORDER = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"];
const LABEL: Record<string, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
  SNACK: "Snacks",
};

/// What you've logged in StrengthLab today, by meal, with delete. Google
/// Health foods aren't listed here — they're edited where they were logged.
export default function FoodLogToday({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();
  const live = rows.filter((r) => !gone.has(r.id));
  if (live.length === 0) return null;

  const remove = (id: string) => {
    setGone((g) => new Set(g).add(id));
    startTransition(async () => {
      await deleteFoodLog(id);
      router.refresh();
    });
  };

  return (
    <section className="rounded-2xl p-4 mb-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)" }}>
      <h2 className="text-[15px] font-bold tracking-tight">Logged today</h2>
      {ORDER.filter((m) => live.some((r) => r.meal === m)).map((m) => {
        const list = live.filter((r) => r.meal === m);
        const kcal = list.reduce((s, r) => s + r.kcal, 0);
        return (
          <div key={m} className="mt-3">
            <div className="flex items-baseline justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--fg-dim)" }}>
                {LABEL[m]}
              </p>
              <p className="text-[12px] tabular-nums" style={{ color: "var(--fg-muted)" }}>
                {Math.round(kcal).toLocaleString()} kcal
              </p>
            </div>
            {list.map((r) => (
              <div key={r.id} className="flex items-center gap-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
                {r.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.photoUrl} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                ) : (
                  <span className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center text-[15px]" style={{ background: "var(--bg-elevated)" }} aria-hidden>
                    🍽️
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium truncate">{r.name}</p>
                  <p className="text-[11px] truncate" style={{ color: "var(--fg-dim)" }}>
                    {[r.portion, `${Math.round(r.proteinG)}g protein`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <p className="text-[14px] font-semibold tabular-nums shrink-0">{Math.round(r.kcal)}</p>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  aria-label={`Delete ${r.name}`}
                  className="w-8 h-8 -mr-1.5 rounded-full flex items-center justify-center shrink-0"
                  style={{ color: "var(--fg-dim)" }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        );
      })}
    </section>
  );
}
