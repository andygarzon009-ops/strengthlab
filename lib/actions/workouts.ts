"use server";

import type { CardioMetrics } from "@/lib/cardio";
import { prisma } from "@/lib/db";
import { Prisma } from "@/app/generated/prisma";
import { isValidConfig, type PeriodizationConfig } from "@/lib/periodization";
import { blockStampColumns, localDateKey, resolveBlock } from "@/lib/blockStamp";
import { requireAuth } from "@/lib/session";
import { similarExerciseIds } from "@/lib/exerciseIdentity";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sendPushToUser } from "@/lib/push";
import { createNotification } from "@/lib/notifications";
import type { StretchRoutine } from "@/lib/stretchRoutine";
import {
  MEASUREMENT_KEYS,
  diffSnapshots,
  interpret,
  type MeasurementDelta,
  type MeasurementKey,
  type Snapshot,
} from "@/lib/bodyMeasurements";

type SetInput = {
  type: string;
  setNumber: number;
  weight?: number | null;
  reps?: number | null;
  rir?: number | null;
  notes?: string;
  loggedAt?: string | null;
  /// CARDIO rows only — see lib/cardio.ts.
  metrics?: CardioMetrics | null;
};

type ExerciseInput = {
  exerciseId: string;
  order: number;
  notes?: string;
  supersetGroup?: string | null;
  sets: SetInput[];
};

export type WarmupItem = {
  kind?: "cardio" | "mobility" | "activation";
  name: string;
  durationSec?: number;
  reps?: number;
  instructions?: string;
};

export type Warmup = { items: WarmupItem[] };

type WorkoutMetrics = {
  split?: string | null;
  duration?: number | null;
  distance?: number | null;
  pace?: string | null;
  avgHeartRate?: number | null;
  maxHeartRate?: number | null;
  rounds?: number | null;
  elevation?: number | null;
  incline?: number | null;
  speed?: number | null;
  level?: number | null;
  calories?: number | null;
  rpe?: number | null;
  startedAt?: string | null;
  endedAt?: string | null;
  warmup?: Warmup | null;
};

export type CreateWorkoutInput = {
  title: string;
  type: string;
  date: string;
  notes?: string;
  feeling?: string;
  isDeload?: boolean;
  exercises: ExerciseInput[];
  // When false, skip the social side effects (crew group post + friend
  // notifications). Defaults to true so normal logging is unchanged; used to
  // keep frequent, low-signal sessions (e.g. guided stretching) out of the
  // crew feed. PR detection and revalidation still run either way.
  broadcast?: boolean;
  /// The joint session this log belongs to, when the athlete was training with
  /// crew. The session is only honoured if they're actually a member of it —
  /// a client can't attach its log to someone else's session.
  sessionId?: string | null;
} & WorkoutMetrics;

