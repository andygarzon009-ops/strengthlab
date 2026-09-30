"use client";

import { useState } from "react";

// Native share sheet where there is one (the PWA on a phone), clipboard
// otherwise. The text stands on its own so it reads in any chat app.
export default function SharePRButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.origin : "";
    try {
      if (navigator.share) {
        await navigator.share({ text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // share sheet dismissed — nothing to do
    }
  };
  return (
    <button
      type="button"
      onClick={share}
      className="flex-1 min-h-[44px] rounded-xl text-[14px] font-semibold"
      style={{ background: "var(--bg-elevated)", color: "var(--fg)" }}
    >
      {copied ? "Copied" : "Share with crew"}
    </button>
  );
}
