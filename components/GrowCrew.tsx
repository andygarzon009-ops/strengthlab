"use client";

import { useState } from "react";
import ShareProfileButton from "@/components/ShareProfileButton";
import AddFollow from "@/components/AddFollow";

/// Share-your-profile + paste-to-follow. Expanded by default for a brand-new
/// user (no follows yet, so growing the crew is the priority); collapses to a
/// single tappable header once they've followed at least one person.
export default function GrowCrew({
  userId,
  defaultOpen,
}: {
  userId: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between"
      >
        <span className="text-[13px] font-semibold">Grow your crew</span>
        <span
          className="text-[18px] leading-none"
          style={{ color: "var(--fg-dim)" }}
        >
          {open ? "–" : "+"}
        </span>
      </button>

      {open && (
        <div className="mt-3">
          <p className="text-[12px] mb-3" style={{ color: "var(--fg-dim)" }}>
            Share your profile so friends can follow you, or paste a friend&apos;s
            link to follow them.
          </p>
          <div className="mb-3">
            <ShareProfileButton userId={userId} />
          </div>
          <AddFollow />
        </div>
      )}
    </div>
  );
}
