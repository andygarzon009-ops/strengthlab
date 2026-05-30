"use client";

import { useEffect, useState } from "react";
import ShareProfileButton from "@/components/ShareProfileButton";
import FriendSearch from "@/components/FriendSearch";

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

  // Open automatically when the "+ Add" circle (which links to #grow) is
  // tapped, including repeat taps via the hashchange event.
  useEffect(() => {
    const openIfTargeted = () => {
      if (window.location.hash === "#grow") setOpen(true);
    };
    openIfTargeted();
    window.addEventListener("hashchange", openIfTargeted);
    return () => window.removeEventListener("hashchange", openIfTargeted);
  }, []);

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
            Search a friend by @username to send a request, or share your
            profile so they can add you.
          </p>
          <div className="mb-3">
            <FriendSearch />
          </div>
          <ShareProfileButton userId={userId} />
        </div>
      )}
    </div>
  );
}
