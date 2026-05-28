export type WarmupItem = {
  kind?: "cardio" | "mobility" | "activation";
  name: string;
  durationSec?: number;
  reps?: number;
  instructions?: string;
};

export const WARMUP_SPLIT_KEYS = [
  "PUSH",
  "PULL",
  "LEGS",
  "UPPER",
  "LOWER",
  "ARMS",
  "FULL_BODY",
  "CORE",
] as const;
export type WarmupSplitKey = (typeof WARMUP_SPLIT_KEYS)[number];

export type PreferredWarmups = Partial<Record<WarmupSplitKey, WarmupItem[]>>;
