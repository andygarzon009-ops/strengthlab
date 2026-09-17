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
};
type DraftExercise = {
  exerciseId?: string;
  exerciseName?: string;
  sets?: DraftSet[];
};
type Draft = { exercises?: DraftExercise[]; startedAt?: string | null };

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
  if (!me || me.status === "DECLINED") {
    return Response.json({ error: "Not in this session" }, { status: 403 });
  }

  const session = await prisma.trainingSession.findUnique({
    where: { id },
    select: {
      endedAt: true,
      createdById: true,
      createdBy: { select: { workoutDraft: { select: { payload: true } } } },
      members: {
        where: { userId: { not: userId }, status: { in: ["INVITED", "JOINED"] } },
        select: {
          userId: true,
          status: true,
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

  const partners: PartnerLive[] = session.members.map((m) => {
    const read =
      m.status === "JOINED"
        ? readDraft(m.user.workoutDraft?.payload)
        : { setsDone: 0, lastSet: null, lastSetAt: null };
    return {
      userId: m.user.id,
      name: m.user.name,
      image: m.user.image,
      status: m.status,
      ...read,
      // Only surface a rest timer that hasn't already run out.
      restEndsAt:
        m.user.restEndsAt && m.user.restEndsAt.getTime() > Date.now()
          ? m.user.restEndsAt.toISOString()
          : null,
    };
  });

  // The lifts whoever called the session has queued. Offered to a joiner as a
  // one-tap adopt rather than merged in automatically — silently rewriting
  // someone's in-progress log would be unforgivable.
  const plan =
    session.createdById === userId
      ? []
      : readPlan(session.createdBy?.workoutDraft?.payload);

  return Response.json({
    sessionId: id,
    ended: !!session.endedAt,
    myStatus: me.status,
    plan,
    partners,
  });
}
