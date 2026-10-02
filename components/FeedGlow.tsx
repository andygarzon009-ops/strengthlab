import { loadTodayPlan } from "@/lib/todayPlan";
import { loadRecentPRs } from "@/lib/recentPRs";
import { loadPhase, DELOAD_BLUE } from "@/components/PhaseCard";
import { getSession } from "@/lib/session";

// The day's colour behind every page, so its mood reads before any words:
// lime after a PR, blue in a deload, otherwise the recovery score's own
// colour. Nothing when there's nothing to say. Same treatment as a logged
// workout's glow — anchored to the screen, from just above centre with a
// fainter tone low down, fading in and breathing (.session-glow) — so it
// stays behind the content as you scroll. Rendered once by the app layout.
export default async function FeedGlow({ userId }: { userId: string }) {
  const [plan, prs, phase] = await Promise.all([
    loadTodayPlan(userId).catch(() => null),
    loadRecentPRs(userId).catch(() => []),
    loadPhase(userId).catch(() => null),
  ]);
  const score = plan?.readiness.score ?? null;
  const tint: ((alpha: number) => string) | null =
    prs.length > 0
      ? (a) => `rgba(163, 230, 53, ${a})`
      : phase?.state.isDeloadWeek
        ? (a) => hexToRgba(DELOAD_BLUE, a)
        : score != null
          ? (a) =>
              `hsla(${Math.round((Math.max(0, Math.min(100, score)) / 100) * 120)}, 80%, 48%, ${a})`
          : null;
  if (!tint) return null;
  return (
    <div
      aria-hidden
      className="session-glow pointer-events-none fixed inset-0 -z-10"
      style={{
        background: [
          `radial-gradient(85% 55% at 50% 38%, ${tint(0.15)} 0%, ${tint(0.05)} 50%, transparent 78%)`,
          `radial-gradient(70% 35% at 50% 100%, ${tint(0.07)} 0%, transparent 70%)`,
        ].join(", "),
        transform: "translateZ(0)",
      }}
    />
  );
}

function hexToRgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/// The layout doesn't know who's signed in; this reads the session and draws
/// the glow for them (nothing when signed out).
export async function AppGlow() {
  const session = await getSession();
  if (!session?.userId) return null;
  return <FeedGlow userId={session.userId} />;
}
