import Link from "next/link";
import { formatPlates } from "@/lib/exercises";
import { loadTodayPlan, type TodayPlan } from "@/lib/todayPlan";
import { loadRecentPRs, type RecentPR } from "@/lib/recentPRs";
import { loadPhase, DELOAD_BLUE, PhaseLine, phaseChips } from "@/components/PhaseCard";
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
  const rest = plan.restDay;
  // On a rest day the rotation's next split isn't "up"; it only backs the
  // optional train-anyway link.
  const next = rest ? null : plan.next;
  const chips = phase ? phaseChips(phase) : null;
  const eyebrow = done ? "Done today" : rest ? `Today · ${plan.dayLabel}` : deload ? `Deload · ${plan.dayLabel}` : "Today's session";
  const title = done
    ? `${done.title}`
    : rest
      ? "Rest day"
      : next
      ? `${next.label} day`
      : "Your call today";
  const meta = done
    ? [`${done.lifts} lifts`, done.minutes ? `${done.minutes} min` : null]
    : rest
      ? [`${rest.daysTrained}/${rest.goal} days this week`, "Goal hit"]
      : next
      ? [`${next.lifts} lifts`, next.minutes ? `~${next.minutes} min` : null]
      : [];
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
    deload && !done && !rest
      ? `Same lifts, about ${deloadPct}% less work — nothing near failure. Use the light sets to clean up technique.`
      : plan.readiness.line;

  const Play = (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7 4v16l13-8z" />
    </svg>
  );
  const [metaMain, ...metaRest] = meta.filter((m): m is string => !!m);

  // Rings and the coach's line on top (DailyGlance), then today's session as
  // one panel: eyebrow and title with lifts/time beside it, the block's
  // reps / effort / rest as three chips, and the button.
  return (
    <DailyGlance
      recovery={recovery}
      activity={activity}
      // Once today's session is logged, Activity opens it.
      activityHref={done ? `/workout/${done.id}` : undefined}
      top={phase ? <PhaseLine phase={phase} /> : null}
      line={line}
    >
      <div
        className="mt-4 rounded-[22px] p-3.5"
        style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="label text-[10px] font-extrabold" style={{ color: deload ? DELOAD_BLUE : "var(--fg-dim)", letterSpacing: "0.14em" }}>
              {eyebrow}
            </p>
            <h2
              className="font-black leading-none mt-1.5 truncate"
              style={{ fontSize: compact ? 22 : 28, letterSpacing: "-0.035em" }}
            >
              {title}
            </h2>
          </div>
          {metaMain && (
            <span className="shrink-0 flex flex-col items-end gap-0.5 tabular-nums" style={{ fontFamily: "var(--font-geist-mono)" }}>
              <span className="text-[13px] font-bold">{metaMain}</span>
              {metaRest.length > 0 && (
                <span className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
                  {metaRest.join(" · ")}
                </span>
              )}
            </span>
          )}
        </div>
        {chips && !done && !rest && (
          <div className="grid gap-1.5 mt-3" style={{ gridTemplateColumns: `repeat(${chips.length}, minmax(0, 1fr))` }}>
            {chips.map(([v, l]) => (
              <span key={l} className="rounded-xl px-2.5 py-2 flex flex-col gap-px min-w-0" style={{ background: "rgba(255,255,255,0.04)" }}>
                <span className="text-[9.5px] font-bold uppercase truncate" style={{ letterSpacing: "0.12em", color: "var(--fg-dim)" }}>
                  {l}
                </span>
                <b className="text-[13px] tabular-nums truncate" style={{ fontFamily: "var(--font-geist-mono)" }}>
                  {v}
                </b>
              </span>
            ))}
          </div>
        )}
        {rest ? (
          <Link
            href={href}
            className="mt-2 block text-center text-[13px] font-semibold py-2"
            style={{ color: "var(--fg-muted)" }}
          >
            Feeling fresh? Train anyway
          </Link>
        ) : !done && (
          <Link
            href={href}
            className={`mt-3 ${compact ? "min-h-[46px] text-[14px]" : "min-h-[56px] text-[16px]"} rounded-[17px] flex items-center justify-center gap-2 font-extrabold active:scale-[0.99] transition-transform`}
            style={{
              background: "linear-gradient(160deg, #4ade80, #16a34a)",
              color: "#052e14",
              border: "1px solid rgba(255,255,255,0.28)",
              boxShadow: "0 12px 30px rgba(34,197,94,0.42), inset 0 1px 0 rgba(255,255,255,0.45)",
            }}
          >
            {Play}
            {cta}
          </Link>
        )}
      </div>
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
