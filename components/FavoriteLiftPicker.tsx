"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
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
  // Height of the part of the screen the keyboard isn't covering. iOS doesn't
  // shrink the layout for the keyboard, so a bottom sheet sized off 100vh ends
  // up underneath it; sizing off the visual viewport keeps the list above it.
  const [vh, setVh] = useState<number | null>(null);
  const [vTop, setVTop] = useState(0);

  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    const sync = () => {
      setVh(vv ? vv.height : window.innerHeight);
      // iOS can also scroll the visual viewport when the keyboard opens.
      setVTop(vv ? vv.offsetTop : 0);
    };
    sync();
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    // Freeze the page behind the sheet so a drag on the list can't scroll it.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      document.body.style.overflow = prev;
    };
  }, [open]);

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
          className="h-7 px-2.5 rounded-full text-[11px] font-semibold active:scale-95 transition-transform"
          style={{
            background: "rgba(0,0,0,0.35)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "var(--fg)",
          }}
        >
          Change
        </button>
      )}

      {open && createPortal(
        // Portalled to <body> and above the bottom nav (z-50), so no card's
        // overflow or stacking can clip it and the nav can't sit on top.
        <div
          className="fixed inset-x-0 z-[70] flex items-end justify-center"
          style={{
            top: vTop,
            height: vh ?? "100dvh",
            background: "rgba(0,0,0,0.6)",
            overscrollBehavior: "contain",
          }}
          onClick={() => !pending && setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Choose your favourite lift"
            className="w-full max-w-lg rounded-t-3xl flex flex-col"
            style={{
              background: "var(--bg-card)",
              borderTop: "1px solid var(--border-strong)",
              // Fixed height (not max) so filtering doesn't make the sheet
              // jump up and down as results come and go.
              height: vh ? Math.min(vh - 48, 620) : "min(78dvh, 620px)",
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
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                // 16px or iOS zooms the whole page in on focus.
                className="mt-3 w-full h-11 px-4 rounded-xl text-[16px] outline-none"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
              />
            </div>
            <div
              className="flex-1 min-h-0 overflow-y-auto px-2 pb-3"
              style={{ overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}
            >
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
        </div>,
        document.body,
      )}
    </>
  );
}
