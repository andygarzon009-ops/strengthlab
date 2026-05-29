"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { followUser, unfollowUser } from "@/lib/actions/follow";

export default function FollowButton({
  targetUserId,
  initialFollowing,
}: {
  targetUserId: string;
  initialFollowing: boolean;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !following;
    setFollowing(next); // optimistic
    startTransition(async () => {
      if (next) await followUser(targetUserId);
      else await unfollowUser(targetUserId);
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className="px-4 py-2 rounded-xl text-[13px] font-semibold transition-colors disabled:opacity-60"
      style={
        following
          ? {
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              color: "var(--fg-dim)",
            }
          : {
              background: "var(--accent)",
              color: "#0a0a0a",
            }
      }
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
