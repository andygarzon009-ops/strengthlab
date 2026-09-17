import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

// The invite waiting for this athlete right now, if any.
//
// The logger polls this whenever it isn't already in a session, so an invite
// arrives wherever you're standing — mid-workout, on a screen with no banner on
// it — instead of only where a notification happened to land. It's what makes a
// session feel like a room you can be asked into at any moment rather than a
// link you had to catch.

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.userId) return Response.json({ invite: null });

  // Same three hours the rest of the feature runs on: an invite older than a
  // gym session is not an invitation to anything.
  const recently = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const member = await prisma.sessionMember.findFirst({
    where: {
      userId: session.userId,
      status: "INVITED",
      invitedAt: { gte: recently },
      session: { endedAt: null },
    },
    orderBy: { invitedAt: "desc" },
    select: {
      sessionId: true,
      session: {
        select: { plan: true, createdBy: { select: { name: true } } },
      },
    },
  });

  if (!member) return Response.json({ invite: null });

  const plan = Array.isArray(member.session.plan)
    ? (member.session.plan as { exerciseId?: string; exerciseName?: string }[]).filter(
        (p): p is { exerciseId: string; exerciseName: string } =>
          !!p?.exerciseId && !!p?.exerciseName,
      )
    : [];

  return Response.json({
    invite: { sessionId: member.sessionId, from: member.session.createdBy.name, plan },
  });
}
