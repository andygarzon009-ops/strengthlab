import { subDays } from "date-fns";
import { prisma } from "@/lib/db";
import Avatar from "@/components/Avatar";
import InviteBanner from "@/components/InviteBanner";

// The invite you can't miss.
//
// Everything else that announces an invite — Web Push, a local banner off the
// poller — can fail, and for this app all of it HAD failed: not one user had a
// push subscription, so an invite existed only as a row nobody was looking at.
// A social feature cannot be built on a delivery channel that needs
// permission, a subscription, an installed PWA and a live service worker to
// work.
//
// So the app itself carries it. Open StrengthLab with an invite waiting and
// it's the first thing on the screen, every time, with no notification
// involved. Push is then an accelerator rather than the mechanism.

export default async function PendingInvites({ userId }: { userId: string }) {
  // Only today's. An invite to a session that started yesterday is not an
  // invitation to anything — the gym session is long over.
  const dayAgo = subDays(new Date(), 1);

  const invites = await prisma.sessionMember.findMany({
    where: {
      userId,
      status: "INVITED",
      invitedAt: { gte: dayAgo },
      session: { endedAt: null },
    },
    orderBy: { invitedAt: "desc" },
    take: 3,
    select: {
      sessionId: true,
      invitedAt: true,
      session: {
        select: {
          plan: true,
          createdBy: { select: { id: true, name: true, image: true } },
        },
      },
    },
  });

  if (invites.length === 0) return null;

  return (
    <div className="space-y-2 mb-3">
      {invites.map((invite) => {
        const from = invite.session.createdBy;
        const plan = Array.isArray(invite.session.plan)
          ? (invite.session.plan as { exerciseName?: string }[])
              .map((p) => p?.exerciseName)
              .filter((n): n is string => !!n)
          : [];
        return (
          <InviteBanner
            key={invite.sessionId}
            sessionId={invite.sessionId}
            name={from.name}
            plan={plan}
            avatar={
              <Avatar name={from.name} image={from.image} size={36} />
            }
          />
        );
      })}
    </div>
  );
}
