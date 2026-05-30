"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Floating top-right bell with an unread badge. Polls the pending
// friend-request count, refetches on tab focus and on every route change so
// the badge clears right after you accept/decline on /notifications.
export default function NotificationsBell() {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    // Only poll on the Crew page, where the bell is actually shown.
    if (pathname !== "/group") return;
    let alive = true;

    const load = async () => {
      try {
        const res = await fetch("/api/notifications/count", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { count?: number };
        if (alive) setCount(data.count ?? 0);
      } catch {
        // network blips are fine — keep the last known count
      }
    };

    load();
    const id = setInterval(load, 30_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);

    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [pathname]);

  // Only surface the bell on the Crew page — that's the social hub, and it
  // keeps notifications out of the way everywhere else.
  if (pathname !== "/group") return null;

  const active = count > 0;

  return (
    <Link
      href="/notifications"
      aria-label={
        active ? `Notifications, ${count} new` : "Notifications"
      }
      className="fixed right-4 z-40 w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-transform backdrop-blur-xl"
      style={{
        top: "calc(env(safe-area-inset-top, 0px) + 12px)",
        background: "rgba(20, 20, 20, 0.7)",
        border: "1px solid var(--border)",
      }}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke={active ? "#22c55e" : "#a1a1aa"}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {active && (
        <span
          className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold"
          style={{ background: "#ef4444", color: "#fff" }}
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
