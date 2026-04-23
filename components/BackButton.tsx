"use client";

import { useRouter } from "next/navigation";

export default function BackButton({
  fallbackHref = "/",
  ariaLabel = "Back",
}: {
  fallbackHref?: string;
  ariaLabel?: string;
}) {
  const router = useRouter();
  const handleClick = () => {
    // If there's browser history, go back so the user returns to whichever
    // page they came from (history calendar, feed, coach chat, etc.).
    // Otherwise fall back to the provided href so deep-links still land
    // somewhere useful.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={ariaLabel}
      className="w-9 h-9 rounded-full flex items-center justify-center"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        color: "var(--fg-muted)",
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
    </button>
  );
}
