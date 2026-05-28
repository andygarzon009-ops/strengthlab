"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

// Pixels of finger travel needed (after dampening) to commit a refresh
// when the user releases. Tuned by feel — generous enough that a normal
// downward swipe at the top of the page doesn't accidentally fire.
const TRIGGER_PX = 60;
// Maximum pull distance the indicator follows. Past this we stop tracking
// so the gesture feels resistant the further it's pulled.
const MAX_PULL_PX = 110;

/// Wraps a server-rendered page in a client island that:
///  1. Fires `router.refresh()` when the user pulls down at scroll top, so
///     the dashboard re-runs its server queries (including the live
///     Google Health pulls inside the heart-rate / activity-ring cards).
///  2. Also refreshes when the tab becomes visible again — opening the app
///     after switching away should never show stale Fitbit data.
export default function PullToRefresh({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const refreshingRef = useRef(false);
  const pullRef = useRef(0);

  const fire = () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    router.refresh();
    // Hold the indicator briefly so the user gets feedback even when the
    // server returns almost instantly. router.refresh is fire-and-forget,
    // so we can't await it.
    window.setTimeout(() => {
      refreshingRef.current = false;
      setRefreshing(false);
    }, 1200);
  };

  // Tab visibility — auto-refresh on return.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") fire();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Touch pull-to-refresh.
  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || refreshingRef.current) return;
      startY.current = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      if (window.scrollY > 0) {
        startY.current = null;
        pullRef.current = 0;
        setPull(0);
        return;
      }
      const delta = e.touches[0].clientY - startY.current;
      // Half-rate dampening — finger drag of 200px shows as a 100px pull.
      const next = delta > 0 ? Math.min(MAX_PULL_PX, delta * 0.5) : 0;
      pullRef.current = next;
      setPull(next);
    };
    const onEnd = () => {
      if (pullRef.current >= TRIGGER_PX) fire();
      startY.current = null;
      pullRef.current = 0;
      setPull(0);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = refreshing || pull > 0;
  const offsetY = refreshing ? 24 : pull;

  return (
    <>
      <div
        aria-hidden={!visible}
        className="pointer-events-none fixed left-0 right-0 flex justify-center"
        style={{
          top: 0,
          transform: `translateY(${Math.max(0, offsetY) - 36}px)`,
          transition: refreshing || pull === 0 ? "transform 200ms" : "none",
          zIndex: 50,
        }}
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            opacity: Math.min(1, (offsetY + (refreshing ? 36 : 0)) / 36),
            boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
          }}
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
              animation: refreshing ? "ptr-spin 0.9s linear infinite" : undefined,
              transform: refreshing
                ? undefined
                : `rotate(${(pull / MAX_PULL_PX) * 360}deg)`,
            }}
          >
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
            <polyline points="21 3 21 8 16 8" />
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            <polyline points="3 21 3 16 8 16" />
          </svg>
        </div>
      </div>
      <style>{`@keyframes ptr-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      {children}
    </>
  );
}
