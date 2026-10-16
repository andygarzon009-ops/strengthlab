"use client";

import { useRouter } from "next/navigation";
import { previousPath } from "@/lib/navStack";

export default function BackButton({
  href,
  alsoFrom = [],
  fallbackHref = "/",
  ariaLabel = "Back",
}: {
  // When set, always navigate here — used for pages with a fixed parent in
  // the app hierarchy (e.g. a lift detail always belongs under the rhythm
  // page) so back is deterministic regardless of browser history.
  href?: string;
  // Other pages that open this one. Coming from any of them (or from `href`)
  // makes back a real history back, which returns to that exact page with
  // its scroll position instead of a fresh copy of the parent.
  alsoFrom?: string[];
  fallbackHref?: string;
  ariaLabel?: string;
}) {
  const router = useRouter();
  const handleClick = () => {
    // An explicit ?from= (set by the Crew Discover tiles) wins over everything:
    // it returns the user to the exact tab/page they opened the item from,
    // instead of a hardcoded parent that feels like a jump to a different page.
    // Read it from the URL at click time to avoid needing a Suspense boundary
    // around useSearchParams on statically-renderable pages.
    const prev = previousPath();
    if (typeof window !== "undefined") {
      const from = new URLSearchParams(window.location.search).get("from");
      if (from) {
        if (prev === from.split("?")[0]) router.back();
        else router.push(from);
        return;
      }
    }
    if (href) {
      const parents = [href, ...alsoFrom].map((p) => p.split("?")[0]);
      if (prev && parents.includes(prev)) router.back();
      else router.push(href);
      return;
    }
    // No fixed parent: return to whichever page they came from (history
    // calendar, feed, coach chat, etc.).
    if (prev) {
      router.back();
      return;
    }
    // No fixed parent and nothing in-app behind us (a deep link or a push):
    // land somewhere useful rather than leaving the app.
    router.push(fallbackHref);
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
