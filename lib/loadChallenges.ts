import "server-only";
import { prisma } from "@/lib/db";
import {
  computeStandings,
  filterToLift,
  streakFromDays,
  type ChallengeType,
  type ScoringWorkout,
  type Standing,
} from "@/lib/crewChallenges";

export type ChallengeView = {
  id: string;
  name: string;
  type: ChallengeType;
  exerciseId: string | null;
  exerciseName: string | null;
  targetValue: number | null;
  targetReps: number | null;
  startsAt: Date;
  endsAt: Date | null;
  isCreator: boolean;
  memberCount: number;
  standings: Standing[];
};

type ChallengeRow = {
  id: string;
  name: string;
  type: string;
  exerciseId: string | null;
  targetValue: number | null;
  targetReps: number | null;
  startsAt: Date;
  endsAt: Date | null;
  creatorId: string;
  members: { userId: string; user: { name: string } }[];
};

async function buildView(
  ch: ChallengeRow,
  userId: string,
  exNameById: Map<string, string>,
): Promise<ChallengeView> {
  const members = ch.members.map((m) => ({
    userId: m.userId,
    name: m.user.name,
  }));
  const memberIds = members.map((m) => m.userId);
  const type = ch.type as ChallengeType;
  const exerciseName = ch.exerciseId
    ? (exNameById.get(ch.exerciseId) ?? null)
    : null;

  let windowWorkouts: ScoringWorkout[] = [];
  let streakDaysByUser: Map<string, number> | undefined;

  if (type === "STREAK") {
    const rows = await prisma.workout.findMany({
      where: {
        userId: { in: memberIds },
        date: { gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) },
      },
      select: { userId: true, date: true },
    });
    const daysByUser = new Map<string, string[]>();
    for (const r of rows) {
      const arr = daysByUser.get(r.userId) ?? [];
      arr.push(r.date.toISOString().slice(0, 10));
      daysByUser.set(r.userId, arr);
    }
    streakDaysByUser = new Map(
      memberIds.map((id) => [id, streakFromDays(daysByUser.get(id) ?? [])]),
    );
  } else {
    const rows = await prisma.workout.findMany({
      where: {
        userId: { in: memberIds },
        date: { gte: ch.startsAt, lte: ch.endsAt ?? new Date() },
      },
      select: {
        userId: true,
        type: true,
        date: true,
        exercises: {
          select: {
            exercise: { select: { name: true } },
            sets: { select: { type: true, weight: true, reps: true } },
          },
        },
      },
    });
    windowWorkouts = rows;
    if (type === "LIFT_RACE" && exerciseName) {
      windowWorkouts = filterToLift(windowWorkouts, exerciseName);
    }
  }

  const standings = computeStandings({
    type,
    exerciseId: ch.exerciseId,
    targetValue: ch.targetValue,
    members,
    viewerId: userId,
    windowWorkouts,
    streakDaysByUser,
  });

  return {
    id: ch.id,
    name: ch.name,
    type,
    exerciseId: ch.exerciseId,
    exerciseName,
    targetValue: ch.targetValue,
    targetReps: ch.targetReps,
    startsAt: ch.startsAt,
    endsAt: ch.endsAt,
    isCreator: ch.creatorId === userId,
    memberCount: members.length,
    standings,
  };
}

const memberInclude = {
  members: { select: { userId: true, user: { select: { name: true } } } },
} as const;

async function resolveExerciseNames(
  rows: ChallengeRow[],
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(rows.map((r) => r.exerciseId).filter((x): x is string => !!x)),
  ];
  if (ids.length === 0) return new Map();
  const exs = await prisma.exercise.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  return new Map(exs.map((e) => [e.id, e.name]));
}

/// All challenges the user is in, newest first, with computed standings.
export async function loadChallengesForUser(
  userId: string,
): Promise<ChallengeView[]> {
  const rows = (await prisma.crewChallenge.findMany({
    where: { members: { some: { userId } } },
    orderBy: { createdAt: "desc" },
    include: memberInclude,
  })) as ChallengeRow[];
  const exNames = await resolveExerciseNames(rows);
  return Promise.all(rows.map((r) => buildView(r, userId, exNames)));
}

/// The single most relevant active challenge for the Crew-home card: still
/// running (no end, or end in the future), most recently created.
export async function loadTopChallenge(
  userId: string,
): Promise<ChallengeView | null> {
  const row = (await prisma.crewChallenge.findFirst({
    where: {
      members: { some: { userId } },
      OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
    include: memberInclude,
  })) as ChallengeRow | null;
  if (!row) return null;
  const exNames = await resolveExerciseNames([row]);
  return buildView(row, userId, exNames);
}

export async function loadChallenge(
  id: string,
  userId: string,
): Promise<ChallengeView | null> {
  const row = (await prisma.crewChallenge.findUnique({
    where: { id },
    include: memberInclude,
  })) as ChallengeRow | null;
  if (!row) return null;
  const exNames = await resolveExerciseNames([row]);
  return buildView(row, userId, exNames);
}