export async function createWorkout(data: CreateWorkoutInput) {
  const userId = await requireAuth();

  // Freeze where in the cycle this session sits, so history can say "that was
  // Hypertrophy week 2" without re-deriving it from a config the athlete may
  // since have edited or restarted. Resolved against the session's OWN date,
  // not today, so a backdated entry lands in the week it was trained.
  // Best-effort: a session is worth more than its label, so any failure here
  // logs the workout unstamped rather than losing it.
  const stamp = await (async () => {
    try {
      const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { periodization: true, timezone: true },
      });
      if (!u) return blockStampColumns(null);
      const tz = u.timezone || "UTC";
      const resolved = await resolveBlock(
        userId,
        localDateKey(new Date(data.date), tz),
        { periodization: u.periodization, timezone: tz },
      );
      return blockStampColumns(resolved?.state ?? null);
    } catch {
      return blockStampColumns(null);
    }
  })();

  // A session id off the client is a claim, not a fact: honour it only if this
  // athlete really is a member. Otherwise the log saves solo, which is the
  // right failure — a workout is worth more than its social tag.
  const sessionMember = data.sessionId
    ? await prisma.sessionMember.findUnique({
        where: {
          sessionId_userId: { sessionId: data.sessionId, userId },
        },
        select: { id: true, status: true },
      })
    : null;
  const sessionId =
    sessionMember && sessionMember.status === "JOINED" ? data.sessionId! : null;

  const workout = await prisma.workout.create({
    data: {
      userId,
      ...stamp,
      sessionId,
      title: data.title,
      type: data.type,
      split: data.split ?? null,
      date: new Date(data.date),
      notes: data.notes,
      feeling: data.feeling,
      isDeload: data.isDeload ?? false,
      duration: data.duration ?? null,
      distance: data.distance ?? null,
      pace: data.pace ?? null,
      avgHeartRate: data.avgHeartRate ?? null,
      maxHeartRate: data.maxHeartRate ?? null,
      rounds: data.rounds ?? null,
      elevation: data.elevation ?? null,
      incline: data.incline ?? null,
      speed: data.speed ?? null,
      level: data.level ?? null,
      calories: data.calories ?? null,
      rpe: data.rpe ?? null,
      startedAt: data.startedAt ? new Date(data.startedAt) : null,
      endedAt: data.endedAt ? new Date(data.endedAt) : null,
      warmup: data.warmup ?? undefined,
      exercises: {
        create: data.exercises.map((ex) => ({
          exerciseId: ex.exerciseId,
          order: ex.order,
          notes: ex.notes,
          supersetGroup: ex.supersetGroup ?? null,
          sets: {
            // setNumber is the set's position in the exercise, not its
            // number within its type: readers order by it, and a DROP_SET
            // only renders chained to the set right before it.
            create: ex.sets.map((s, i) => ({
              type: s.type,
              setNumber: i + 1,
              weight: s.weight,
              reps: s.reps,
              rir: s.rir,
              notes: s.notes,
              loggedAt: s.loggedAt ? new Date(s.loggedAt) : null,
              metrics: s.metrics ?? undefined,
            })),
          },
        })),
      },
    },
    include: {
      exercises: { include: { sets: true, exercise: true } },
    },
  });

  if (sessionId && sessionMember) {
    // Best-effort: the log is saved either way, and a missing back-reference
    // only costs the session recap one of its two sides.
    try {
      await prisma.sessionMember.update({
        where: { id: sessionMember.id },
        data: { workoutId: workout.id },
      });
      // Everyone who joined has now saved, so the session is over. Closing it
      // matters beyond tidiness: an open session lingers as the one the next
      // invite attaches to, and members still marked JOINED in it make a fresh
      // invitation look like a re-attach.
      const unfinished = await prisma.sessionMember.count({
        where: { sessionId, status: "JOINED", workoutId: null },
      });
      if (unfinished === 0) {
        await prisma.trainingSession.updateMany({
          where: { id: sessionId, endedAt: null },
          data: { endedAt: new Date() },
        });
      }
    } catch {
      // ignore
    }
  }

  const prs = await detectAndSavePRs(
    userId,
    workout.id,
    workout.exercises,
    workout.date
  );

  const broadcast = data.broadcast !== false;

  // Auto-broadcast to every group the athlete is in as a chat message.
  // When the session produced one or more PRs, attach them to the post
  // so the crew sees a celebratory "🏆 PR" card instead of the plain
  // "just logged" line — turns logging into a social event. Skipped when
  // broadcast is false (e.g. a guided stretch session).
  if (broadcast) {
    const memberships = await prisma.groupMember.findMany({
      where: { userId },
      select: { groupId: true },
    });
    if (memberships.length > 0) {
      const cardType = prs.length > 0 ? "WORKOUT_PR" : null;
      const cardData = prs.length > 0 ? { prs } : undefined;
      await prisma.groupPost.createMany({
        data: memberships.map((m) => ({
          groupId: m.groupId,
          userId,
          text: "",
          workoutId: workout.id,
          cardType,
          cardData,
        })),
      });
    }

    // Ping crew friends who want to be motivated when someone trains.
    // Fully best-effort: any failure here must never break logging a workout.
    await notifyFriendsOfWorkout(userId, workout.id, workout.title, prs.length > 0);
  }

  // Clear the server-side draft now that the workout is committed.
  // Failures here are non-fatal — the draft will get overwritten next
  // time the user opens the form.
  await prisma.workoutDraft
    .delete({ where: { userId } })
    .catch(() => undefined);

  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/group");
  revalidatePath("/analytics");
  // Return the new workoutId so the client can navigate. We avoid the
  // server-side redirect() so a transient failure surfaces as a normal
  // catchable error and the client keeps the draft for retry.
  return { workoutId: workout.id };
}

