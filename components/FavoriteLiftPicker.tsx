"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setFavoriteLift } from "@/lib/actions/workouts";
import Flame from "@/components/FlameIcon";

export type PickableLift = { name: string; sessions: number };

/// Bottom sheet for choosing your favourite lift, from the lifts you've
/// actually logged — most-trained first, with a search box.
export default function FavoriteLiftPicker({
  lifts,
  current,
  variant,
}: {
  lifts: PickableLift[];
  current: string | null;
  /// "empty" is the dashed call-to-action card; "edit" a small pill.
  variant: "empty" | "edit";
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? lifts.filter((l) => l.name.toLowerCase().includes(needle)) : lifts;
  }, [lifts, q]);

  const choose = (name: string | null) => {
    startTransition(async () => {
      await setFavoriteLift(name);
      setOpen(false);
      setQ("");
      router.refresh();
    });
  };

  return (
    <>
      {variant === "empty" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-3xl p-5 mt-3 flex items-center gap-4 text-left active:scale-[0.99] transition-transform"
          style={{
            background:
              "radial-gradient(120% 120% at 0% 0%, rgba(163,230,53,0.10) 0%, transparent 60%), var(--bg-card)",
            border: "1.5px dashed rgba(163,230,53,0.45)",
          }}
        >
          <span
            className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(163,230,53,0.14)" }}
          >
            <Flame size={24} />
          </span>
          <span className="min-w-0">
            <span className="block text-[16px] font-extrabold tracking-tight">Pick your favourite lift</span>
            <span className="block text-[12px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
              Show it off on your profile with your best numbers.
            </span>
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-8 px-3 rounded-full text-[12px] font-semibold active:scale-95 transition-transform"
          style={{
            background: "rgba(0,0,0,0.35)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "var(--fg)",
          }}
        >
          Change
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => !pending && setOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Choose your favourite lift"
            className="w-full max-w-lg rounded-t-3xl flex flex-col"
            style={{
              background: "var(--bg-card)",
              borderTop: "1px solid var(--border-strong)",
              maxHeight: "78vh",
              paddingBottom: "env(safe-area-inset-bottom)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2.5">
              <span className="w-10 h-1 rounded-full" style={{ background: "var(--border-strong)" }} />
            </div>
            <div className="px-5 pt-3 pb-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[18px] font-extrabold tracking-tight">Favourite lift</h3>
                {current && (
                  <button
                    type="button"
                    onClick={() => choose(null)}
                    disabled={pending}
                    className="text-[13px] font-semibold"
                    style={{ color: "var(--fg-muted)" }}
                  >
                    Remove
                  </button>
                )}
              </div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search your lifts"
                className="mt-3 w-full h-11 px-4 rounded-xl text-[15px] outline-none"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
              />
            </div>
            <div className="overflow-y-auto px-2 pb-3">
              {shown.length === 0 && (
                <p className="text-[13px] text-center py-8" style={{ color: "var(--fg-muted)" }}>
                  {lifts.length === 0 ? "Log a session first — your lifts show up here." : "No lifts match."}
                </p>
              )}
              {shown.map((l) => {
                const selected = l.name === current;
                return (
                  <button
                    key={l.name}
                    type="button"
                    onClick={() => choose(l.name)}
                    disabled={pending}
                    className="w-full flex items-center justify-between gap-3 px-3 py-3 rounded-xl text-left active:opacity-70"
                    style={selected ? { background: "rgba(163,230,53,0.12)" } : undefined}
                  >
                    <span className="min-w-0">
                      <span className="block text-[15px] font-semibold truncate">{l.name}</span>
                      <span className="block text-[11px]" style={{ color: "var(--fg-muted)" }}>
                        {l.sessions} session{l.sessions === 1 ? "" : "s"}
                      </span>
                    </span>
                    {selected ? (
                      <Flame size={18} />
                    ) : (
                      <span className="w-[18px]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
