"use client";

import { useState } from "react";

// Native share sheet where there is one (the PWA on a phone), clipboard
// otherwise. The text stands on its own so it reads in any chat app.
export default function SharePRButton({ text, icon = false }: { text: string; /** A square icon button, for the slim PR strip. */ icon?: boolean }) {
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
  if (icon) {
    return (
      <button
        type="button"
        onClick={share}
        aria-label={copied ? "Copied" : "Share with crew"}
        className="w-9 h-9 shrink-0 rounded-[11px] flex items-center justify-center active:scale-95 transition-transform"
        style={{ background: "var(--bg-elevated)", color: copied ? "#a3e635" : "var(--fg)" }}
      >
        {copied ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12l5 5L20 7" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" />
          </svg>
        )}
      </button>
    );
  }
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