// Log a completed guided stretch/mobility session as a real MOBILITY workout,
// so it lands in History and counts toward streaks/consistency like any other
// session. MOBILITY is a DURATION-shape type, so no sets/exercises are needed:
// the session is a title + a duration, with the stretches captured in notes.
// The elapsed time is the routine's planned length (holds + rests), which is
// stable regardless of pauses or time spent navigating away mid-routine.
export async function logStretchWorkout(input: {
  routine: StretchRoutine;
  elapsedSec: number;
}) {
  const { routine, elapsedSec } = input;
  const stretches = Array.isArray(routine?.stretches) ? routine.stretches : [];
  if (stretches.length === 0) {
    throw new Error("Empty routine — nothing to log");
  }

  const minutes = Math.max(1, Math.round((elapsedSec || 0) / 60));
  const lines = stretches.map((s) => {
    const secs = Math.max(0, Math.round(s.durationSec || 0));
    const dur = secs >= 60 ? `${Math.round((secs / 60) * 10) / 10} min` : `${secs}s`;
    const side = s.side === "both" ? " each side" : "";
    return `• ${s.name} — ${dur}${side}`;
  });
  const notes = [
    `Guided mobility session · ${stretches.length} ${
      stretches.length === 1 ? "stretch" : "stretches"
    }`,
    ...lines,
  ].join("\n");

  const now = new Date().toISOString();
  return createWorkout({
    title: routine.title?.trim() || "Stretch & Mobility",
    type: "MOBILITY",
    date: now,
    endedAt: now,
    duration: minutes,
    notes,
    exercises: [],
    // Stretch sessions are frequent and low-signal — keep them out of the
    // crew feed and friend notifications. Still logged to History and streaks.
    broadcast: false,
  });
}

export type DetectedPR = {
  exerciseId: string;
  exerciseName: string;
  type: "WEIGHT" | "REPS";
  value: number;
  reps: number | null;
};

export async function detectAndSavePRs(
  userId: string,
  workoutId: string,
  exercises: any[],
  workoutDate: Date
): Promise<DetectedPR[]> {
  const created: DetectedPR[] = [];
  // Pull the full exercise pool once so we can compare PRs across
  // near-duplicate exercise rows (e.g. a user's typo of a canonical lift).
  const allExercises = await prisma.exercise.findMany({
    select: { id: true, name: true },
  });

  for (const ex of exercises) {
    // PRs are tracked from straight WORKING sets only. SUPERSET sets are
    // intentionally lighter volume work (the partner lift pre-fatigues the
    // athlete and the goal is hypertrophy, not a max), so they'd contaminate
    // the PR ladder with non-max-effort weights. They still count toward
    // tonnage and weak-spot scoring.
    const workingSets = ex.sets.filter((s: any) => s.type === "WORKING");
    if (workingSets.length === 0) continue;

    const siblingIds = Array.from(
      similarExerciseIds(
        ex.exerciseId,
        ex.exercise?.name ?? null,
        allExercises
      )
    );

    // Identify the set with the heaviest weight, breaking ties on more
    // reps so 270×6 outranks 270×5 — adding a rep at the PR weight is
    // a real progression and should register as a WEIGHT PR.
    const heaviestSet = workingSets.reduce((best: any, s: any) => {
      const sw = s.weight ?? 0;
      const bw = best.weight ?? 0;
      if (sw > bw) return s;
      if (sw === bw && (s.reps ?? 0) > (best.reps ?? 0)) return s;
      return best;
    }, workingSets[0]);
    const maxWeight = heaviestSet.weight ?? 0;
    const weightAtMaxReps = heaviestSet.reps ?? null;

    // Identify the set with the most reps, breaking ties on heavier
    // weight — 25 lb × 8 reps outranks 0 lb × 8 reps as a rep PR.
    const highestRepSet = workingSets.reduce((best: any, s: any) => {
      const sr = s.reps ?? 0;
      const br = best.reps ?? 0;
      if (sr > br) return s;
      if (sr === br && (s.weight ?? 0) > (best.weight ?? 0)) return s;
      return best;
    }, workingSets[0]);
    const maxReps = highestRepSet.reps ?? 0;
    const weightAtMaxRepSet = highestRepSet.weight ?? 0;

    const [weightPR, repsPR] = await Promise.all([
      // Order on weight, then reps, then recency so the "bar to beat" is the
      // strongest historical row — on equal load the higher-rep row is the
      // real record, and ordering by `value` alone can return the weaker one.
      prisma.personalRecord.findFirst({
        where: { userId, exerciseId: { in: siblingIds }, type: "WEIGHT" },
        orderBy: [{ value: "desc" }, { reps: "desc" }, { date: "desc" }],
      }),
      // For REPS PRs, `reps` holds the rep count and `value` holds the
      // weight at which those reps were performed. Order by reps first,
      // then weight, so the prior PR is the strongest historical set.
      prisma.personalRecord.findFirst({
        where: { userId, exerciseId: { in: siblingIds }, type: "REPS" },
        orderBy: [{ reps: "desc" }, { value: "desc" }],
      }),
    ]);

    const prCreates: any[] = [];

    const exName = ex.exercise?.name ?? "";

    const beatsPriorWeight =
      !weightPR ||
      maxWeight > weightPR.value ||
      (maxWeight === weightPR.value &&
        (weightAtMaxReps ?? 0) > (weightPR.reps ?? 0));
    if (maxWeight > 0 && beatsPriorWeight) {
      prCreates.push({
        userId,
        exerciseId: ex.exerciseId,
        type: "WEIGHT",
        value: maxWeight,
        reps: weightAtMaxReps,
        workoutId,
        date: workoutDate,
      });
      created.push({
        exerciseId: ex.exerciseId,
        exerciseName: exName,
        type: "WEIGHT",
        value: maxWeight,
        reps: weightAtMaxReps,
      });
    }
    const beatsPriorReps =
      !repsPR ||
      maxReps > (repsPR.reps ?? 0) ||
      (maxReps === (repsPR.reps ?? 0) && weightAtMaxRepSet > repsPR.value);
    if (maxReps > 0 && beatsPriorReps) {
      prCreates.push({
        userId,
        exerciseId: ex.exerciseId,
        type: "REPS",
        value: weightAtMaxRepSet,
        reps: maxReps,
        workoutId,
        date: workoutDate,
      });
      created.push({
        exerciseId: ex.exerciseId,
        exerciseName: exName,
        type: "REPS",
        value: weightAtMaxRepSet,
        reps: maxReps,
      });
    }
    if (prCreates.length > 0) {
      await prisma.personalRecord.createMany({ data: prCreates });
    }
  }
  return created;
}

