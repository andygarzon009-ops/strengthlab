"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Tutorial, { markTutorialSeen } from "./Tutorial";

type Stop = {
  /** Route to navigate to before showing this stop. */
  route?: string;
  /** CSS selector for the element to highlight. Omit for a centered card. */
  selector?: string;
  /** Where to anchor the coach card relative to the highlight. */
  cardSide?: "top" | "bottom" | "auto";
  title: string;
  body: string;
};

const STOPS: Stop[] = [
  {
    title: "Welcome to StrengthLab",
    body:
      "We'll walk through the app together — quick stops at each feature on the actual page. Tap Next to begin.",
  },
  {
    selector: '[data-tour="bottom-nav"]',
    cardSide: "top",
    title: "Bottom navigation",
    body:
      "Move between Home, Log, History, Group, and Profile. The Log tab is where you record workouts.",
  },
  {
    route: "/log",
    selector: '[data-tour="add-exercise"]',
    title: "Add an exercise",
    body:
      "Tap here to search the exercise library or create a custom one. The mic next to it lets you dictate exercises hands-free.",
  },
  {
    route: "/log",
    selector: '[data-tour="timer-fab"]',
    cardSide: "top",
    title: "Training timer",
    body:
      "Stopwatch, interval (HIIT/EMOM), countdown, and AMRAP — all in one floating control. Stays out of the way until you need it.",
  },
  {
    route: "/log",
    selector: '[data-tour="coach-fab"]',
    cardSide: "top",
    title: "AI Coach",
    body:
      "Chat with a trainer that knows your history, PRs, and goals. Voice or text.",
  },
  {
    route: "/history",
    title: "History",
    body:
      "Every workout you log shows up on the calendar here. Tap a day to see the session detail.",
  },
  {
    route: "/analytics",
    title: "Analytics",
    body:
      "Volume trends, top lifts, muscle frequency, PRs — auto-generated from your logged sets.",
  },
  {
    route: "/group",
    title: "Train with friends",
    body:
      "Create a group with a 6-character invite code. Share workouts, react with 🔥💪🏆, and run challenges together.",
  },
  {
    route: "/profile",
    title: "You're set",
    body:
      "Customize your profile, set goals, and re-launch this tour anytime from the App tour button at the top of this page.",
  },
];

const PADDING = 8;

type Rect = { top: number; left: number; width: number; height: number };

