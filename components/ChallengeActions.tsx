"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  joinChallenge,
  leaveChallenge,
  deleteChallenge,
} from "@/lib/actions/crewChallenges";

export default function ChallengeActions({
  id,
  isMember,
  isCreator,
}: {
  id: string;
  isMember: boolean;
  isCreator: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<unknown>, leave?: boolean) =>
    startTransition(async () => {
      await fn();
      if (leave) router.push("/group/challenges");
      else router.refresh();
    });

  if (!isMember) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => joinChallenge(id))}
        className="btn-accent w-full py-3 rounded-xl text-[14px]"
      >
        {pending ? "…" : "Join challenge"}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const msg = isCreator
          ? "Delete this challenge for everyone?"
          : "Leave this challenge?";
        if (!confirm(msg)) return;
        run(() => (isCreator ? deleteChallenge(id) : leaveChallenge(id)), true);
      }}
      className="w-full py-3 rounded-xl text-[13px] font-semibold"
      style={{
        background: "rgba(239,68,68,0.08)",
        border: "1px solid rgba(239,68,68,0.25)",
        color: "#f87171",
      }}
    >
      {pending ? "…" : isCreator ? "Delete challenge" : "Leave challenge"}
    </button>
  );
}