export async function updateWorkout(
  workoutId: string,
  data: CreateWorkoutInput
) {
  const userId = await requireAuth();

  const existing = await prisma.workout.findUnique({
    where: { id: workoutId },
    select: { userId: true },
  });
  if (!existing || existing.userId !== userId) {
    throw new Error("Not authorized");
  }

  await prisma.$transaction([
    prisma.personalRecord.deleteMany({ where: { workoutId, userId } }),
    prisma.workoutExercise.deleteMany({ where: { workoutId } }),
    // Wipe coach chat history — prior replies reference the old sets
    // verbatim and would otherwise leak back into future coaching.
    prisma.trainerMessage.deleteMany({ where: { userId } }),
    prisma.workout.update({
      where: { id: workoutId },
      data: {
        title: data.title,
        type: data.type,
        split: data.split ?? null,
        date: new Date(data.date),
        notes: data.notes,
        feeling: data.feeling,
        isDeload: data.isDeload ?? false,
        duration: data.duration ?? null,
        distance: data.distance ?? null,
        pace: data.pace ?? null,
        avgHeartRate: data.avgHeartRate ?? null,
        maxHeartRate: data.maxHeartRate ?? null,
        rounds: data.rounds ?? null,
        elevation: data.elevation ?? null,
        incline: data.incline ?? null,
        speed: data.speed ?? null,
        level: data.level ?? null,
        calories: data.calories ?? null,
        rpe: data.rpe ?? null,
        startedAt: data.startedAt ? new Date(data.startedAt) : null,
        endedAt: data.endedAt ? new Date(data.endedAt) : null,
        warmup: data.warmup ?? undefined,
        exercises: {
          create: data.exercises.map((ex) => ({
            exerciseId: ex.exerciseId,
            order: ex.order,
            notes: ex.notes,
            // Must mirror createWorkout — updateWorkout delete-and-recreates
            // the exercise rows, so omitting this dropped every superset link
            // back to null on any edit-save.
            supersetGroup: ex.supersetGroup ?? null,
            sets: {
              // setNumber is the set's position in the exercise, not its
              // number within its type: readers order by it, and a DROP_SET
              // only renders chained to the set right before it.
              create: ex.sets.map((s, i) => ({
                type: s.type,
                setNumber: i + 1,
                weight: s.weight,
                reps: s.reps,
                rir: s.rir,
                notes: s.notes,
                loggedAt: s.loggedAt ? new Date(s.loggedAt) : null,
                metrics: s.metrics ?? undefined,
              })),
            },
          })),
        },
      },
    }),
  ]);

  const fresh = await prisma.workout.findUnique({
    where: { id: workoutId },
    include: { exercises: { include: { sets: true, exercise: true } } },
  });
  if (fresh)
    await detectAndSavePRs(userId, workoutId, fresh.exercises, fresh.date);

  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/analytics");
  revalidatePath(`/workout/${workoutId}`);
  return { workoutId };
}

