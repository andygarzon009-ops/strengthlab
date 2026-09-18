import {
  CARDIO_SET_TYPE,
  cardioSpecFor,
  cardioSummary,
  toCardioMetrics,
  type CardioInput,
} from "@/lib/cardio";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { formatLoad } from "@/lib/exercises";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// What a partner is doing right now, read off the draft their logger is
// already autosaving. No new live-state table and no socket: the draft is the
// live state, and at gym pace — a set lands every 60–180 seconds — a poll every
// few seconds is indistinguishable from a push.

type DraftSet = {
  type?: string;
  weight?: string;
  reps?: string;
  completed?: boolean;
  loggedAt?: string;
  cardio?: CardioInput;
};
type DraftExercise = {
  exerciseId?: string;
  exerciseName?: string;
  sets?: DraftSet[];
};
type Draft = {
  exercises?: DraftExercise[];
  startedAt?: string | null;
  workoutType?: string;
  split?: string | null;
};

export type PartnerLive = {
  userId: string;
  name: string;
  image: string | null;
  status: string;
  /// Working sets they've ticked off this session.
  setsDone: number;
  /// Their most recent completed set, already formatted — "Squat · 3 plates × 5".
  lastSet: string | null;
  /// When that set was logged, so the client can age it ("2m ago").
  lastSetAt: string | null;
  /// End of their running rest timer, if any. This is the number that matters
  /// when two people are alternating on one rack.
  restEndsAt: string | null;
  /// They've saved and gone home. Their draft is empty at this point, which is
  /// not the same as having done nothing.
  finished: boolean;
};

/// The newest completed working set in a draft, and how many there are.
function readDraft(payload: unknown): {
  setsDone: number;
  lastSet: string | null;
  lastSetAt: string | null;
} {
  const draft = (payload ?? {}) as Draft;
  let setsDone = 0;
  let best: { at: number; text: string; iso: string } | null = null;

  for (const ex of draft.exercises ?? []) {
    for (const s of ex.sets ?? []) {
      if (s.type === "WARMUP") continue;
      const done = s.completed === true || !!s.loggedAt;
      if (!done) continue;
      if (s.type === CARDIO_SET_TYPE) {
        // Not a set, but it is what they're doing — "Stair Climber · 20 min"
        // tells the person beside them the machine is taken.
        const name = ex.exerciseName ?? "";
        const spec = cardioSpecFor(name);
        const text = spec ? cardioSummary(toCardioMetrics(spec, s.cardio ?? {})) : "";
        const at = s.loggedAt ? new Date(s.loggedAt).getTime() : 0;
        if (at > 0 && (!best || at > best.at)) {
          best = { at, text: text ? `${name} · ${text}` : name, iso: new Date(at).toISOString() };
        }
        continue;
      }
      setsDone++;
      const weight = parseFloat(s.weight ?? "");
      const reps = parseInt(s.reps ?? "", 10);
      if (!Number.isFinite(reps) || reps <= 0) continue;
      const name = ex.exerciseName ?? "";
      const load =
        Number.isFinite(weight) && weight > 0 ? formatLoad(name, weight) : "BW";
      // No loggedAt means an older draft ticked the set before that field
      // existed; it still counts, it just can't be the "latest".
      const at = s.loggedAt ? new Date(s.loggedAt).getTime() : 0;
      if (at > 0 && (!best || at > best.at)) {
        best = {
          at,
          text: `${name} · ${load} × ${reps}`,
          iso: new Date(at).toISOString(),
        };
      }
    }
  }

  return {
    setsDone,
    lastSet: best?.text ?? null,
    lastSetAt: best?.iso ?? null,
  };
}

