// The five overnight vitals that open their own detail page from the
// readiness screen. Plain module (no "use client") so the page, the API route
// and the chart all read the same config.

export type VitalKey = "hrv" | "rhr" | "spo2" | "resp" | "temp";

export const VITAL_KEYS: VitalKey[] = ["hrv", "rhr", "spo2", "resp", "temp"];

export function isVitalKey(s: string): s is VitalKey {
  return (VITAL_KEYS as string[]).includes(s);
}

/// One night's value. `lo` is the night's lowest reading (blood oxygen only).
/// Skin temp is stored as the deviation from Google's own baseline, in °C.
export type VitalPoint = { date: string; v: number; lo?: number };

/// A single reading inside one night, for the Day view.
export type VitalSample = { t: number; v: number };

export type VitalConfig = {
  label: string;
  title: string; // page heading
  unit: string;
  decimals: number;
  color: string;
  /// up: higher is better · down: lower is better · steady: closer to usual
  better: "up" | "down" | "steady";
  /// Google reports individual readings through the night, so a Day view exists.
  night: boolean;
  about: string;
  moves: string;
};

export const VITALS: Record<VitalKey, VitalConfig> = {
  hrv: {
    label: "HRV",
    title: "Heart rate variability",
    unit: "ms",
    decimals: 0,
    color: "#a78bfa",
    better: "up",
    night: true,
    about:
      "The tiny variation in time between heartbeats while you sleep. Higher than your usual means your nervous system has recovered; a dip means it's still dealing with stress.",
    moves: "Hard training, alcohol, late meals, poor sleep and illness pull it down. Rest days and consistent sleep bring it back.",
  },
  rhr: {
    label: "Resting HR",
    title: "Resting heart rate",
    unit: "bpm",
    decimals: 0,
    color: "#f87171",
    better: "down",
    night: false,
    about:
      "Your heart rate at full rest, measured overnight. A lower number usually means a fitter, well-recovered heart.",
    moves: "A jump of 3+ bpm over your usual often shows up before you feel run down: heavy training, alcohol, heat, dehydration or getting sick.",
  },
  spo2: {
    label: "Blood oxygen",
    title: "Blood oxygen",
    unit: "%",
    decimals: 1,
    color: "#38bdf8",
    better: "up",
    night: true,
    about:
      "How saturated your blood is with oxygen while you sleep. Most people sit between 95 and 99%.",
    moves: "Brief dips are normal. Frequent drops under 90%, or an average well below your usual, are worth paying attention to, especially with snoring or daytime fatigue.",
  },
  resp: {
    label: "Breathing",
    title: "Breathing rate",
    unit: "/min",
    decimals: 1,
    color: "#2dd4bf",
    better: "steady",
    night: false,
    about:
      "Breaths per minute during sleep. It's very stable night to night, which is what makes changes meaningful.",
    moves: "A rise of 1–2 breaths a minute over your usual is one of the earliest signs of illness or heavy fatigue.",
  },
  temp: {
    label: "Skin temp",
    title: "Skin temperature",
    unit: "°C",
    decimals: 1,
    color: "#fb923c",
    better: "steady",
    night: false,
    about:
      "How far your skin temperature overnight sits from your own normal. Google works out the normal from your last 30 nights.",
    moves: "Running warm by half a degree or more often comes with getting sick, alcohol, a hot room or the menstrual cycle.",
  },
};

/// Is this night in a good place against the athlete's usual?
export function vitalIsGood(key: VitalKey, v: number, usual: number | null): boolean | null {
  switch (key) {
    case "hrv":
      return usual == null ? null : v >= usual * 0.95;
    case "rhr":
      return usual == null ? null : v <= usual + 1;
    case "spo2":
      return v >= 94 && (usual == null || v > usual - 2);
    case "resp":
      return usual == null ? null : v <= usual + 1;
    case "temp":
      return Math.abs(v) < 0.5;
  }
}

export function fmtVital(key: VitalKey, v: number): string {
  const c = VITALS[key];
  if (key === "temp") {
    const r = Math.round(v * 10) / 10;
    return `${r > 0 ? "+" : r < 0 ? "−" : "±"}${Math.abs(r).toFixed(1)}`;
  }
  return c.decimals === 0 ? `${Math.round(v)}` : v.toFixed(c.decimals);
}