export async function deleteWorkout(workoutId: string) {
  const userId = await requireAuth();
  await prisma.$transaction([
    // Drop any PR rows that were set during this workout — otherwise their
    // dates keep pointing at a session that no longer exists.
    prisma.personalRecord.deleteMany({ where: { workoutId, userId } }),
    prisma.workout.deleteMany({ where: { id: workoutId, userId } }),
    prisma.trainerMessage.deleteMany({ where: { userId } }),
  ]);
  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/analytics");
  redirect("/history");
}

export async function addReaction(workoutId: string, type: string) {
  const userId = await requireAuth();
  try {
    await prisma.reaction.create({ data: { workoutId, userId, type } });
  } catch {
    await prisma.reaction.delete({
      where: { workoutId_userId_type: { workoutId, userId, type } },
    });
  }
  revalidatePath("/");
  revalidatePath("/group");
}

export async function addComment(workoutId: string, text: string) {
  const userId = await requireAuth();
  if (!text.trim()) return;
  await prisma.comment.create({ data: { workoutId, userId, text } });
  revalidatePath("/");
  revalidatePath(`/workout/${workoutId}`);
}

export async function updateProfile(data: {
  name: string;
  image?: string | null;
  coverImage?: string | null;
  birthDate?: string | null;
  sex?: string | null;
  bodyweight?: number;
  preferredSplit?: string;
  bio?: string;
  experienceLevel?: string;
  primaryFocus?: string;
  trainingPhase?: string;
  trainingDays?: number;
  moveGoalKcal?: number | null;
  exerciseGoalMin?: number | null;
  injuries?: string;
  coachPrompt?: string;
  periodization?: PeriodizationConfig | null;
  height?: number | null;
  bodyFat?: number | null;
  restingHR?: number | null;
  waist?: number | null;
  hips?: number | null;
  chest?: number | null;
  shoulders?: number | null;
  neck?: number | null;
  arm?: number | null;
  forearm?: number | null;
  thigh?: number | null;
  calf?: number | null;
}): Promise<{ measurements: MeasurementReport | null }> {
  const userId = await requireAuth();
  const { birthDate, periodization, ...rest } = data;

  // The measurements as they stand before this save. Needed for the comparison
  // below, and as the baseline for an athlete who has no history rows yet.
  const before = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      updatedAt: true,
      ...(Object.fromEntries(MEASUREMENT_KEYS.map((k) => [k, true])) as Record<
        (typeof MEASUREMENT_KEYS)[number],
        true
      >),
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: {
      ...rest,
      // Validated here as well as in the editor: the coach states these week
      // numbers as fact, so a malformed cycle must never reach the database.
      periodization:
        periodization === undefined
          ? undefined
          : isValidConfig(periodization)
            ? (periodization as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
      birthDate:
        birthDate === undefined
          ? undefined
          : birthDate
            ? new Date(birthDate)
            : null,
    },
  });

  const measurements = before
    ? await recordMeasurementSnapshot(userId, before, data)
    : null;

  revalidatePath("/profile");
  revalidatePath("/group");
  revalidatePath(`/u/${userId}`);
  return { measurements };
}

/// What a save has to say about the tape: what moved, since when, and what the
/// pair of bodyweight and waist means together.
export type MeasurementReport = {
  /// When the reading it was compared against was taken.
  since: string;
  deltas: MeasurementDelta[];
  /// The composition read, when bodyweight and waist support one.
  reading: string | null;
};

