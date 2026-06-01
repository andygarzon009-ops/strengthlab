import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import BackButton from "@/components/BackButton";
import EnablePushButton from "@/components/EnablePushButton";
import Avatar from "@/components/Avatar";
import FriendRequests, {
  type IncomingRequest,
} from "@/components/FriendRequests";

export const dynamic = "force-dynamic";

function relTime(date: Date): string {
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 60) return "just now";
  if (sec < 60 * 60) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 60 * 60 * 24) return `${Math.floor(sec / 3600)}h ago`;
  const day = Math.floor(sec / 86400);
  if (day < 7) return `${day}d ago`;
  return `${Math.floor(day / 7)}w ago`;
}

export default async function NotificationsPage() {
  const userId = await requireAuth();

  const [incomingRaw, activity] = await Promise.all([
    prisma.friendRequest.findMany({
      where: { toUserId: userId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: { from: { select: { id: true, name: true, image: true } } },
    }),
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        body: true,
        url: true,
        read: true,
        createdAt: true,
        actor: { select: { name: true, image: true } },
      },
    }),
  ]);
  const incoming: IncomingRequest[] = incomingRaw.map((r) => ({
    fromUserId: r.from.id,
    name: r.from.name,
    image: r.from.image,
  }));

  // Mark everything read now that the inbox is open. We captured `read`
  // above, so freshly-unread rows still render with the accent dot this view.
  if (activity.some((n) => !n.read)) {
    await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  const isEmpty = incoming.length === 0 && activity.length === 0;

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

      <EnablePushButton />

      {incoming.length > 0 && <FriendRequests requests={incoming} />}

      {activity.length > 0 && (
        <div className={incoming.length > 0 ? "mt-6" : undefined}>
          <p className="label mb-2">Activity</p>
          <div
            className="rounded-2xl divide-y overflow-hidden"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
            }}
          >
            {activity.map((n) => {
              const row = (
                <div className="flex items-center gap-3 px-4 py-3">
                  <Avatar
                    name={n.actor?.name ?? "Someone"}
                    image={n.actor?.image}
                    size={40}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] leading-snug">{n.body}</p>
                    <p
                      className="text-[11px] mt-0.5"
                      style={{ color: "var(--fg-dim)" }}
                    >
                      {relTime(new Date(n.createdAt))}
                    </p>
                  </div>
                  {!n.read && (
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: "#a3e635" }}
                    />
                  )}
                </div>
              );
              return n.url ? (
                <Link
                  key={n.id}
                  href={n.url}
                  className="block active:opacity-70 transition-opacity"
                >
                  {row}
                </Link>
              ) : (
                <div key={n.id}>{row}</div>
              );
            })}
          </div>
        </div>
      )}

      {isEmpty && (
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
            Friend requests and crew activity will show up here.
          </p>
        </div>
      )}
    </div>
  );
}
