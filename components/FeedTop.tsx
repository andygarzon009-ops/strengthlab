import Link from "next/link";
import { formatPlates } from "@/lib/exercises";
import { loadTodayPlan, type TodayPlan } from "@/lib/todayPlan";
import { loadRecentPRs, type RecentPR } from "@/lib/recentPRs";
import { loadPhase, DELOAD_BLUE } from "@/components/PhaseCard";
import Sparkline from "@/components/Sparkline";
import SharePRButton from "@/components/SharePRButton";

export const PR_LIME = "#a3e635";

// Same scale as the Recovery ring below, so the two never disagree in colour.
function scoreColor(score: number): string {
  const p = Math.max(0, Math.min(100, score));
  return `hsl(${Math.round((p / 100) * 120)}, 80%, 48%)`;
}

// The top of the feed. Normally the Today card; for 48 h after a PR the PR
// card leads and Today steps down to one row — it never disappears, because
// what to do today still matters.
export default async function FeedTop({ userId }: { userId: string }) {
  const [plan, prs, phase] = await Promise.all([
    loadTodayPlan(userId),
    loadRecentPRs(userId).catch(() => []),
    loadPhase(userId).catch(() => null),
  ]);
  const deload = !!phase?.state.isDeloadWeek;
  const deloadPct = phase?.config.deloadReductionPct ?? 40;

  return (
    <>
      {prs.length > 0 && <PRCard prs={prs} />}
      <TodayCard
        plan={plan}
        deload={deload}
        deloadPct={deloadPct}
        compact={prs.length > 0}
      />
    </>
  );
}

function Ring({ score, size }: { score: number | null; size: number }) {
  const stroke = size > 70 ? 7 : 5;
  const r = (size - stroke) / 2 - 1;
  const c = 2 * Math.PI * r;
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-elevated)" strokeWidth={stroke} />
        {score != null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={scoreColor(score)}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${(pct * c).toFixed(1)} ${c.toFixed(1)}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-semibold leading-none nums"
          style={{
            fontFamily: "var(--font-geist-mono)",
            fontSize: size > 70 ? 24 : 16,
          }}
        >
          {score ?? "—"}
        </span>
        {size > 70 && (
          <span className="label text-[9px] mt-1" style={{ color: "var(--fg-dim)" }}>
            Ready
          </span>
        )}
      </div>
    </div>
  );
}

function TodayCard({
  plan,
  deload,
  deloadPct,
  compact,
}: {
  plan: TodayPlan;
  deload: boolean;
  deloadPct: number;
  compact: boolean;
}) {
  const done = plan.doneToday;
  const next = plan.next;
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
  const href = done
    ? `/workout/${done.id}`
    : next
      ? `/log?clone=${next.templateId}`
      : "/log";
  const cta = done ? "See session" : next ? `Start ${next.label} day` : "Start a session";
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

  return (
    <section aria-label="Today" className="card mb-3" style={{ padding: compact ? 14 : 18 }}>
      <div className="flex items-center gap-4">
        <Ring score={plan.readiness.score} size={compact ? 56 : 84} />
        <div className="min-w-0 flex-1">
          <p
            className="label text-[11px]"
            style={{ color: deload ? DELOAD_BLUE : "var(--fg-dim)" }}
          >
            {eyebrow}
          </p>
          <h2
            className="font-extrabold tracking-tight leading-none mt-1.5 truncate"
            style={{ fontSize: compact ? 18 : 26 }}
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
        </div>
        {compact && (
          <Link
            href={href}
            className="btn-accent shrink-0 inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-xl text-[14px] font-bold"
          >
            {done ? "View" : "Start"}
            {Arrow}
          </Link>
        )}
      </div>

      <p className="text-[14px] leading-snug mt-3.5" style={{ color: "var(--fg)", opacity: 0.85 }}>
        {line}
      </p>

      {!compact && (
        <Link
          href={href}
          className={`${done ? "" : "btn-accent"} mt-4 flex items-center justify-center gap-2 min-h-[48px] rounded-2xl text-[15px] font-bold`}
          style={done ? { background: "var(--bg-elevated)", color: "var(--fg)" } : undefined}
        >
          {cta}
          {Arrow}
        </Link>
      )}
    </section>
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
        const shareText = `New PR: ${pr.exercise} ${load.big}${load.unit ? " " + load.unit : ""} × ${reps}${gain && gain > 0 ? ` (+${gain} lb)` : ""}`;
        return (
          <div
            key={pr.id}
            className="card snap-center shrink-0 w-full p-[18px] flex flex-col gap-3"
            style={{ borderColor: "rgba(163,230,53,0.4)" }}
          >
            <div className="flex items-baseline justify-between">
              <p className="label text-[11px] font-bold" style={{ color: PR_LIME }}>
                New PR · {pr.when}
              </p>
              {prs.length > 1 && (
                <span className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
                  {i + 1} of {prs.length}
                </span>
              )}
            </div>
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold truncate" style={{ color: "var(--fg-muted)" }}>
                  {pr.exercise}
                </p>
                <p className="mt-1.5 leading-none flex items-baseline gap-2.5">
                  <span
                    className="font-semibold tracking-tight nums"
                    style={{ fontFamily: "var(--font-geist-mono)", fontSize: 44, color: PR_LIME }}
                  >
                    {load.big}
                  </span>
                  <span className="text-[16px] nums" style={{ fontFamily: "var(--font-geist-mono)", color: "var(--fg-muted)" }}>
                    {load.unit ? `${load.unit} ` : ""}× {reps}
                  </span>
                </p>
                {prev && (
                  <p className="text-[12px] mt-2 nums" style={{ fontFamily: "var(--font-geist-mono)", color: "var(--fg-dim)" }}>
                    <span className="line-through">{prLoad(pr, prev.value).big}</span> → {load.big}
                    {gain && gain > 0 ? ` · +${gain} lb` : ""}
                  </p>
                )}
              </div>
              <Sparkline
                values={pr.trend}
                width={120}
                height={52}
                color={PR_LIME}
                strokeWidth={2.5}
                dot
                label={`${pr.exercise} top set, last 8 weeks`}
              />
            </div>
            <div className="flex gap-2">
              <SharePRButton text={shareText} />
              {pr.workoutId && (
                <Link
                  href={`/workout/${pr.workoutId}`}
                  className="flex-1 min-h-[44px] rounded-xl text-[14px] font-semibold flex items-center justify-center"
                  style={{ background: "var(--bg-elevated)", color: "var(--fg)" }}
                >
                  See the session
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
