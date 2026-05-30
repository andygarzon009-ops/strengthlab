"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendFriendRequest } from "@/lib/actions/friends";

/// Paste a friend's profile link (or id) to send them a friend request
/// without leaving the Crew page. The usual path is opening their shared
/// /u/<id> link and tapping Add friend — this is the manual fallback.
export default function AddFollow() {
  const router = useRouter();
  const [val, setVal] = useState("");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  const submit = () => {
    const raw = val.trim();
    if (!raw) return;
    const id = raw.includes("/u/")
      ? raw.split("/u/")[1].split(/[/?#]/)[0]
      : raw;
    if (!id) return;
    startTransition(async () => {
      await sendFriendRequest(id);
      setVal("");
      setDone(true);
      router.refresh();
      setTimeout(() => setDone(false), 1800);
    });
  };

  return (
    <div className="flex gap-2">
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="Paste a friend's profile link"
        className="flex-1 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          color: "var(--fg)",
        }}
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending || !val.trim()}
        className="px-4 rounded-xl text-[13px] font-semibold disabled:opacity-50"
        style={{ background: "var(--accent)", color: "#0a0a0a" }}
      >
        {pending ? "…" : done ? "Sent ✓" : "Add"}
      </button>
    </div>
  );
}
