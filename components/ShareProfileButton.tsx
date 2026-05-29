"use client";

import { useState } from "react";

/// Copies the athlete's public profile URL. Built from the current origin so
/// it works in local dev and prod without hardcoding the host.
export default function ShareProfileButton({ userId }: { userId: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const url = `${window.location.origin}/u/${userId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked — fall back to a prompt so the link is still grabbable.
      window.prompt("Copy your profile link:", url);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="px-4 py-2 rounded-xl text-[13px] font-semibold transition-colors"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        color: copied ? "var(--accent)" : "var(--fg)",
      }}
    >
      {copied ? "Link copied ✓" : "Share profile"}
    </button>
  );
}
