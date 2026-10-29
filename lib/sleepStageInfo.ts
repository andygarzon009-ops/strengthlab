// The four sleep stages that open their own detail page from the last-night
// card, like the overnight vitals. Plain module (no "use client") so the
// server-rendered sleep card and the client page read the same config.

export type StageKey = "deep" | "rem" | "light" | "awake";

export const STAGE_KEYS: StageKey[] = ["deep", "rem", "light", "awake"];

export function isStageKey(s: string): s is StageKey {
  return (STAGE_KEYS as string[]).includes(s);
}

/// Typical share of time asleep for an adult. Awake is judged in minutes.
export const STAGE_TARGET: Record<Exclude<StageKey, "awake">, [number, number]> = {
  deep: [13, 23],
  rem: [20, 25],
  light: [45, 60],
};

/// Awake time above this on a night reads as restless.
export const AWAKE_OK_MIN = 30;

/// How one night's share of a stage reads. Deep and REM are what the night is
/// for, so landing above the typical share is more of a good thing — only
/// falling short is worth flagging. Light is the opposite: above range means it
/// crowded the other two out.
export function stageVerdict(
  stage: StageKey,
  min: number,
  totalSleep: number,
): { text: "Low" | "High" | "In range" | "Normal" | "Restless"; good: boolean } {
  if (stage === "awake") {
    return min <= AWAKE_OK_MIN ? { text: "Normal", good: true } : { text: "Restless", good: false };
  }
  const pct = totalSleep > 0 ? (min / totalSleep) * 100 : 0;
  const [lo, hi] = STAGE_TARGET[stage];
  if (pct < lo) return { text: "Low", good: false };
  if (pct > hi) return { text: "High", good: stage !== "light" };
  return { text: "In range", good: true };
}

export const STAGE_MIN_KEY: Record<StageKey, "deepMin" | "remMin" | "lightMin" | "awakeMin"> = {
  deep: "deepMin",
  rem: "remMin",
  light: "lightMin",
  awake: "awakeMin",
};

export const STAGE_INFO: Record<StageKey, { title: string; about: string; why: string; moves: string }> = {
  deep: {
    title: "Deep sleep",
    about:
      "The slowest, heaviest sleep, when you're hardest to wake. Most of it comes in the first few hours of the night.",
    why: "Growth hormone peaks here and muscle and tissue repair does most of its work, so it's the stage that matters most for recovering from training.",
    moves:
      "Hard training days often raise it. Alcohol, a big late meal, a warm room and a late bedtime cut it. Regular sleep times and a cool, dark room help.",
  },
  rem: {
    title: "REM sleep",
    about:
      "Dreaming sleep. Your brain is nearly as active as when awake, and the stretches get longer toward morning.",
    why: "It's when your brain files away memory and skill, including the movement patterns you practise in the gym, and it keeps mood and focus steady.",
    moves:
      "Cutting the night short loses REM first, since most of it sits in the last few hours. Alcohol, cannabis and late caffeine all suppress it.",
  },
  light: {
    title: "Light sleep",
    about:
      "The bridge between waking, deep and REM, and normally about half the night. Your body cycles through it every 90 minutes or so.",
    why: "It still counts toward rest and memory. On its own a high share isn't a problem; it matters when it's crowding out deep and REM.",
    moves:
      "It grows when noise, light, stress or a restless night keep knocking you out of deeper stages. Read it alongside deep and REM.",
  },
  awake: {
    title: "Awake",
    about:
      "Time awake between falling asleep and getting up. Everyone wakes many times a night, mostly too briefly to remember; the tracker catches the longer ones.",
    why: `Up to about ${AWAKE_OK_MIN} minutes is normal. Regularly more than that breaks up your sleep cycles and costs deep and REM.`,
    moves:
      "Alcohol, caffeine, a late meal, needing the bathroom, noise, heat and stress all add wake time.",
  },
};
