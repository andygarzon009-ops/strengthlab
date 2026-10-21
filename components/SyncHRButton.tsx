"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/// How close the trace has to get to the end of the workout to count as
/// complete. The watch samples every few seconds; a minute covers the gap
/// between the last sample and the moment the athlete hit stop.
const COMPLETE_WITHIN_MS = 60_000;
/// Keep catching up for this long after the workout ends. The watch uploads
/// in batches, so the save-time sync often stops minutes short — on
/// 2026-10-21 the chart ended at 9:03 for a session that ran to 9:16, and a
/// manual re-sync a few minutes later filled it in.
const CATCH_UP_WINDOW_MS = 45 * 60_000;
const RETRY_DELAYS_MS = [20_000, 40_000, 60_000, 90_000, 120_000, 120_000, 180_000, 180_000];

export default function SyncHRButton({
  workoutId,
  targetEnd,
  lastSampleAt,
}: {
  workoutId: string;
  targetEnd?: string | null;
  lastSampleAt?: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const tries = useRef(0);
  const [catchingUp, setCatchingUp] = useState(false);
  // Bumped after each background try so the next one is scheduled even when
  // a try brought nothing new (the props wouldn't change).
  const [tick, setTick] = useState(0);

  async function sync(auto = false) {
    if (!auto) setLoading(true);
    if (!auto) setMsg(null);
    try {
      const res = await fetch(`/api/workouts/${workoutId}/sync-hr`, {
        method: "POST",
      });
      const body = await res.json();
      if (auto) {
        if (res.ok && body.connected !== false) router.refresh();
        return;
      }
      if (!res.ok) {
        setMsg(body.error ?? "Sync failed — try again in a few minutes.");
      } else if (body.connected === false) {
        setMsg("Connect Fitbit on the Health page first.");
      } else {
        setMsg(`Synced ${body.synced} samples`);
        router.refresh();
      }
    } catch {
      if (!auto) setMsg("Couldn't reach the server — check your connection and try again.");
    } finally {
      if (!auto) setLoading(false);
    }
  }

  // The trace stops short of the workout: keep re-syncing in the background
  // until the watch's last minutes land. Each refresh brings new props, which
  // re-runs this and schedules the next try only if it's still short.
  useEffect(() => {
    const target = targetEnd ? Date.parse(targetEnd) : null;
    const last = lastSampleAt ? Date.parse(lastSampleAt) : null;
    const short =
      target != null &&
      (last == null || target - last > COMPLETE_WITHIN_MS) &&
      Date.now() - target < CATCH_UP_WINDOW_MS &&
      tries.current < RETRY_DELAYS_MS.length;
    // Depends on the clock and how many tries have run, so it can't be
    // derived during render.
    setCatchingUp(short);
    if (!short) return;
    const t = setTimeout(async () => {
      if (document.visibilityState === "visible") {
        tries.current += 1;
        await sync(true);
      }
      setTick((n) => n + 1);
    }, RETRY_DELAYS_MS[tries.current]);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetEnd, lastSampleAt, tick]);

  return (
    <div className="mb-3">
      <button
        onClick={() => sync()}
        disabled={loading}
        className="w-full rounded-xl px-4 py-2.5 text-[13px] font-semibold disabled:opacity-50"
        style={{ background: "var(--surface)", color: "var(--fg)" }}
      >
        {loading ? "Syncing…" : "Sync heart rate from Fitbit"}
      </button>
      {(msg || catchingUp) && (
        <p
          className="text-[11px] mt-1.5 text-center break-words"
          style={{ color: "var(--fg-dim)" }}
        >
          {catchingUp
            ? "Your watch is still uploading the last few minutes — this fills in on its own."
            : msg}
        </p>
      )}
    </div>
  );
}
