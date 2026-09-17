"use server";

// Joint training sessions: inviting a crew member to the workout you're doing
// right now, and answering an invite.
//
// The session links two independent logs. Nothing here writes to anyone's
// Workout or Set rows but their own — see the TrainingSession model comment for
// why that boundary matters.

import { prisma } from "@/lib/db";
import { Prisma } from "@/app/generated/prisma";
import { requireAuth } from "@/lib/session";
import { notify } from "@/lib/notify";
import { revalidatePath } from "next/cache";

export type SessionActionResult = { ok: true; sessionId: string } | { error: string };

/// Who this athlete may invite: a MUTUAL follow. The graph is one-way, so
/// without the mutual check anyone who follows you could push a notification
/// into your phone — an invite is a poke, and a poke needs consent both ways.
export async function invitableCrew(): Promise<
  { id: string; name: string; image: string | null }[]
> {
  const userId = await requireAuth();
  const [following, followers] = await Promise.all([
    prisma.follow.findMany({
      where: { followerId: userId },
      select: { following: { select: { id: true, name: true, image: true } } },
    }),
    prisma.follow.findMany({
      where: { followingId: userId },
      select: { followerId: true },
    }),
  ]);
  const followsBack = new Set(followers.map((f) => f.followerId));
  return following
    .map((f) => f.following)
    .filter((p) => followsBack.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/// Start (or reuse) the athlete's open session and invite someone to it.
///
/// Reusing an open session is what makes "invite Morgan, then invite Sam"
/// behave the way it reads — a second invite joins the same session rather than
/// starting a rival one. A session is open until it's ended or the day turns.
export async function inviteToSession(
  inviteeId: string,
  /// The exercise names the inviter has queued, so the invitee's logger can
  /// open with the same plan instead of an empty page.
  plan: { exerciseId: string; exerciseName: string }[] = [],
): Promise<SessionActionResult> {
  const userId = await requireAuth();
  if (inviteeId === userId) return { error: "That's you." };

  const allowed = await invitableCrew();
  if (!allowed.some((p) => p.id === inviteeId)) {
    return { error: "You can only invite crew who follow you back." };
  }

  // Reuse the session the caller is currently training in, so "invite Morgan,
  // then invite Sam" puts both in one session rather than starting rivals.
  //
  // Three hours, not a day: a gym session is two at the outside, and a stale
  // one poisons everything downstream. An invite sent this evening was
  // attaching to this morning's session — where the invitee was still marked
  // JOINED from that one — and being treated as a re-attach instead of a new
  // invitation. Once the caller has SAVED against a session it's spent too,
  // or the evening's workout would overwrite the morning's link.
  const recently = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const open = await prisma.trainingSession.findFirst({
    where: {
      createdById: userId,
      endedAt: null,
      startedAt: { gte: recently },
      members: { some: { userId, workoutId: null } },
    },
    orderBy: { startedAt: "desc" },
  });

  const planJson =
    plan.length > 0 ? (plan as unknown as Prisma.InputJsonValue) : undefined;

  const session =
    open ??
    (await prisma.trainingSession.create({
      data: {
        createdById: userId,
        plan: planJson,
        // The creator is a member from the start, already joined — they're the
        // one doing the workout.
        members: { create: { userId, status: "JOINED", respondedAt: new Date() } },
      },
    }));

  // Re-inviting, or inviting a second person, refreshes the frozen plan — the
  // caller has usually added lifts since the session opened, and the newest
  // invite should describe what they're actually doing.
  if (open && planJson) {
    await prisma.trainingSession.update({
      where: { id: session.id },
      data: { plan: planJson },
    });
  }

  // The caller's own place in the session, in case they'd walked out of it
  // earlier — inviting somebody is rejoining by definition, and without this
  // the caller stays LEFT, sees a 403 on the live feed and saves an untagged
  // log despite standing in the gym with the person they just invited.
  await prisma.sessionMember.upsert({
    where: { sessionId_userId: { sessionId: session.id, userId } },
    create: {
      sessionId: session.id,
      userId,
      status: "JOINED",
      respondedAt: new Date(),
    },
    update: { status: "JOINED" },
  });

  const existing = await prisma.sessionMember.findUnique({
    where: { sessionId_userId: { sessionId: session.id, userId: inviteeId } },
  });
  // Someone already JOINED keeps that status — they're in, and knocking them
  // back to INVITED would take the session off their screen. But they are
  // still told, every time: tapping Invite on a person is an explicit act, and
  // suppressing the notification for "they're already in" meant a caller who
  // thought they'd invited someone had in fact sent nothing at all.
  const alreadyIn = existing?.status === "JOINED";
  if (!alreadyIn) {
    if (existing) {
      // Someone who declined, or walked out, gets set back to invited rather
      // than stacking a second row.
      await prisma.sessionMember.update({
        where: { id: existing.id },
        data: { status: "INVITED", invitedAt: new Date(), respondedAt: null },
      });
    } else {
      await prisma.sessionMember.create({
        data: { sessionId: session.id, userId: inviteeId, status: "INVITED" },
      });
    }
  }

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });
  const firstName = me?.name?.split(" ")[0] ?? "Someone";
  const planNote =
    plan.length > 0
      ? ` — ${plan
          .slice(0, 2)
          .map((p) => p.exerciseName)
          .join(", ")}${plan.length > 2 ? "…" : ""}`
      : "";
  const url = `/log?session=${session.id}`;

  await notify({
    userId: inviteeId,
    type: "SESSION_INVITE",
    actorId: userId,
    body: alreadyIn
      ? `${firstName} is training now${planNote}`
      : `${firstName} invited you to train${planNote}`,
    url,
    push: {
      title: `${firstName} wants to lift`,
      body: `Training now${planNote}. Tap to join.`,
      // Per session, so a second tap replaces the banner instead of stacking.
      tag: `session-${session.id}`,
    },
  });

  // The invitee's pending-invite banner reads off this, so it has to be fresh
  // the moment they next open the app — which is the delivery path that works
  // whether or not a notification ever reached their phone.
  revalidatePath("/", "layout");
  return { ok: true, sessionId: session.id };
}

