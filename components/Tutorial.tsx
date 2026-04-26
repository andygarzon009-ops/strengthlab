"use client";

import { useEffect, useState } from "react";

const SEEN_KEY = "strengthlab.tutorialSeen.v1";

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
    badge: "Welcome",
    title: "Train smarter with StrengthLab",
    body: "Your gym companion for logging lifts, tracking PRs, running interval workouts, and training with friends. Here's a 60-second tour.",
    icon: I(
      <>
        <path d="M6 4h2v16H6zM16 4h2v16h-2zM3 8h3v8H3zM18 8h3v8h-3zM8 11h8v2H8z" />
      </>
    ),
  },
  {
    badge: "Log workouts",
    title: "Capture every set",
    body: "Tap Log, choose your split, and add exercises. Each set takes weight, reps, and an optional RIR (reps in reserve).",
    bullets: [
      "Search the library or create custom exercises",
      "Plate-loaded lifts auto-convert plates ↔ pounds",
      "Hit the mic to dictate sets hands-free",
    ],
    icon: I(
      <>
        <path d="M11 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
      </>
    ),
  },
  {
    badge: "Rest timer",
    title: "Tap ✓ between sets",
    body: "Every set row has a green checkmark. Tap it when you finish a set and a countdown starts automatically.",
    bullets: [
      "Defaults to 2:00 — change it from the timer bar",
      "+15 / -15 / Pause / Skip controls",
      "Beeps and vibrates when rest is over",
    ],
    icon: I(
      <>
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2 2" />
        <path d="M9 2h6" />
      </>
    ),
  },
  {
    badge: "Interval timer",
    title: "HIIT, Tabata, and EMOMs",
    body: "Tap the floating stopwatch in the bottom-right to launch a full-screen interval timer. Works on top of any page.",
    bullets: [
      "Built-in presets: Tabata, HIIT 40/20, EMOM 1m & 2m",
      "Custom work / rest / rounds and save your own",
      "Audio + vibration cues at every transition",
    ],
    icon: I(
      <>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </>
    ),
  },
  {
    badge: "Track progress",
    title: "See every rep stack up",
    body: "History gives you a calendar view of every workout. Analytics breaks down volume, top lifts, muscle frequency, and PRs.",
    bullets: [
      "Auto PR detection (weight, reps, volume)",
      "Last-session hints when adding exercises",
      "Volume charts and split breakdowns",
    ],
    icon: I(
      <>
        <path d="M3 3v18h18" />
        <path d="M7 14l4-4 4 4 5-5" />
      </>
    ),
  },
  {
    badge: "Train together",
    title: "Groups & social feed",
    body: "Create a group with a 6-character invite code. Share workouts, react with 🔥💪🏆, comment, and start challenges.",
    bullets: [
      "Live feed of your group's workouts",
      "Challenges with deadlines and winners",
      "Reactions and comments on every session",
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
  {
    badge: "AI Coach",
    title: "Ask your trainer anything",
    body: "Tap the coach icon to chat with an AI trainer that knows your history, PRs, and goals. Voice or text.",
    bullets: [
      "Programs and form cues tailored to you",
      "Set goals from the profile page",
      "Customize the coach prompt to your style",
    ],
    icon: I(
      <>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </>
    ),
  },
  {
    badge: "You're set",
    title: "Time to lift",
    body: "You can re-open this tour anytime from your Profile page. Now go log your first workout.",
    icon: I(
      <>
        <polyline points="20 6 9 17 4 12" />
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
