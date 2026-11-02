"use client";

import { useEffect, useState } from "react";

/// The coach's take on today's logged session, for the Today card. Written on
/// first ask, so the card asks once and shows a quiet placeholder meanwhile;
/// if no summary comes back, the fallback line stands in.
export default function DoneSummary({ workoutId, fallback }: { workoutId: string; fallback: string }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/workouts/${workoutId}/coach-summary`, { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { summary?: string | null } | null) => {
        if (!active) return;
        if (d?.summary) setText(d.summary);
        else setFailed(true);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [workoutId]);

  if (text) return <>{text}</>;
  if (failed) return <>{fallback}</>;
  return (
    <span className="animate-pulse" style={{ color: "var(--fg-muted)" }}>
      Coach is reviewing your session…
    </span>
  );
}
