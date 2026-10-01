"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// The workout logger (/log, /workout/[id]/edit) pins a solid header to the
// top, so the page glow only shows as a strip behind the status bar there.
// Everywhere else it renders as normal.
export default function GlowGate({ children }: { children: ReactNode }) {
  const path = usePathname() ?? "";
  if (path === "/log" || path.startsWith("/log/") || path.endsWith("/edit")) {
    return null;
  }
  return <>{children}</>;
}
