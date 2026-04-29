"use client";

import { useEffect, useState } from "react";

// Bumped from v1 → v2 when the tour was rewritten around the coach +
// autolog + rest-pill features. Old users see the new tour once.
const SEEN_KEY = "strengthlab.tutorialSeen.v2";

export const markTutorialSeen = () => {
  if (typeof window !== "undefined") {
    localStorage.setItem(SEEN_KEY, "1");
  }
};

export const hasSeenTutorial = () => {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(SEEN_KEY) === "1";
};

type Slide = {
  badge: string;
  title: string;
  body: string;
  bullets?: string[];
  icon: React.ReactNode;
};

const I = (path: React.ReactNode) => (
  <svg
    width="40"
    height="40"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {path}
  </svg>
);

const SLIDES: Slide[] = [
  {
    badge: "Log it yourself",
    title: "Capture every set, fast",
    body: "Hit Log, pick a session type, and add exercises. Each set takes weight × reps and an optional RIR.",
    bullets: [
      "Plate-loaded and Smith machine sets count plates per side — tap the +5 pill to wipe micro-loading",
      "Tap the rest pill on any exercise to fire a 60s–4m countdown when you check a set off",
      "Search the full exercise library, dictate sets with the mic, or add custom lifts",
    ],
    icon: I(
      <>
        <path d="M11 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
      </>
    ),
  },
  {
    badge: "Coach plans, you lift",
    title: "One tap to a programmed session",
    body: 'Ask the coach for a workout — "give me a push day", "what should I train today" — and tap "Do this workout" on the reply.',
    bullets: [
      "The logger opens pre-loaded with target weight × reps for every set",
      "The rest timer is auto-set to match the prescription on each lift",
      "As you train, just hit ✓ on each set — the timer fires automatically",
    ],
    icon: I(
      <>
        <polyline points="20 6 9 17 4 12" />
        <path d="M3 12h4M17 12h4" />
      </>
    ),
  },
  {
    badge: "Coach as a training partner",
    title: "Talk to it while you lift",
    body: 'Drop set reports into chat ("bench 225 for 5", "smoked it") and they\'re logged in the background — a green ✓ chip shows what was saved.',
    bullets: [
      "Real-time spotter calls — get the next set's load based on how the last one felt",
      "Form cues, progression reads, weekly planning, deload calls",
      "Voice or text — the coach sees every PR and recent session",
    ],
    icon: I(
      <>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <path d="M8 11h.01M12 11h.01M16 11h.01" />
      </>
    ),
  },
  {
    badge: "Progress + your crew",
    title: "Stack up reps, train together",
    body: "Every session is yours forever. Calendar view, volume charts, top lifts, muscle-group frequency, and auto-detected PRs.",
    bullets: [
      "Create a group with a 6-character invite code to share workouts",
      "React 🔥💪🏆 and comment on your crew's sessions",
      "Run challenges with deadlines and winners",
    ],
    icon: I(
      <>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
  },
];

export default function Tutorial({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    // Reset to first slide whenever the tutorial is re-opened.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setStep(0);
  }, [open]);

  if (!open) return null;

  const slide = SLIDES[step];
  const isLast = step === SLIDES.length - 1;

  const finish = () => {
    markTutorialSeen();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col"
      style={{ background: "var(--bg)" }}
    >
      <div
        className="px-4 flex items-center justify-between shrink-0"
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 12px)",
          paddingBottom: 12,
        }}
      >
        <p
          className="label text-[10px] nums"
          style={{
            color: "var(--fg-dim)",
            fontFamily: "var(--font-geist-mono)",
          }}
        >
          {String(step + 1).padStart(2, "0")} / {String(SLIDES.length).padStart(2, "0")}
        </p>
        <button
          onClick={finish}
          className="text-[12px] label"
          style={{ color: "var(--fg-dim)" }}
        >
          {isLast ? "Close" : "Skip"}
        </button>
      </div>

      <div className="px-2 pt-1 pb-3 flex gap-1.5 shrink-0">
        {SLIDES.map((_, i) => (
          <div
            key={i}
            className="flex-1 h-1 rounded-full transition-colors"
            style={{
              background:
                i < step
                  ? "var(--accent)"
                  : i === step
                  ? "var(--accent)"
                  : "var(--bg-elevated)",
              opacity: i <= step ? 1 : 1,
            }}
          />
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-6 pt-6 pb-4 flex flex-col items-center text-center">
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6"
          style={{
            background: "var(--accent-dim)",
            color: "var(--accent)",
            border: "1px solid rgba(34,197,94,0.25)",
          }}
        >
          {slide.icon}
        </div>
        <p
          className="label mb-2"
          style={{ color: "var(--accent)", letterSpacing: "0.18em" }}
        >
          {slide.badge}
        </p>
        <h2 className="text-[26px] font-bold tracking-tight leading-tight mb-3 max-w-md">
          {slide.title}
        </h2>
        <p
          className="text-[15px] leading-relaxed max-w-md"
          style={{ color: "var(--fg-muted)" }}
        >
          {slide.body}
        </p>
        {slide.bullets && (
          <ul className="mt-5 space-y-2 max-w-md w-full text-left">
            {slide.bullets.map((b) => (
              <li
                key={b}
                className="flex items-start gap-3 text-[14px]"
                style={{ color: "var(--fg)" }}
              >
                <span
                  className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: "var(--accent)" }}
                />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div
        className="px-4 pt-3 flex gap-2 shrink-0"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)",
          borderTop: "1px solid var(--border)",
          background: "var(--bg)",
        }}
      >
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="btn-ghost px-5 py-3.5 rounded-2xl text-[14px] font-semibold"
          style={{ opacity: step === 0 ? 0.4 : 1 }}
        >
          Back
        </button>
        <button
          onClick={() => {
            if (isLast) finish();
            else setStep((s) => s + 1);
          }}
          className="btn-accent flex-1 py-3.5 rounded-2xl text-[14px] font-bold tracking-tight"
        >
          {isLast ? "Start lifting" : "Next"}
        </button>
      </div>
    </div>
  );
}
