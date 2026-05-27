"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SyncHRButton({ workoutId }: { workoutId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sync() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/workouts/${workoutId}/sync-hr`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) {
        setMsg(body.error ?? "Sync failed");
      } else if (body.connected === false) {
        setMsg("Connect Fitbit on the Health page first.");
      } else {
        setMsg(`Synced ${body.synced} samples`);
        router.refresh();
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-3">
      <button
        onClick={sync}
        disabled={loading}
        className="w-full rounded-xl px-4 py-2.5 text-[13px] font-semibold disabled:opacity-50"
        style={{ background: "var(--surface)", color: "var(--fg)" }}
      >
        {loading ? "Syncing…" : "Sync heart rate from Fitbit"}
      </button>
      {msg && (
        <p
          className="text-[11px] mt-1.5 text-center"
          style={{ color: "var(--fg-dim)" }}
        >
          {msg}
        </p>
      )}
    </div>
  );
}
