"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ExercisePoint = {
  name: string;
  exercise: {
    interval: { startTime: string; endTime: string };
    displayName?: string;
    exerciseType?: string;
    activeDuration?: string;
    metricsSummary?: {
      caloriesKcal?: number;
      distanceMillimiters?: number;
      steps?: string;
      averageHeartRateBeatsPerMinute?: string;
    };
  };
};

type SyncResponse =
  | { connected: false }
  | { connected: true; exercise?: ExercisePoint[]; error?: string };

function formatDuration(activeDuration?: string): string {
  if (!activeDuration) return "";
  // "900s" → "15 min"
  const seconds = Number(activeDuration.replace("s", ""));
  if (!Number.isFinite(seconds)) return activeDuration;
  const minutes = Math.round(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} min`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

type DetectedSession = {
  name: string;
  startTime: string;
  endTime: string;
  displayName: string;
  exerciseType?: string;
  durationSec: number;
  calories?: number;
  steps?: number;
  avgHR?: number;
};

export default function HealthDashboard({
  connected,
  connectedAt,
}: {
  connected: boolean;
  connectedAt: Date | null;
}) {
  const router = useRouter();
  const [data, setData] = useState<SyncResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [detected, setDetected] = useState<DetectedSession[]>([]);
  const [detectLoading, setDetectLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);

  useEffect(() => {
    if (!connected) return;
    setDetectLoading(true);
    fetch("/api/health/detect")
      .then((r) => r.json())
      .then((body) => {
        if (Array.isArray(body.sessions)) setDetected(body.sessions);
      })
      .catch(() => {})
      .finally(() => setDetectLoading(false));
  }, [connected]);

  async function importSession(s: DetectedSession) {
    setImporting(s.name);
    try {
      const res = await fetch("/api/health/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s),
      });
      const body = await res.json();
      if (body.workoutId) {
        setDetected((prev) => prev.filter((x) => x.name !== s.name));
        router.push(`/workout/${body.workoutId}`);
      }
    } finally {
      setImporting(null);
    }
  }

  async function pull() {
    setLoading(true);
    try {
      const res = await fetch("/api/health/sync");
      const body = (await res.json()) as SyncResponse;
      setData(body);
    } finally {
      setLoading(false);
    }
  }

  async function disconnect() {
    if (!confirm("Disconnect Fitbit / Google Health?")) return;
    await fetch("/api/health/google/disconnect", { method: "POST" });
    window.location.reload();
  }

  if (!connected) {
    return (
      <div className="space-y-4">
        <p className="text-[13px]" style={{ color: "var(--fg-dim)" }}>
          Sign in with your Google account that's linked to Fitbit. You'll be asked to
          grant read access to activity and heart rate.
        </p>
        <a
          href="/api/health/google/auth"
          className="inline-flex items-center justify-center w-full rounded-xl px-4 py-3 text-[14px] font-semibold"
          style={{ background: "var(--accent)", color: "#000" }}
        >
          Connect Fitbit via Google
        </a>
      </div>
    );
  }

  const exercise = data && "exercise" in data ? data.exercise ?? [] : [];
  const fetchError = data && "error" in data ? data.error : null;

  // Average HR is computed across exercise sessions that reported one.
  const hrSamples = exercise
    .map((p) => Number(p.exercise.metricsSummary?.averageHeartRateBeatsPerMinute))
    .filter((n) => Number.isFinite(n) && n > 0);
  const avgHR =
    hrSamples.length > 0
      ? Math.round(hrSamples.reduce((s, n) => s + n, 0) / hrSamples.length)
      : null;

  return (
    <div className="space-y-5">
      <div
        className="rounded-xl p-3 text-[12px]"
        style={{ background: "var(--surface)", color: "var(--fg-dim)" }}
      >
        Connected
        {connectedAt && ` · since ${new Date(connectedAt).toLocaleDateString()}`}
      </div>

      <section>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-[15px] font-semibold">Detected workouts</h2>
          {detectLoading && (
            <span className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
              Scanning…
            </span>
          )}
        </div>
        {!detectLoading && detected.length === 0 ? (
          <p className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
            No unimported Fitbit workouts in the last 14 days.
          </p>
        ) : (
          <ul className="space-y-2">
            {detected.map((s) => {
              const minutes = Math.round(s.durationSec / 60);
              return (
                <li
                  key={s.name}
                  className="rounded-xl p-3"
                  style={{ background: "var(--surface)" }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-[14px]">{s.displayName}</span>
                    <span className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
                      {formatTime(s.startTime)}
                    </span>
                  </div>
                  <div
                    className="text-[12px] mt-1 flex gap-3 flex-wrap"
                    style={{ color: "var(--fg-dim)" }}
                  >
                    {minutes > 0 && <span>{minutes} min</span>}
                    {s.calories != null && <span>{s.calories} kcal</span>}
                    {s.avgHR && <span>{s.avgHR} bpm avg</span>}
                  </div>
                  <button
                    onClick={() => importSession(s)}
                    disabled={importing === s.name}
                    className="mt-2 w-full rounded-lg px-3 py-2 text-[12px] font-semibold disabled:opacity-50"
                    style={{ background: "var(--accent)", color: "#000" }}
                  >
                    {importing === s.name ? "Importing…" : "Import as workout"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="flex gap-2">
        <button
          onClick={pull}
          disabled={loading}
          className="flex-1 rounded-xl px-4 py-3 text-[14px] font-semibold disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#000" }}
        >
          {loading ? "Syncing…" : "Pull last 7 days"}
        </button>
        <button
          onClick={disconnect}
          className="rounded-xl px-4 py-3 text-[14px]"
          style={{ background: "var(--surface)", color: "var(--fg-dim)" }}
        >
          Disconnect
        </button>
      </div>

      {fetchError && (
        <div
          className="rounded-lg p-3 text-[12px]"
          style={{ background: "rgba(239,68,68,0.15)", color: "rgb(252,165,165)" }}
        >
          {fetchError}
        </div>
      )}

      {data && "connected" in data && data.connected && (
        <>
          <section>
            <h2 className="text-[15px] font-semibold mb-2">Heart rate (last 7d)</h2>
            {avgHR === null ? (
              <p className="text-[13px]" style={{ color: "var(--fg-dim)" }}>
                No heart-rate data in recent exercise sessions.
              </p>
            ) : (
              <div
                className="rounded-xl p-4"
                style={{ background: "var(--surface)" }}
              >
                <div className="text-[28px] font-bold leading-none">{avgHR} bpm</div>
                <div className="text-[12px] mt-1" style={{ color: "var(--fg-dim)" }}>
                  Average during exercise across {hrSamples.length} session
                  {hrSamples.length === 1 ? "" : "s"}
                </div>
              </div>
            )}
          </section>

          <section>
            <h2 className="text-[15px] font-semibold mb-2">
              Exercise sessions ({exercise.length})
            </h2>
            {exercise.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--fg-dim)" }}>
                No sessions in the last 7 days.
              </p>
            ) : (
              <ul className="space-y-2">
                {exercise.map((p) => {
                  const m = p.exercise.metricsSummary ?? {};
                  return (
                    <li
                      key={p.name}
                      className="rounded-xl p-3"
                      style={{ background: "var(--surface)" }}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold text-[14px]">
                          {p.exercise.displayName ?? p.exercise.exerciseType ?? "Activity"}
                        </span>
                        <span className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
                          {formatTime(p.exercise.interval.startTime)}
                        </span>
                      </div>
                      <div
                        className="text-[12px] mt-1 flex gap-3 flex-wrap"
                        style={{ color: "var(--fg-dim)" }}
                      >
                        <span>{formatDuration(p.exercise.activeDuration)}</span>
                        {m.caloriesKcal != null && <span>{m.caloriesKcal} kcal</span>}
                        {m.steps && <span>{m.steps} steps</span>}
                        {m.averageHeartRateBeatsPerMinute && (
                          <span>{m.averageHeartRateBeatsPerMinute} bpm avg</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
