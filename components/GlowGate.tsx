"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// The workout logger (/log, /workout/[id]/edit) pins a solid header to the
// top, so the page glow only shows as a strip behind the status bar there;
// a logged workout (/workout/[id]) draws its own in the session's colour.
// Fuel has its own blue in place of the day's recovery colour. Everywhere
// else it renders as normal.
export default function GlowGate({ children }: { children: ReactNode }) {
  const path = usePathname() ?? "";
  // A logged workout draws its own, stronger glow in the session's colour.
  if (
    path === "/log" ||
    path.startsWith("/log/") ||
    path.startsWith("/workout/")
  ) {
    return null;
  }
  if (path === "/fuel") {
    // Same shape and breathing as FeedGlow, in Fuel's blue.
    const tint = (a: number) => `rgba(56, 189, 248, ${a})`;
    return (
      <div
        aria-hidden
        className="session-glow pointer-events-none fixed inset-0 -z-10"
        style={{
          background: [
            `radial-gradient(85% 55% at 50% 38%, ${tint(0.15)} 0%, ${tint(0.05)} 50%, transparent 78%)`,
            `radial-gradient(70% 35% at 50% 100%, ${tint(0.07)} 0%, transparent 70%)`,
          ].join(", "),
          transform: "translateZ(0)",
        }}
      />
    );
  }
  return <>{children}</>;
}