/// Accept or decline an invite. Accepting is what puts the partner strip on
/// both athletes' screens.
export async function respondToSessionInvite(
  sessionId: string,
  join: boolean,
): Promise<SessionActionResult> {
  const userId = await requireAuth();
  const member = await prisma.sessionMember.findUnique({
    where: { sessionId_userId: { sessionId, userId } },
    include: { session: { select: { createdById: true } } },
  });
  if (!member) return { error: "That invite is no longer available." };

  await prisma.sessionMember.update({
    where: { id: member.id },
    data: { status: join ? "JOINED" : "DECLINED", respondedAt: new Date() },
  });

  if (join) {
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    const firstName = me?.name?.split(" ")[0] ?? "Someone";
    await notify({
      userId: member.session.createdById,
      type: "SESSION_JOIN",
      actorId: userId,
      body: `${firstName} joined your session`,
      url: `/log?session=${sessionId}`,
      push: {
        title: `${firstName} is in`,
        body: "They joined your session.",
        tag: `session-${sessionId}`,
      },
    });
  }

  revalidatePath("/", "layout");
  return { ok: true, sessionId };
}

/// Step out of a session without ending it for everyone else.
export async function leaveSession(sessionId: string): Promise<SessionActionResult> {
  const userId = await requireAuth();
  const member = await prisma.sessionMember.findUnique({
    where: { sessionId_userId: { sessionId, userId } },
  });
  if (!member) return { error: "You're not in that session." };
  await prisma.sessionMember.update({
    where: { id: member.id },
    data: { status: "LEFT", respondedAt: new Date() },
  });
  return { ok: true, sessionId };
}
