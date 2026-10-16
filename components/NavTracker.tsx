"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { recordNav } from "@/lib/navStack";

/// Feeds lib/navStack so BackButton knows what page is behind this one.
export default function NavTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) recordNav(pathname);
  }, [pathname]);
  return null;
}
