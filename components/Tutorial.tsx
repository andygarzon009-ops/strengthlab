"use client";

import { useEffect, useState } from "react";
import {
  VisualBody,
  VisualCoach,
  VisualCrew,
  VisualCycle,
  VisualFeed,
  VisualFinish,
  VisualHealth,
  VisualLog,
  VisualSets,
  VisualStart,
} from "@/components/TutorialVisuals";

// v3 made the tour a step-by-step walkthrough; v4 leads every slide with a
// mini preview of the real screen. Everyone sees the new tour once.
const SEEN_KEY = "strengthlab.tutorialSeen.v4";

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
  /// How to use it, in order — rendered as numbered steps.
  steps: string[];
  /// One extra thing worth knowing.
  tip?: string;
  /// A mini preview of the real screen, with example data.
  visual: React.ReactNode;
};

const SLIDES: Slide[] = [
  {
    badge: "Feed",
    title: "Your day at a glance",
    body: "Readiness, today's session and your training cycle — first thing you see.",
    visual: <VisualFeed />,
    steps: [
      "Tap Start to open today's session, pre-filled from last time.",
      "The bar below is your cycle — the blue dot is your next deload.",
    ],
  },
  {
    badge: "Start a workout",
    title: "Get going in two taps",
    body: "From the Today card, or the green + in the bottom bar.",
    visual: <VisualStart />,
    steps: [
      "Pick a type, then Begin workout to start the clock.",
      "Add exercises — or tap the mic and say them.",
    ],
  },
  {
    badge: "Log your sets",
    title: "Weight, reps, effort",
    body: "RIR is reps left in the tank — 0 means to failure.",
    visual: <VisualSets />,
    steps: [
      "Tap ✓ to finish a set; the rest timer starts.",
      "↘ adds a drop set under the set you just did.",
    ],
    tip: "Easy week? Flip on Deload week before saving.",
  },
  {
    badge: "Finish",
    title: "See what moved",
    body: "PRs, progress and heart rate are worked out for you.",
    visual: <VisualFinish />,
    steps: [
      "Lime means a PR — the line shows the lift's trend.",
      "Open any session to see every set and edit it.",
    ],
  },
  {
    badge: "Coach",
    title: "Ask it anything",
    body: "It knows your sessions, PRs, recovery and cycle.",
    visual: <VisualCoach />,
    steps: [
      "Tap Do this workout and the log fills itself in.",
      "Text sets mid-session — they're logged for you.",
    ],
  },
  {
    badge: "Training cycle",
    title: "Plan your blocks",
    body: "You → Training profile → Training cycle.",
    visual: <VisualCycle />,
    steps: [
      "Pick each block from the menu and set its weeks.",
      "Tap 💡 to see what a block means.",
    ],
  },
  {
    badge: "Body scan",
    title: "What's recovered",
    body: "Each muscle glows by how recently and how hard it was trained.",
    visual: <VisualBody />,
    steps: [
      "Red means hit again before it recovered.",
      "Ready in shows the hours until each muscle is good to go.",
    ],
  },
  {
    badge: "Log",
    title: "Every session, ever",
    body: "Tap Log in the bottom bar.",
    visual: <VisualLog />,
    steps: ["Green days you trained, blue days were deloads — tap one to open it."],
  },
  {
    badge: "Crew",
    title: "Train with friends",
    body: "Tap Crew, search a friend's @username and follow them.",
    visual: <VisualCrew />,
    steps: [
      "A green ring means they trained today.",
      "React with Fire, PR or Like.",
    ],
  },
  {
    badge: "Health",
    title: "Connect your watch",
    body: "You → Health & Fitbit → connect Google Health.",
    visual: <VisualHealth />,
    steps: [
      "Sleep, HRV and resting HR power your readiness.",
      "Set your Nutrition goal so your Fuel Score is right.",
    ],
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

      <div className="flex-1 overflow-y-auto px-6 pt-3 pb-4 flex flex-col items-center text-center">
        <div className="w-full flex justify-center mb-6">{slide.visual}</div>
        <p
          className="label mb-2"
          style={{ color: "var(--accent)", letterSpacing: "0.18em" }}
        >
          {slide.badge}
        </p>
        <h2 className="text-[24px] font-bold tracking-tight leading-tight mb-2 max-w-md">
          {slide.title}
        </h2>
        <p
          className="text-[14px] leading-snug max-w-md"
          style={{ color: "var(--fg-muted)" }}
        >
          {slide.body}
        </p>
        <ol className="mt-4 space-y-2.5 max-w-md w-full text-left">
          {slide.steps.map((step, i) => (
            <li
              key={step}
              className="flex items-start gap-3 text-[14px] leading-snug"
              style={{ color: "var(--fg)" }}
            >
              <span
                className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[12px] font-bold nums"
                style={{
                  background: "var(--accent-dim)",
                  color: "var(--accent)",
                  border: "1px solid rgba(34,197,94,0.3)",
                  fontFamily: "var(--font-geist-mono)",
                }}
              >
                {i + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
        {slide.tip && (
          <p
            className="mt-5 max-w-md w-full text-left text-[13px] leading-snug rounded-xl px-3.5 py-3"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--fg-muted)",
            }}
          >
            <span className="font-semibold" style={{ color: "var(--fg)" }}>
              Tip ·{" "}
            </span>
            {slide.tip}
          </p>
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
