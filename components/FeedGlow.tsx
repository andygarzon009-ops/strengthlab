import { loadTodayPlan } from "@/lib/todayPlan";
import { loadRecentPRs } from "@/lib/recentPRs";
import { loadPhase, DELOAD_BLUE } from "@/components/PhaseCard";
import { getSession } from "@/lib/session";

// A soft light behind the top of every page, so the day's mood reads before
// any words: lime after a PR, blue in a deload, otherwise the recovery
// score's own colour. Nothing when there's nothing to say. Rendered once by
// the app layout (AppGlow) and sits under the content in its isolated
// stacking context.
export default async function FeedGlow({ userId }: { userId: string }) {
  const [plan, prs, phase] = await Promise.all([
    loadTodayPlan(userId).catch(() => null),
    loadRecentPRs(userId).catch(() => []),
    loadPhase(userId).catch(() => null),
  ]);
  const score = plan?.readiness.score ?? null;
  const color =
    prs.length > 0
      ? "rgba(163,230,53,0.18)"
      : phase?.state.isDeloadWeek
        ? hexToRgba(DELOAD_BLUE, 0.16)
        : score != null
          ? `hsla(${Math.round((Math.max(0, Math.min(100, score)) / 100) * 120)}, 80%, 48%, 0.14)`
          : null;
  if (!color) return null;
  return (
    <div
      aria-hidden
      className="glow-in pointer-events-none absolute inset-x-0 -z-10"
      style={{
        top: "-4rem",
        height: 420,
        background: `radial-gradient(120% 340px at 50% 0, ${color} 0%, transparent 70%)`,
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