/// The exercise list out of a draft, in order, deduped by id.
function readPlan(payload: unknown): { exerciseId: string; exerciseName: string }[] {
  const draft = (payload ?? {}) as Draft;
  const seen = new Set<string>();
  const out: { exerciseId: string; exerciseName: string }[] = [];
  for (const ex of draft.exercises ?? []) {
    const id = ex.exerciseId;
    const name = ex.exerciseName;
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({ exerciseId: id, exerciseName: name });
  }
  return out;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireAuth();
  const { id } = await params;

  // Membership is the authorization: you see a session's partners only if
  // you're in it yourself.
  const me = await prisma.sessionMember.findUnique({
    where: { sessionId_userId: { sessionId: id, userId } },
    select: { status: true },
  });
  // Declined or walked out: the session is no longer yours to watch, and
  // saying so is what lets the client stop polling and clear the strip.
  if (!me || me.status === "DECLINED" || me.status === "LEFT") {
    return Response.json({ error: "Not in this session", gone: true }, { status: 403 });
  }

  const session = await prisma.trainingSession.findUnique({
    where: { id },
    select: {
      endedAt: true,
      createdById: true,
      plan: true,
      createdBy: { select: { workoutDraft: { select: { payload: true } } } },
      members: {
        where: { userId: { not: userId }, status: { in: ["INVITED", "JOINED"] } },
        select: {
          userId: true,
          status: true,
          workoutId: true,
          user: {
            select: {
              id: true,
              name: true,
              image: true,
              restEndsAt: true,
              workoutDraft: { select: { payload: true } },
            },
          },
        },
      },
    },
  });
  if (!session) {
    return Response.json({ error: "No such session" }, { status: 404 });
  }

  // A finished partner's set count comes off their saved workout. Their draft
  // was cleared the moment they hit Save, so reading it would report the person
  // you just trained beside as having done nothing at all.
  const finishedIds = session.members
    .filter((m) => m.workoutId)
    .map((m) => m.workoutId as string);
  const finishedCounts = new Map<string, number>();
  if (finishedIds.length > 0) {
    const counts = await prisma.set.groupBy({
      by: ["workoutExerciseId"],
      where: {
        type: { notIn: ["WARMUP", CARDIO_SET_TYPE] },
        workoutExercise: { workoutId: { in: finishedIds } },
      },
      _count: { _all: true },
      // Needed to attribute each group back to its workout.
    });
    const exerciseOwners = await prisma.workoutExercise.findMany({
      where: { workoutId: { in: finishedIds } },
      select: { id: true, workoutId: true },
    });
    const ownerOf = new Map(exerciseOwners.map((e) => [e.id, e.workoutId]));
    for (const row of counts) {
      const workoutId = ownerOf.get(row.workoutExerciseId);
      if (!workoutId) continue;
      finishedCounts.set(
        workoutId,
        (finishedCounts.get(workoutId) ?? 0) + row._count._all,
      );
    }
  }

  const partners: PartnerLive[] = session.members.map((m) => {
    const finished = !!m.workoutId;
    const read = finished
      ? {
          setsDone: finishedCounts.get(m.workoutId as string) ?? 0,
          lastSet: null,
          lastSetAt: null,
        }
      : m.status === "JOINED"
        ? readDraft(m.user.workoutDraft?.payload)
        : { setsDone: 0, lastSet: null, lastSetAt: null };
    return {
      userId: m.user.id,
      name: m.user.name,
      image: m.user.image,
      status: m.status,
      finished,
      ...read,
      // Only surface a rest timer that hasn't already run out.
      restEndsAt:
        !finished && m.user.restEndsAt && m.user.restEndsAt.getTime() > Date.now()
          ? m.user.restEndsAt.toISOString()
          : null,
    };
  });

  // The lifts whoever called the session has queued. Offered to a joiner as a
  // one-tap adopt rather than merged in automatically — silently rewriting
  // someone's in-progress log would be unforgivable.
  const callersDraft = (session.createdBy?.workoutDraft?.payload ?? {}) as Draft;
  const isCaller = session.createdById === userId;
  // The plan frozen at invite time wins: the caller's live draft is empty once
  // they've saved and moved on, and the joiner was invited to a workout, not to
  // whatever is on the caller's screen right now.
  const frozen = Array.isArray(session.plan)
    ? (session.plan as { exerciseId?: string; exerciseName?: string }[])
        .filter(
          (p): p is { exerciseId: string; exerciseName: string } =>
            !!p?.exerciseId && !!p?.exerciseName,
        )
    : [];
  const plan = isCaller
    ? []
    : frozen.length > 0
      ? frozen
      : readPlan(session.createdBy?.workoutDraft?.payload);

  return Response.json({
    sessionId: id,
    ended: !!session.endedAt,
    myStatus: me.status,
    plan,
    // What kind of session the caller is running. An invitee tapping the push
    // should land in a log, not on the type picker — they already know what
    // they're being invited to.
    planType: isCaller ? null : (callersDraft.workoutType ?? null),
    planSplit: isCaller ? null : (callersDraft.split ?? null),
    partners,
  });
}
