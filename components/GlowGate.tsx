"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// The workout logger (/log, /workout/[id]/edit) pins a solid header to the
// top, so the page glow only shows as a strip behind the status bar there;
// a logged workout (/workout/[id]) draws its own in the session's colour.
// Everywhere else it renders as normal.
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
  return <>{children}</>;
}
