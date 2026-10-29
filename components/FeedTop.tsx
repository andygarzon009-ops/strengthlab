import Link from "next/link";
import { formatPlates } from "@/lib/exercises";
import { loadTodayPlan, type TodayPlan } from "@/lib/todayPlan";
import { loadRecentPRs, type RecentPR } from "@/lib/recentPRs";
import { loadPhase, DELOAD_BLUE, PhaseLine, phaseRx } from "@/components/PhaseCard";
import type { ResolvedBlock } from "@/lib/blockStamp";
import Sparkline from "@/components/Sparkline";
import SharePRButton from "@/components/SharePRButton";
import DailyGlance, { type ActivityGlance, type RecoveryGlance } from "@/components/DailyGlance";
import { loadGlance } from "@/lib/glance";

export const PR_LIME = "#a3e635";

// The Today card. It opens with the day's glance (readiness gauge + Macros /
// Activity tiles), so readiness shows exactly once. A fresh PR sits above the
// cycle card as a slim strip (FeedPRs) rather than here.
export default async function FeedTop({ userId }: { userId: string }) {
  const [plan, phase, glance] = await Promise.all([
    loadTodayPlan(userId),
    loadPhase(userId).catch(() => null),
    loadGlance(userId).catch(() => null),
  ]);
  const deload = !!phase?.state.isDeloadWeek;
  const deloadPct = phase?.config.deloadReductionPct ?? 40;

  return (
    <TodayCard
      plan={plan}
      phase={phase}
      deload={deload}
      deloadPct={deloadPct}
      compact={false}
      recovery={glance?.recovery ?? null}
      activity={glance?.activity ?? null}
    />
  );
}

/// The feed's first row for 48 h after a PR: one slim strip per PR (they
/// swipe when there are several), small enough that the cycle and Today
/// still fit on the first screen.
export async function FeedPRs({ userId }: { userId: string }) {
  const prs = await loadRecentPRs(userId).catch(() => []);
  return prs.length > 0 ? <PRCard prs={prs} /> : null;
}

function TodayCard({
  plan,
  phase,
  deload,
  deloadPct,
  compact,
  recovery,
  activity,
}: {
  plan: TodayPlan;
  /// The training cycle, drawn as one line on top. Null with no cycle set up.
  phase: ResolvedBlock | null;
  deload: boolean;
  deloadPct: number;
  compact: boolean;
  recovery: RecoveryGlance | null;
  activity: ActivityGlance | null;
}) {
  const done = plan.doneToday;
  const next = plan.next;
  const rx = phase ? phaseRx(phase) : null;
  const eyebrow = `${deload ? "Deload week" : "Today"} · ${plan.dayLabel}`;
  const title = done
    ? `${done.title}`
    : next
      ? `${next.label} day`
      : "Your call today";
  const meta = done
    ? ["Done", `${done.lifts} lifts`, done.minutes ? `${done.minutes} min` : null]
    : next
      ? [`${next.lifts} lifts`, next.minutes ? `~${next.minutes} min` : null]
      : [];
  const metaLine = meta.filter(Boolean).join(" · ");
  // Start opens the coach with the ask already sent, so the session the
  // athlete does is the coach's prescription — warm-up, loads, rest — and not
  // a copy of the last session of that split.
  const ask = next
    ? `Plan today's ${next.label} workout for me${deload ? " — it's a deload week" : ""}. Include the warm-up.`
    : "Plan a workout for me today. Include the warm-up.";
  const href = `/?coach=1&ask=${encodeURIComponent(ask)}`;
  const cta = next ? `Start ${next.label} day` : "Start a session";
  // A deload overrides the readiness advice: however good the numbers look,
  // this is not the week to push.
  const line =
    deload && !done
      ? `Same lifts, about ${deloadPct}% less work — nothing near failure. Use the light sets to clean up technique.`
      : plan.readiness.line;

  const Arrow = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );

  // Option A: the plan sits beside the readiness gauge, Activity (and Fuel,
  // once logged) run under it, then the coach's line and the button. With a
  // PR card above, the title steps down and the button slims.
  const head = (
    <>
      <p
        className="label text-[11px]"
        style={{ color: deload ? DELOAD_BLUE : "var(--fg-dim)" }}
      >
        {eyebrow}
      </p>
      <h2
        className="font-extrabold tracking-tight leading-[1.05] mt-1.5 line-clamp-2"
        style={{ fontSize: compact ? 19 : 22, textWrap: "balance" }}
      >
        {title}
      </h2>
      {metaLine && (
        <p
          className="text-[13px] mt-2 truncate"
          style={{ color: "var(--fg-muted)", fontFamily: "var(--font-geist-mono)" }}
        >
          {metaLine}
        </p>
      )}
    </>
  );

  return (
    <DailyGlance
      recovery={recovery}
      activity={activity}
      // Once today's session is logged, Activity opens it (no button needed).
      activityHref={done ? `/workout/${done.id}` : undefined}
      top={phase ? <PhaseLine phase={phase} /> : null}
      head={head}
      below={
        rx ? (
          <p
            className="text-[11.5px] mt-3 truncate"
            style={{ color: "var(--fg-dim)", fontFamily: "var(--font-geist-mono)" }}
          >
            {rx}
          </p>
        ) : null
      }
    >
      <p className="text-[14px] leading-snug mt-3.5" style={{ color: "var(--fg)", opacity: 0.85 }}>
        {line}
      </p>
      {!done && (
        <Link
          href={href}
          className={`btn-accent ${compact ? "mt-3 min-h-[42px] rounded-xl text-[14px]" : "mt-4 min-h-[48px] rounded-2xl text-[15px]"} flex items-center justify-center gap-2 font-bold`}
        >
          {cta}
          {Arrow}
        </Link>
      )}
    </DailyGlance>
  );
}

