"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { setPendingMeal } from "@/lib/pendingMeal";

/// "What are you logging?" — the sheet behind every New / + button. Workout
/// goes to the logger; Meal opens the camera right here (or the describe box)
/// and lands on the review sheet on /fuel.
export default function NewChooser({
  trigger,
}: {
  /// Render prop for the button that opens the sheet.
  trigger: (open: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setPendingMeal({ file });
    go("/fuel#log");
  };

  return (
    <>
      {trigger(() => setOpen(true))}
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[70] flex items-end justify-center"
            style={{ background: "rgba(0,0,0,0.6)" }}
            onClick={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Log something new"
              className="w-full max-w-lg rounded-t-3xl px-4 pt-2.5"
              style={{
                background: "var(--bg-card)",
                borderTop: "1px solid var(--border-strong)",
                paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 18px)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center">
                <span className="w-10 h-1 rounded-full" style={{ background: "var(--border-strong)" }} />
              </div>
              <h3 className="text-[18px] font-extrabold tracking-tight mt-3 mb-3 px-1">Log something</h3>

              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} />

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => go("/log")}
                  className="col-span-2 flex items-center gap-4 rounded-2xl p-4 text-left active:scale-[0.99] transition-transform"
                  style={{
                    background:
                      "radial-gradient(120% 140% at 0% 0%, rgba(34,197,94,0.22) 0%, transparent 60%), var(--bg-elevated)",
                    border: "1px solid rgba(34,197,94,0.35)",
                  }}
                >
                  <span
                    className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ background: "var(--accent)" }}
                    aria-hidden
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11" />
                    </svg>
                  </span>
                  <span>
                    <span className="block text-[16px] font-bold">Workout</span>
                    <span className="block text-[12px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
                      Lifting, cardio, mobility
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex flex-col gap-3 rounded-2xl p-4 text-left active:scale-[0.99] transition-transform"
                  style={{
                    background:
                      "radial-gradient(120% 140% at 0% 0%, rgba(56,189,248,0.18) 0%, transparent 60%), var(--bg-elevated)",
                    border: "1px solid rgba(56,189,248,0.3)",
                  }}
                >
                  <span
                    className="w-11 h-11 rounded-2xl flex items-center justify-center"
                    style={{ background: "#38bdf8" }}
                    aria-hidden
                  >
                    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                  </span>
                  <span>
                    <span className="block text-[15px] font-bold">Meal photo</span>
                    <span className="block text-[12px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
                      Snap it, we count it
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPendingMeal({ describe: true });
                    go("/fuel#log");
                  }}
                  className="flex flex-col gap-3 rounded-2xl p-4 text-left active:scale-[0.99] transition-transform"
                  style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-strong)" }}
                >
                  <span
                    className="w-11 h-11 rounded-2xl flex items-center justify-center"
                    style={{ background: "rgba(255,255,255,0.08)" }}
                    aria-hidden
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--fg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                    </svg>
                  </span>
                  <span>
                    <span className="block text-[15px] font-bold">Describe a meal</span>
                    <span className="block text-[12px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
                      Type what you ate
                    </span>
                  </span>
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
