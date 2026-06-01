"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/// Explicit "refresh" control for server-rendered pages. Calls
/// router.refresh() to re-run the page's server queries, and spins briefly
/// for feedback (refresh is fire-and-forget, so we can't await it).
export default function RefreshButton({
  ariaLabel = "Refresh",
}: {
  ariaLabel?: string;
}) {
  const router = useRouter();
  const [spinning, setSpinning] = useState(false);

  const onClick = () => {
    if (spinning) return;
    setSpinning(true);
    router.refresh();
    window.setTimeout(() => setSpinning(false), 1000);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-transform"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--fg-muted)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          animation: spinning ? "rb-spin 0.9s linear infinite" : undefined,
        }}
      >
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <polyline points="21 3 21 8 16 8" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        <polyline points="3 21 3 16 8 16" />
      </svg>
      <style>{`@keyframes rb-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}