function prLoad(pr: { exercise: string }, value: number) {
  const plates = formatPlates(pr.exercise, value);
  return plates ? { big: plates, unit: "" } : { big: String(value), unit: "lb" };
}

function PRCard({ prs }: { prs: RecentPR[] }) {
  return (
    <section
      aria-label="New personal record"
      className="mb-3 -mx-4 px-4 flex gap-3 overflow-x-auto snap-x snap-mandatory"
      style={{ scrollbarWidth: "none" }}
    >
      {prs.map((pr, i) => {
        const load = prLoad(pr, pr.value);
        const prev = pr.previous;
        const reps = pr.reps ?? 1;
        const gain = prev ? Math.round((pr.value - prev.value) * 10) / 10 : null;
        // Same weight, more reps: a reps PR. "360 → 360" read as nothing
        // changed, so it shows the reps instead.
        const repGain =
          prev && gain === 0 && prev.reps != null && reps > prev.reps ? reps - prev.reps : null;
        const improvement =
          gain && gain > 0 ? `+${gain} lb` : repGain ? `+${repGain} rep${repGain === 1 ? "" : "s"}` : null;
        const shareText = `New PR: ${pr.exercise} ${load.big}${load.unit ? " " + load.unit : ""} × ${reps}${improvement ? ` (${improvement})` : ""}`;
        const body = (
          <>
            <span
              className="w-9 h-9 shrink-0 rounded-[11px] flex items-center justify-center"
              style={{ background: "rgba(163,230,53,0.14)" }}
              aria-hidden
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={PR_LIME} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />
                <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="label block text-[10px] font-bold truncate" style={{ color: PR_LIME }}>
                New PR · {pr.when}
                {prs.length > 1 ? ` · ${i + 1} of ${prs.length}` : ""}
              </span>
              <span className="block mt-0.5 text-[13.5px] font-semibold truncate">{pr.exercise}</span>
              <span
                className="block mt-0.5 text-[13px] nums truncate"
                style={{ fontFamily: "var(--font-geist-mono)", color: PR_LIME }}
              >
                {load.big}
                {load.unit ? ` ${load.unit}` : ""} × {reps}
                {improvement && <span style={{ color: "var(--fg-muted)" }}> · {improvement}</span>}
              </span>
            </span>
            <Sparkline
              values={pr.trend}
              width={54}
              height={26}
              color={PR_LIME}
              strokeWidth={2}
              dot
              label={`${pr.exercise} top set, last 8 weeks`}
            />
          </>
        );
        return (
          <div
            key={pr.id}
            className="card snap-center shrink-0 w-full flex items-center gap-2.5 py-2.5 pl-3 pr-2.5"
            style={{
              borderColor: "rgba(163,230,53,0.4)",
              background: "radial-gradient(120% 140% at 0% 0%, rgba(163,230,53,0.12), transparent 60%), var(--bg-card)",
            }}
          >
            {pr.workoutId ? (
              <Link
                href={`/workout/${pr.workoutId}`}
                aria-label={`${shareText}. See the session`}
                className="min-w-0 flex-1 flex items-center gap-2.5 active:opacity-80"
              >
                {body}
              </Link>
            ) : (
              <div className="min-w-0 flex-1 flex items-center gap-2.5">{body}</div>
            )}
            <SharePRButton text={shareText} icon />
          </div>
        );
      })}
    </section>
  );
}
