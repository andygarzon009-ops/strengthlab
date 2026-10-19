import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { e1rm } from "@/lib/strengthProgression";
import {
  isMachineExercise,
  labelForType,
  formatDuration,
  formatLoad,
} from "@/lib/exercises";
import { normalizeExerciseName } from "@/lib/exerciseIdentity";
import BackButton from "@/components/BackButton";
import FriendButton from "@/components/FriendButton";
import ShareProfileButton from "@/components/ShareProfileButton";
import { getFriendState } from "@/lib/actions/friends";
import Avatar from "@/components/Avatar";
import ProfileCalendar from "@/components/ProfileCalendar";
import ProfilePhotoEdit from "@/components/ProfilePhotoEdit";
import StretchyCover from "@/components/StretchyCover";
import FavoriteLiftCard, { type FavoriteLiftStats } from "@/components/FavoriteLiftCard";
import FavoriteLiftPicker, { type PickableLift } from "@/components/FavoriteLiftPicker";
import { monthKey, type CalendarWorkout } from "@/lib/profileCalendar";

export const dynamic = "force-dynamic";

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewerId = await requireAuth();
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      username: true,
      image: true,
      coverImage: true,
      favoriteLift: true,
      preferredSplit: true,
      bio: true,
    },
  });
  if (!user) notFound();

  const isSelf = user.id === viewerId;
  const friendState = await getFriendState(viewerId, user.id);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  // Twelve WHOLE months back, not 365 days: the calendar pages through these
  // months, and a rolling 365-day window would leave the oldest one half
  // empty and make it look like the friend skipped those weeks.
  const earliest = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  // All-time sets, but only when they're needed: the favourite lift's
  // numbers, or the owner's picker list of everything they've logged.
  const needHistory = isSelf || !!user.favoriteLift;
  const [totalWorkouts, cheers, workouts, history] = await Promise.all([
    prisma.workout.count({ where: { userId: user.id } }),
    prisma.reaction.count({ where: { workout: { userId: user.id } } }),
    prisma.workout.findMany({
      where: { userId: user.id, date: { gte: earliest } },
      orderBy: { date: "desc" },
      select: {
        id: true,
        title: true,
        type: true,
        date: true,
        duration: true,
        calories: true,
        exercises: {
          select: {
            exercise: { select: { name: true } },
            sets: { select: { type: true, weight: true, reps: true } },
          },
        },
      },
    }),
    needHistory
      ? prisma.workoutExercise.findMany({
          where: { workout: { userId: user.id } },
          select: {
            workoutId: true,
            exercise: { select: { name: true } },
            workout: { select: { date: true } },
            sets: { select: { type: true, weight: true, reps: true } },
          },
          orderBy: { workout: { date: "asc" } },
        })
      : Promise.resolve([]),
  ]);

  // Picker list: every lift with logged reps, most-trained first.
  const pickable: PickableLift[] = [];
  if (isSelf) {
    const byKey = new Map<string, { name: string; workouts: Set<string> }>();
    for (const we of history) {
      if (!we.sets.some((st) => (st.reps ?? 0) > 0)) continue;
      const key = normalizeExerciseName(we.exercise.name) || we.exercise.name;
      const slot = byKey.get(key) ?? { name: we.exercise.name, workouts: new Set<string>() };
      slot.name = we.exercise.name; // latest spelling (history is date-asc)
      slot.workouts.add(we.workoutId);
      byKey.set(key, slot);
    }
    for (const v of byKey.values()) pickable.push({ name: v.name, sessions: v.workouts.size });
    pickable.sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
  }

  // The favourite lift's numbers, from its whole history.
  let favorite: FavoriteLiftStats | null = null;
  if (user.favoriteLift) {
    const favKey = normalizeExerciseName(user.favoriteLift) || user.favoriteLift;
    const perSession = new Map<
      string,
      { date: Date; e1: number; reps: number; set: { w: number; r: number } | null }
    >();
    for (const we of history) {
      const key = normalizeExerciseName(we.exercise.name) || we.exercise.name;
      if (key !== favKey) continue;
      const slot =
        perSession.get(we.workoutId) ?? { date: we.workout.date, e1: 0, reps: 0, set: null };
      for (const st of we.sets) {
        if (st.type === "WARMUP") continue;
        const w = st.weight ?? 0;
        const r = st.reps ?? 0;
        if (r <= 0) continue;
        slot.reps = Math.max(slot.reps, r);
        const est = w > 0 ? e1rm(w, r) : 0;
        if (est > slot.e1) {
          slot.e1 = est;
          slot.set = { w, r };
        }
      }
      perSession.set(we.workoutId, slot);
    }
    const sessions = [...perSession.values()].sort((a, b) => +a.date - +b.date);
    const loaded = sessions.some((x) => x.e1 > 0);
    const series = sessions
      .map((x) => (loaded ? x.e1 : x.reps))
      .filter((v) => v > 0);
    const bestIdx = series.length
      ? series.indexOf(Math.max(...series))
      : -1;
    const bestSession = loaded
      ? sessions.filter((x) => x.e1 > 0)[bestIdx]
      : sessions.filter((x) => x.reps > 0)[bestIdx];
    const first = loaded ? sessions.find((x) => x.e1 > 0) : sessions.find((x) => x.reps > 0);
    const last = sessions[sessions.length - 1];
    favorite = {
      name: user.favoriteLift,
      mode: loaded ? "load" : "reps",
      best: bestIdx >= 0 ? series[bestIdx] : 0,
      bestSet: bestSession
        ? loaded && bestSession.set
          ? `${formatLoad(user.favoriteLift, bestSession.set.w)} × ${bestSession.set.r}`
          : `${bestSession.reps} reps`
        : null,
      sessions: sessions.length,
      lastDaysAgo: last
        ? Math.floor((now.getTime() - last.date.getTime()) / 86_400_000)
        : null,
      trend: series.slice(-16),
      gain: series.length >= 2 ? Math.max(...series) - series[0] : null,
      since: first
        ? first.date.toLocaleString("en-US", { month: "short", year: "numeric" })
        : null,
    };
  }

  // This-month rings
  const monthWorkouts = workouts.filter((w) => new Date(w.date) >= monthStart);
  const monthSessions = monthWorkouts.length;
  const monthName = now.toLocaleString("en-US", { month: "long" });
  const monthMinutes = Math.round(
    monthWorkouts.reduce((s, w) => s + (w.duration ?? 0), 0) / 60,
  );
  const monthCalories = monthWorkouts.reduce(
    (s, w) => s + (w.calories ?? 0),
    0,
  );

  // Level from lifetime workouts.
  const level = Math.floor(totalWorkouts / 10) + 1;

  // Group every loaded workout by month, then by day. Keeping only the first
  // hit per day (workouts is date-desc) meant a double session showed one cell
  // linking to the later workout, with the earlier one unreachable from here.
  // Reversed so each day's list reads earliest-first, the order they trained.
  // The calendar pages through these months client-side, so a friend's older
  // sessions are reachable without another round trip.
  const workoutsByMonth: Record<
    string,
    Record<number, CalendarWorkout[]>
  > = {};
  for (const w of [...workouts].reverse()) {
    const d = new Date(w.date);
    const byDay = (workoutsByMonth[monthKey(d.getFullYear(), d.getMonth())] ??= {});
    (byDay[d.getDate()] ??= []).push({
      id: w.id,
      title: w.title || labelForType(w.type),
      typeLabel: labelForType(w.type),
      durationLabel: w.duration ? formatDuration(w.duration) : null,
    });
  }

  // Top lifts (e1RM)
  const bestByLift = new Map<
    string,
    { name: string; weight: number; reps: number; oneRM: number }
  >();
  for (const w of workouts) {
    for (const ex of w.exercises) {
      if (isMachineExercise(ex.exercise.name)) continue;
      const key = normalizeExerciseName(ex.exercise.name) || ex.exercise.name;
      for (const s of ex.sets) {
        if (s.type !== "WORKING") continue;
        const weight = s.weight ?? 0;
        const reps = s.reps ?? 0;
        if (weight <= 0 || reps <= 0 || reps > 10) continue;
        const oneRM = e1rm(weight, reps);
        const prev = bestByLift.get(key);
        if (!prev || oneRM > prev.oneRM)
          bestByLift.set(key, { name: ex.exercise.name, weight, reps, oneRM });
      }
    }
  }
  const topLifts = [...bestByLift.values()]
    .sort((a, b) => b.oneRM - a.oneRM)
    .slice(0, 5);

  const firstName = (user.name || "").split(" ")[0] || "They";
  const topOneRM = topLifts[0]?.oneRM ?? 1;

  return (
    <div className="max-w-lg mx-auto pb-6">
      {/* Cover — runs up under the status bar (the layout pads the top by
          the safe area; this takes it back) and stretches on overscroll. */}
      <div
        className="relative"
        style={{
          marginTop: "calc(-1 * env(safe-area-inset-top, 0px))",
          // clip, not hidden: trims the stretched cover's sides without
          // turning this into a scroll container or cutting off the avatar.
          overflowX: "clip",
        }}
      >
        <div
          className="w-full relative"
          style={{ height: "calc(160px + env(safe-area-inset-top, 0px))" }}
        >
          <StretchyCover
            background={
              user.coverImage
                ? `center/cover url(${user.coverImage})`
                : "radial-gradient(90% 120% at 15% 0%, rgba(34,197,94,0.55) 0%, rgba(34,197,94,0.12) 45%, transparent 70%), radial-gradient(70% 100% at 100% 20%, rgba(163,230,53,0.22) 0%, transparent 60%), #070a07"
            }
          >
          {!user.coverImage && (
            // Faint grid, like a lifting-platform floor, fading out downward.
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
                backgroundSize: "22px 22px",
                maskImage: "linear-gradient(180deg, black 0%, transparent 85%)",
                WebkitMaskImage: "linear-gradient(180deg, black 0%, transparent 85%)",
              }}
            />
          )}
          {/* Melt into the page instead of a hard edge. */}
          <div
            className="absolute inset-x-0 bottom-0 h-16"
            style={{ background: "linear-gradient(180deg, transparent, var(--bg))" }}
          />
          </StretchyCover>
        </div>
        <div
          className="absolute left-4"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
        >
          <BackButton href="/group" ariaLabel="Back to crew" />
        </div>
        {isSelf && (
          <div className="absolute right-3" style={{ bottom: 12 }}>
            <ProfilePhotoEdit kind="cover" hasImage={!!user.coverImage} />
          </div>
        )}
        {/* Avatar overlaps the cover */}
        <div className="absolute left-4" style={{ bottom: -40 }}>
          <div className="relative">
            <div
              style={{
                padding: 3,
                borderRadius: "9999px",
                background: "conic-gradient(from 200deg, #22c55e, #a3e635, #4ade80, #22c55e)",
                boxShadow: "0 0 28px rgba(74,222,128,0.35)",
              }}
            >
              <div style={{ padding: 3, background: "var(--bg)", borderRadius: "9999px" }}>
                <Avatar name={user.name} image={user.image} size={86} />
              </div>
            </div>
            <span
              className="absolute -bottom-1 -right-2 text-[12px] font-extrabold px-2 py-0.5 rounded-lg tabular-nums"
              style={{
                background: "linear-gradient(135deg, #d9f99d, #a3e635)",
                color: "#0a0a0a",
                border: "2px solid var(--bg)",
                boxShadow: "0 0 14px rgba(163,230,53,0.55)",
              }}
              title={`Level ${level}`}
            >
              ⚡{level}
            </span>
            {isSelf && (
              <div className="absolute -bottom-1 -left-1">
                <ProfilePhotoEdit kind="avatar" hasImage={!!user.image} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 pt-14">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[28px] font-extrabold tracking-tight leading-none truncate">
              {user.name}
            </h1>
            {user.username && (
              <p className="text-[13px] mt-1.5 font-medium" style={{ color: "#86efac" }}>
                @{user.username}
              </p>
            )}
            {(user.preferredSplit || user.bio) && (
              <p className="text-[13px] mt-1" style={{ color: "var(--fg-muted)" }}>
                {user.bio || user.preferredSplit}
              </p>
            )}
          </div>
          <div className="shrink-0">
            {isSelf ? (
              <ShareProfileButton userId={user.id} />
            ) : (
              <FriendButton targetUserId={user.id} initialState={friendState} />
            )}
          </div>
        </div>

        {/* Stat rings (this month) */}
        <section
          className="relative rounded-3xl pt-4 pb-4 px-2 mt-5 overflow-hidden"
          style={{
            background:
              "radial-gradient(120% 100% at 50% 0%, rgba(34,197,94,0.10) 0%, transparent 65%), var(--bg-card)",
            border: "1px solid var(--border-strong)",
          }}
        >
          <p
            className="text-[11px] font-semibold tracking-[0.14em] uppercase px-3"
            style={{ color: "var(--fg-muted)" }}
          >
            {monthName}
          </p>
          <div className="grid grid-cols-4 gap-1 mt-3">
            <Ring id="w" label="Workouts" value={monthSessions} goal={20} from="#60a5fa" to="#3b82f6" />
            <Ring id="m" label="Minutes" value={monthMinutes} goal={1000} from="#67e8f9" to="#06b6d4" />
            <Ring id="c" label="Calories" value={monthCalories} goal={6000} from="#fdba74" to="#f97316" />
            <Ring id="h" label="Cheers" value={cheers} goal={Math.max(10, cheers)} from="#f9a8d4" to="#ec4899" />
          </div>
        </section>

        {/* Favourite lift */}
        {favorite ? (
          <FavoriteLiftCard stats={favorite} isSelf={isSelf} pickable={pickable} />
        ) : (
          isSelf && <FavoriteLiftPicker lifts={pickable} current={null} variant="empty" />
        )}

        {/* History calendar */}
        <section
          className="rounded-3xl p-4 mt-3"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <ProfileCalendar
            year={now.getFullYear()}
            month={now.getMonth()}
            earliestYear={earliest.getFullYear()}
            earliestMonth={earliest.getMonth()}
            workoutsByMonth={workoutsByMonth}
            today={now.getDate()}
          />
        </section>

        {/* Top lifts */}
        {topLifts.length > 0 && (
          <section
            className="rounded-3xl p-4 mt-3"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="text-[16px] font-bold tracking-tight">Top lifts</h2>
              <span className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
                est. 1RM · last 12 months
              </span>
            </div>
            {topLifts.map((l, i) => (
              <div key={l.name} className="py-2.5">
                <div className="flex items-center gap-3">
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 tabular-nums"
                    style={{ background: "var(--bg-elevated)", color: "var(--fg-muted)" }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold truncate">{l.name}</p>
                    <p className="text-[11px] tabular-nums" style={{ color: "var(--fg-muted)" }}>
                      best set {formatLoad(l.name, l.weight)} × {l.reps}
                    </p>
                  </div>
                  <p className="text-[17px] font-bold tabular-nums shrink-0">
                    {Math.round(l.oneRM)}
                    <span className="text-[11px] font-medium ml-0.5" style={{ color: "var(--fg-muted)" }}>
                      lb
                    </span>
                  </p>
                </div>
                <div className="ml-9 mt-2 h-[5px] rounded-full" style={{ background: "var(--bg-elevated)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(8, (l.oneRM / topOneRM) * 100)}%`,
                      background: "rgba(74,222,128,0.55)",
                    }}
                  />
                </div>
              </div>
            ))}
          </section>
        )}

        {totalWorkouts === 0 && (
          <div
            className="rounded-3xl p-6 text-center mt-3"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
              {isSelf ? "No sessions logged yet." : `${firstName} hasn't logged a session yet.`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Ring({
  id,
  label,
  value,
  goal,
  from,
  to,
}: {
  id: string;
  label: string;
  value: number;
  goal: number;
  from: string;
  to: string;
}) {
  const frac = Math.max(0, Math.min(1, value / Math.max(1, goal)));
  const r = 30;
  const c = 2 * Math.PI * r;
  const display =
    value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value);
  const grad = `ring-${id}`;
  return (
    <div className="flex flex-col items-center">
      <svg width="76" height="76" viewBox="0 0 76 76" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
        {/* Track tinted with the ring's own colour */}
        <circle cx="38" cy="38" r={r} fill="none" stroke={to} strokeOpacity="0.14" strokeWidth="7" />
        {frac > 0 && (
          <circle
            cx="38"
            cy="38"
            r={r}
            fill="none"
            stroke={`url(#${grad})`}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - frac)}
            transform="rotate(-90 38 38)"
            style={{ filter: `drop-shadow(0 0 6px ${to}99)` }}
          />
        )}
        <text
          x="38"
          y="43"
          textAnchor="middle"
          fontSize="16"
          fontWeight="800"
          fill="var(--fg)"
          style={{ fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}
        >
          {display}
        </text>
      </svg>
      <span className="text-[11px] font-semibold mt-1.5" style={{ color: "var(--fg-muted)" }}>
        {label}
      </span>
    </div>
  );
}
