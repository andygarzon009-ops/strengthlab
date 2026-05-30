import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import BackButton from "@/components/BackButton";
import FriendRequests, {
  type IncomingRequest,
} from "@/components/FriendRequests";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const userId = await requireAuth();

  const incomingRaw = await prisma.friendRequest.findMany({
    where: { toUserId: userId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: { from: { select: { id: true, name: true, image: true } } },
  });
  const incoming: IncomingRequest[] = incomingRaw.map((r) => ({
    fromUserId: r.from.id,
    name: r.from.name,
    image: r.from.image,
  }));

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <BackButton fallbackHref="/group" />
        <div>
          <p className="label">Inbox</p>
          <h1 className="text-[28px] font-bold tracking-tight leading-none mt-1">
            Notifications
          </h1>
        </div>
      </div>

      {incoming.length > 0 ? (
        <FriendRequests requests={incoming} />
      ) : (
        <div
          className="rounded-2xl px-6 py-12 text-center"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
        >
          <div
            className="mx-auto mb-4 w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: "var(--bg-elevated)" }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--fg-dim)"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
          <p className="text-[15px] font-medium">You're all caught up</p>
          <p className="text-[13px] mt-1" style={{ color: "var(--fg-dim)" }}>
            Friend requests will show up here.
          </p>
        </div>
      )}
    </div>
  );
}