/// Append a dated snapshot when a save actually moves the tape, and report
/// what changed.
///
/// The comparison is against the most recent snapshot rather than the User row
/// the save just overwrote, because that's what carries a date — "since Jul 3"
/// is the part that makes the number mean something. The overwritten User row
/// is the fallback for an athlete with no history yet, dated to when the
/// profile was last touched.
async function recordMeasurementSnapshot(
  userId: string,
  before: Record<string, unknown> & { updatedAt: Date },
  data: Record<string, unknown>,
): Promise<MeasurementReport | null> {
  // The values after this save: whatever the save supplied, else what stood.
  // Kept as a bare field map (no takenAt) so it doubles as the insert payload.
  const next = {} as Record<MeasurementKey, number | null>;
  for (const key of MEASUREMENT_KEYS) {
    const supplied = data[key];
    const value = supplied === undefined ? before[key] : supplied;
    next[key] = typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  const latest = await prisma.bodyMeasurement.findFirst({
    where: { userId },
    orderBy: { takenAt: "desc" },
  });

  const prev: Snapshot = latest ?? (before as Snapshot);
  const since = (latest?.takenAt ?? before.updatedAt).toISOString();

  const deltas = diffSnapshots(prev, next);
  if (deltas.length === 0) return null;

  await prisma.bodyMeasurement.create({
    data: { userId, ...next },
  });

  return { since, deltas, reading: interpret(prev, next) };
}

/// Toggle whether the signed-in user gets pinged when a crew friend logs a
/// workout. Defaults on; this is the opt-out switch surfaced in the profile.
export async function setNotifyFriendWorkouts(enabled: boolean) {
  const userId = await requireAuth();
  await prisma.user.update({
    where: { id: userId },
    data: { notifyFriendWorkouts: enabled },
  });
  revalidatePath("/profile");
}

/// Opt in/out of the "away longer than usual" nudge. Clearing lastNudgedAt on
/// re-enable means someone who turns it back on isn't stuck waiting out a
/// cooldown from before they switched it off.
export async function setNotifyInactivity(enabled: boolean) {
  const userId = await requireAuth();
  await prisma.user.update({
    where: { id: userId },
    data: {
      notifyInactivity: enabled,
      ...(enabled ? { lastNudgedAt: null } : {}),
    },
  });
  revalidatePath("/profile");
}

/// Notify a logger's mutual-friend crew that they just trained — an in-app
/// inbox entry plus a best-effort Web Push, so friends can hype each other up.
/// Only friends who have NOT opted out (notifyFriendWorkouts = true) are told.
/// Defensive throughout: this must never throw into createWorkout.
async function notifyFriendsOfWorkout(
  loggerId: string,
  workoutId: string,
  title: string,
  isPr: boolean,
): Promise<void> {
  try {
    const logger = await prisma.user.findUnique({
      where: { id: loggerId },
      select: { name: true },
    });
    const name = logger?.name ?? "Someone";

    // Mutual friends (both follow edges exist) who still want these pings.
    const friends = await prisma.user.findMany({
      where: {
        notifyFriendWorkouts: true,
        following: { some: { followingId: loggerId } }, // friend → logger
        followers: { some: { followerId: loggerId } }, // logger → friend
      },
      select: { id: true },
    });
    if (friends.length === 0) return;

    const cleanTitle = title?.trim();
    const verb = isPr ? "just hit a PR" : "just logged a workout";
    const body = cleanTitle ? `${name} ${verb}: ${cleanTitle}` : `${name} ${verb}`;
    const url = `/u/${loggerId}`;

    await Promise.all(
      friends.map(async (f) => {
        await createNotification({
          userId: f.id,
          type: "FRIEND_WORKOUT",
          actorId: loggerId,
          body,
          url,
        });
        await sendPushToUser(f.id, {
          title: isPr ? "Crew PR 🏆" : "Crew just trained 💪",
          body,
          url,
          // Per-logger tag so multiple friends' pings don't collapse into one,
          // but a logger's rapid re-logs replace rather than stack.
          tag: `friend-workout-${loggerId}`,
        });
      }),
    );
  } catch {
    // Swallow — motivating the crew must never block logging a workout.
  }
}
