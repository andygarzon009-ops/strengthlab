// Sleep-stage palette shared by the server-rendered sleep card and the
// client hypnogram. Lives outside any "use client" module: a server component
// that reads a value exported from one gets undefined at runtime.

export type SleepStageType = "deep" | "rem" | "light" | "awake" | "restless";

export type StageSeg = {
  type: SleepStageType;
  startMs: number;
  endMs: number;
};

export const STAGE_STYLE: Record<
  SleepStageType,
  { label: string; color: string; top: string }
> = {
  awake: { label: "Awake", color: "#ef5a6f", top: "#f47d8e" },
  rem: { label: "REM", color: "#38bdf8", top: "#7dd3fc" },
  light: { label: "Light", color: "#3b82f6", top: "#60a5fa" },
  deep: { label: "Deep", color: "#4f46e5", top: "#6366f1" },
  restless: { label: "Restless", color: "#f59e0b", top: "#fbbf24" },
};
