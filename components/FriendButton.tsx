"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  unfriend,
  type FriendState,
} from "@/lib/actions/friends";

/// Friend-aware action button for a profile. Reflects the mutual-request
/// model: Add friend → Requested → (they) Accept/Decline → Friends.
export default function FriendButton({
  targetUserId,
  initialState,
}: {
  targetUserId: string;
  initialState: FriendState;
}) {
  const router = useRouter();
  const [state, setState] = useState<FriendState>(initialState);
  const [pending, startTransition] = useTransition();

  const run = (next: FriendState, fn: () => Promise<unknown>) => {
    setState(next);
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  };

  // Sending returns the TRUE resulting state (e.g. auto-accepted to "friends",
  // or "friends" if already connected) so the button can't show a fake
  // "Requested" when the request didn't actually go through.
  const send = () => {
    setState("outgoing");
    startTransition(async () => {
      const result = await sendFriendRequest(targetUserId);
      setState(result);
      router.refresh();
    });
  };

  if (state === "self") return null;

  const base =
    "px-4 py-2 rounded-xl text-[13px] font-semibold transition-colors disabled:opacity-60";
  const accent = { background: "var(--accent)", color: "#0a0a0a" };
  const ghost = {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    color: "var(--fg-dim)",
  };

  if (state === "friends") {
    return (
      <button
        className={base}
        style={ghost}
        disabled={pending}
        onClick={() => {
          if (
            !confirm(
              "Remove from your crew? You'll stop seeing each other's workouts. You can add them again later.",
            )
          )
            return;
          run("none", () => unfriend(targetUserId));
        }}
      >
        ✓ Friends
      </button>
    );
  }

  if (state === "outgoing") {
    return (
      <button
        className={base}
        style={ghost}
        disabled={pending}
        onClick={() => run("none", () => cancelFriendRequest(targetUserId))}
      >
        Requested
      </button>
    );
  }

  if (state === "incoming") {
    return (
      <div className="flex gap-2">
        <button
          className={base}
          style={accent}
          disabled={pending}
          onClick={() => run("friends", () => acceptFriendRequest(targetUserId))}
        >
          Accept
        </button>
        <button
          className={base}
          style={ghost}
          disabled={pending}
          onClick={() => run("none", () => declineFriendRequest(targetUserId))}
        >
          Decline
        </button>
      </div>
    );
  }

  // none
  return (
    <button
      className={base}
      style={accent}
      disabled={pending}
      onClick={send}
    >
      Add friend
    </button>
  );
}
