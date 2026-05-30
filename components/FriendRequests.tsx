"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  acceptFriendRequest,
  declineFriendRequest,
} from "@/lib/actions/friends";
import Avatar from "@/components/Avatar";

export type IncomingRequest = {
  fromUserId: string;
  name: string;
  image: string | null;
};

/// Incoming friend requests with Accept / Decline. Rows disappear as they're
/// actioned; the whole card hides when none are left.
export default function FriendRequests({
  requests,
}: {
  requests: IncomingRequest[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(requests);
  const [pending, startTransition] = useTransition();

  if (items.length === 0) return null;

  const act = (fromUserId: string, accept: boolean) => {
    setItems((cur) => cur.filter((r) => r.fromUserId !== fromUserId));
    startTransition(async () => {
      if (accept) await acceptFriendRequest(fromUserId);
      else await declineFriendRequest(fromUserId);
      router.refresh();
    });
  };

  return (
    <div className="mb-6">
      <p
        className="text-[10px] uppercase tracking-wider font-semibold mb-2"
        style={{ color: "var(--fg-dim)" }}
      >
        Friend requests
      </p>
      <div
        className="rounded-2xl divide-y"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        {items.map((r) => (
          <div key={r.fromUserId} className="flex items-center gap-3 px-4 py-3">
            <Link href={`/u/${r.fromUserId}`} className="shrink-0">
              <Avatar name={r.name} image={r.image} size={40} />
            </Link>
            <Link href={`/u/${r.fromUserId}`} className="flex-1 min-w-0">
              <p className="text-[14px] font-medium truncate">{r.name}</p>
              <p className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
                wants to be friends
              </p>
            </Link>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                disabled={pending}
                onClick={() => act(r.fromUserId, true)}
                className="px-3 py-1.5 rounded-lg text-[12px] font-semibold disabled:opacity-60"
                style={{ background: "var(--accent)", color: "#0a0a0a" }}
              >
                Accept
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => act(r.fromUserId, false)}
                className="px-3 py-1.5 rounded-lg text-[12px] font-semibold disabled:opacity-60"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  color: "var(--fg-dim)",
                }}
              >
                Decline
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
