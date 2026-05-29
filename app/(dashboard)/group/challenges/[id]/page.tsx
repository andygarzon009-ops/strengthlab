import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/session";
import { loadChallenge } from "@/lib/loadChallenges";
import {
  challengeTypeLabel,
  formatScore,
  timeLeft,
} from "@/lib/crewChallenges";
import BackButton from "@/components/BackButton";
import ChallengeActions from "@/components/ChallengeActions";

export const dynamic = "force-dynamic";

const MEDAL = ["🥇", "🥈", "🥉"];

export default async function ChallengeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireAuth();
  const { id } = await params;
  const c = await loadChallenge(id, userId);
  if (!c) notFound();

  const isMember = c.standings.some((s) => s.isYou);
  const max = Math.max(1, ...c.standings.map((s) => s.score));

  const subtitle = (() => {
    const parts = [challengeTypeLabel(c.type)];
    if (c.type === "LIFT_RACE" && c.exerciseName) {
      parts.push(
        c.targetValue
          ? `${c.exerciseName} → ${Math.round(c.targetValue)} lb`
          : c.exerciseName,
      );
    }
    parts.push(timeLeft(c.endsAt));
    return parts.join(" · ");
  })();

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <BackButton href="/group/challenges" ariaLabel="Back to challenges" />
        <div className="min-w-0 flex-1">
          <p className="label" style={{ color: "var(--accent)" }}>
            Challenge
          </p>
          <h1 className="text-[22px] font-bold tracking-tight leading-none mt-1 truncate">
            {c.name}
          </h1>
          <p className="text-[12px] mt-1" style={{ color: "var(--fg-dim)" }}>
            {subtitle}
          </p>
        </div>
      </div>

      <div
        className="rounded-2xl divide-y mb-5"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        {c.standings.map((s, i) => (
          <div key={s.userId} className="px-4 py-3">
            <div className="flex items-center justify-between mb-1.5">
              <span
                className="text-[14px] truncate"
                style={{
                  color: s.isYou ? "var(--accent)" : "var(--fg)",
                  fontWeight: s.isYou ? 700 : 500,
                }}
              >
                <span className="tabular-nums mr-1.5">
                  {i < 3 ? MEDAL[i] : `${i + 1}.`}
                </span>
                {s.name}
                {s.reachedTarget && (
                  <span
                    className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{
                      background: "var(--accent-dim)",
                      color: "var(--accent)",
                    }}
                  >
                    HIT TARGET
                  </span>
                )}
              </span>
              <span className="text-[14px] font-bold tabular-nums shrink-0 ml-2">
                {formatScore(c.type, s.score)}
              </span>
            </div>
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ background: "var(--bg-elevated)" }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.round((s.score / max) * 100)}%`,
                  background: i === 0 ? "var(--accent)" : "var(--fg-muted)",
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <ChallengeActions id={c.id} isMember={isMember} isCreator={c.isCreator} />

      <p className="text-[11px] text-center mt-4" style={{ color: "var(--fg-dim)" }}>
        Standings update automatically from logged workouts.{" "}
        <Link href="/group" style={{ color: "var(--accent)" }}>
          Back to Crew
        </Link>
      </p>
    </div>
  );
}