export default function SpotlightTour({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [stopIndex, setStopIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [missing, setMissing] = useState(false);
  const [showFallback, setShowFallback] = useState(false);

  const stop = STOPS[stopIndex];
  const isLast = stopIndex === STOPS.length - 1;

  useEffect(() => {
    if (!open) return;
    // Reset when (re-)opened.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStopIndex(0);
    setRect(null);
    setMissing(false);
    setShowFallback(false);
  }, [open]);

  // Navigate when the stop's target route differs from the current path.
  useEffect(() => {
    if (!open) return;
    if (stop.route && stop.route !== pathname) {
      router.push(stop.route);
    }
  }, [open, stopIndex, stop.route, pathname, router]);

  // Locate the target element (poll briefly while the route loads).
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRect(null);
    setMissing(false);
    if (!stop.selector) return;
    if (stop.route && stop.route !== pathname) return; // wait for nav

    let cancelled = false;
    const start = Date.now();

    const tick = () => {
      if (cancelled) return;
      const el = document.querySelector(stop.selector!) as HTMLElement | null;
      if (el) {
        try {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        } catch {
          // ignore
        }
        // Allow the scroll to settle before measuring.
        setTimeout(() => {
          if (cancelled) return;
          const r = el.getBoundingClientRect();
          setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        }, 250);
        return;
      }
      if (Date.now() - start < 2500) {
        setTimeout(tick, 100);
      } else {
        setMissing(true);
      }
    };
    tick();

    return () => {
      cancelled = true;
    };
  }, [open, stopIndex, stop.selector, stop.route, pathname]);

  // Keep the highlight aligned during scroll/resize.
  useEffect(() => {
    if (!open || !stop.selector || missing) return;
    const update = () => {
      const el = document.querySelector(stop.selector!) as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, stop.selector, missing]);

  const finish = useCallback(() => {
    markTutorialSeen();
    onClose();
  }, [onClose]);

  if (!open) return null;

  if (showFallback) {
    return (
      <Tutorial
        open
        onClose={() => {
          setShowFallback(false);
          finish();
        }}
      />
    );
  }

  // No selector or element not found → show a centered card with no spotlight.
  const hasSpotlight = !!stop.selector && !!rect && !missing;
  const padded = rect
    ? {
        top: rect.top - PADDING,
        left: rect.left - PADDING,
        width: rect.width + PADDING * 2,
        height: rect.height + PADDING * 2,
      }
    : null;

  // Position the coach card.
  let cardPosition: "top" | "bottom" | "center";
  if (!hasSpotlight) cardPosition = "center";
  else if (stop.cardSide === "top") cardPosition = "top";
  else if (stop.cardSide === "bottom") cardPosition = "bottom";
  else {
    // Auto: card opposite the highlight half.
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    cardPosition = padded && padded.top + padded.height / 2 < vh / 2 ? "bottom" : "top";
  }

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Dim layer — built from 4 rects around the spotlight so the hole is
          truly click-through. If no spotlight, single full-screen scrim. */}
      {hasSpotlight && padded ? (
        <>
          <Dim
            style={{
              top: 0,
              left: 0,
              right: 0,
              height: Math.max(0, padded.top),
            }}
          />
          <Dim
            style={{
              top: padded.top + padded.height,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          />
          <Dim
            style={{
              top: padded.top,
              left: 0,
              width: Math.max(0, padded.left),
              height: padded.height,
            }}
          />
          <Dim
            style={{
              top: padded.top,
              left: padded.left + padded.width,
              right: 0,
              height: padded.height,
            }}
          />
          {/* Spotlight ring — purely decorative, ignores clicks. */}
          <div
            className="absolute rounded-2xl"
            style={{
              top: padded.top,
              left: padded.left,
              width: padded.width,
              height: padded.height,
              boxShadow: "0 0 0 2px var(--accent), 0 0 0 6px rgba(34,197,94,0.25)",
              pointerEvents: "none",
            }}
          />
        </>
      ) : (
        <Dim style={{ inset: 0 }} />
      )}

      {/* Coach card */}
      <div
        className="absolute pointer-events-auto"
        style={
          cardPosition === "center"
            ? {
                left: 16,
                right: 16,
                top: "50%",
                transform: "translateY(-50%)",
              }
            : cardPosition === "bottom"
            ? {
                left: 16,
                right: 16,
                bottom: "calc(env(safe-area-inset-bottom) + 16px)",
              }
            : {
                left: 16,
                right: 16,
                top: "calc(env(safe-area-inset-top) + 16px)",
              }
        }
      >
        <div
          className="rounded-2xl shadow-2xl mx-auto max-w-md"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
        >
          {/* Step progress */}
          <div className="flex gap-1 px-4 pt-3">
            {STOPS.map((_, i) => (
              <div
                key={i}
                className="flex-1 h-1 rounded-full"
                style={{
                  background:
                    i <= stopIndex ? "var(--accent)" : "var(--bg-elevated)",
                }}
              />
            ))}
          </div>

          <div className="px-4 pt-3 pb-4">
            <div className="flex items-baseline justify-between mb-1">
              <p
                className="label nums"
                style={{
                  color: "var(--accent)",
                  fontFamily: "var(--font-geist-mono)",
                }}
              >
                {String(stopIndex + 1).padStart(2, "0")} / {String(STOPS.length).padStart(2, "0")}
              </p>
              <button
                onClick={() => setShowFallback(true)}
                className="label text-[10px]"
                style={{ color: "var(--fg-dim)" }}
              >
                Overview slides →
              </button>
            </div>
            <h3 className="text-[18px] font-bold tracking-tight leading-tight mb-2">
              {stop.title}
            </h3>
            <p
              className="text-[13px] leading-relaxed"
              style={{ color: "var(--fg-muted)" }}
            >
              {stop.body}
            </p>
            {missing && stop.selector && (
              <p
                className="text-[11px] mt-2 italic"
                style={{ color: "var(--fg-dim)" }}
              >
                (Couldn&apos;t locate this element — keep going.)
              </p>
            )}
          </div>

          <div
            className="flex items-center gap-2 px-4 py-3"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <button
              onClick={finish}
              className="text-[12px] label"
              style={{ color: "var(--fg-dim)" }}
            >
              Skip
            </button>
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => setStopIndex((s) => Math.max(0, s - 1))}
                disabled={stopIndex === 0}
                className="btn-ghost px-4 py-2 rounded-xl text-[12px] font-semibold"
                style={{ opacity: stopIndex === 0 ? 0.4 : 1 }}
              >
                Back
              </button>
              <button
                onClick={() => {
                  if (isLast) finish();
                  else setStopIndex((s) => s + 1);
                }}
                className="btn-accent px-5 py-2 rounded-xl text-[12px] font-bold tracking-tight"
              >
                {isLast ? "Done" : "Next"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Dim({ style }: { style: React.CSSProperties }) {
  return (
    <div
      className="absolute pointer-events-auto transition-opacity"
      style={{ background: "rgba(0,0,0,0.7)", ...style }}
    />
  );
}
