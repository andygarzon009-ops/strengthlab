"use client";

import { useEffect, useState } from "react";

// Bumped v2 → v3 when the tour became a step-by-step walkthrough of the
// Today feed, training cycle, body scan and health sync. Everyone sees the
// new tour once.
const SEEN_KEY = "strengthlab.tutorialSeen.v3";

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
    badge: "Feed",
    title: "Your day at a glance",
    body: "The feed opens on what to do today, where you are in your training cycle, and how your week is going.",
    steps: [
      "Check the Today card: your readiness ring, the session that's up next, and a one-line read on your recovery.",
      "Tap Start to open that session pre-filled from the last time you did it.",
      "Below it, the cycle bar shows your current block, this week, and when the next deload lands.",
      "This week shows the days you've trained, your sets, PRs and average heart rate — tap Avg HR for the full chart.",
    ],
    tip: "The glow behind the page is the day's mood: green when recovered, blue in a deload, lime after a PR.",
    icon: I(
      <>
        <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
      </>
    ),
  },
  {
    badge: "Start a workout",
    title: "Get a session going",
    body: "Start from the Today card, or from scratch with the + button.",
    steps: [
      "Tap the green + in the bottom bar (or Start on the Today card).",
      "Pick the session type — Weight training, a run, a hike…",
      "Tap Begin workout to start the clock.",
      "Tap + Add Exercise to search the library, or the mic to say your exercises out loud.",
    ],
    tip: "Training with someone? Tap + Invite a training partner — you each keep your own log.",
    icon: I(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v8M8 12h8" />
      </>
    ),
  },
  {
    badge: "Log your sets",
    title: "Every set, in seconds",
    body: "Each set is weight × reps, plus how many reps you had left in the tank.",
    steps: [
      "Enter the weight and reps for the set.",
      "Add RIR — reps in reserve: 0 = to failure, 2 = two more were possible. Hard sets count for more in your recovery.",
      "Tap ✓ to check the set off — your rest timer starts if you've set one with the Rest timer pill.",
      "Went lighter straight after? Tap ↘ on a set to add a drop set under it.",
    ],
    tip: "Taking it easy this week? Turn on Deload week before you save.",
    icon: I(
      <>
        <path d="M11 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
      </>
    ),
  },
  {
    badge: "Finish",
    title: "Save it and see what moved",
    body: "Saving does the bookkeeping for you.",
    steps: [
      "Tap Finish (or Save) when you're done.",
      "PRs are detected automatically and get a lime PR badge.",
      "Your heart rate for the session syncs from your watch on its own.",
      "Open the session any time to see every set, the heart-rate chart, and edit it.",
    ],
    tip: "No heart rate? Open the session and tap Sync heart rate from Fitbit.",
    icon: I(
      <>
        <polyline points="20 6 9 17 4 12" />
      </>
    ),
  },
  {
    badge: "Coach",
    title: "A coach that knows your training",
    body: "It sees your sessions, PRs, recovery and training cycle.",
    steps: [
      "Tap the coach button above the bottom bar.",
      "Ask anything — \"what should I train today?\", \"give me a push day\", \"why is my bench stuck?\"",
      "On a workout reply, tap Do this workout — the log opens with every set and target weight filled in.",
      "Mid-session, text it your sets (\"bench 225 for 5\") and they're logged for you — a green ✓ shows what was saved.",
    ],
    tip: "Tell it how you like to train in Coach AI notes on your profile — it reads them every time.",
    icon: I(
      <>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <path d="M8 11h.01M12 11h.01M16 11h.01" />
      </>
    ),
  },
  {
    badge: "Training cycle",
    title: "Plan your blocks",
    body: "Your cycle tells the coach what you're training for each week — and when to back off.",
    steps: [
      "Go to You → Training profile → Training cycle (or tap the cycle card on the feed).",
      "Pick each block from the menu — Power-building, Hypertrophy, Pure strength… — and set its weeks.",
      "Tap the 💡 next to a block to see exactly what it means: reps, effort, rest and why.",
      "Set when the cycle started and how often to deload, then Save.",
    ],
    tip: "A week where you log deload sessions counts as your deload — the countdown restarts from there.",
    icon: I(
      <>
        <path d="M3 12h4l3-8 4 16 3-8h4" />
      </>
    ),
  },
  {
    badge: "Body scan",
    title: "See what's recovered",
    body: "The body map in This week colours each muscle by how recently and how hard you trained it.",
    steps: [
      "Dark = untouched for a week. Blue = stale. Green to lime = trained, building volume.",
      "Orange-red = overworked: hit again before recovering, or past its weekly limit.",
      "Ready in shows how many hours until each muscle is recovered — core bounces back in ~36 h, chest and hamstrings take ~72 h.",
      "Tap the card for your full progress breakdown.",
    ],
    tip: "Logging RIR makes it sharper — a set to failure counts for more than an easy one.",
    icon: I(
      <>
        <circle cx="12" cy="5" r="2" />
        <path d="M8 9h8l-1 6h-2l-1 6-1-6H9z" />
      </>
    ),
  },
  {
    badge: "Log",
    title: "Your history",
    body: "Every session you've ever logged, on a calendar and in a list.",
    steps: [
      "Tap Log in the bottom bar.",
      "Green days are training days, blue days were deloads — tap a day to open it.",
      "Scroll the list to see each session's top lift and how it moved since last time.",
    ],
    icon: I(
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </>
    ),
  },
  {
    badge: "Crew",
    title: "Train with friends",
    body: "Follow people to see their sessions and cheer them on.",
    steps: [
      "Tap Crew in the bottom bar.",
      "Search a friend's @username or name and follow them.",
      "React to their sessions with Fire, PR or Like, and leave comments.",
      "The row on your feed rings green when someone's trained today.",
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
    badge: "Health",
    title: "Connect your watch",
    body: "Sleep, HRV and resting heart rate power your readiness score and the coach's calls.",
    steps: [
      "Go to You → Health & Fitbit and connect Google Health.",
      "Recovery, sleep and activity fill in on their own from then on.",
      "Set your Nutrition goal (cut, bulk, maintain…) in your profile so your Fuel Score targets are right.",
    ],
    tip: "If a banner asks you to reconnect, tap it — Google's connection expires about weekly while the app is in testing.",
    icon: I(
      <>
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
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
        <ol className="mt-6 space-y-3 max-w-md w-full text-left">
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
