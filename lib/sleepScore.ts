// Pure sleep-quality scoring, split out of lib/recovery (which is server-only)
// so client components can score a night they render.

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function sleepQualityScore(
  asleepMin: number,
  deepMin: number,
  remMin: number,
): number {
  const duration = clamp(((asleepMin - 180) / (480 - 180)) * 100, 0, 100);
  const denom = asleepMin || 1;
  const deepRemPct = ((deepMin + remMin) / denom) * 100;
  const quality = clamp(((deepRemPct - 20) / (50 - 20)) * 100, 0, 100);
  return 0.65 * duration + 0.35 * quality;
}
