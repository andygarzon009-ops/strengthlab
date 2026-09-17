"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { respondToSessionInvite } from "@/lib/actions/sessions";

/// A waiting invite, answerable where it's seen. Accepting goes straight to the
/// log carrying the session, which is where saying yes was always meant to
/// lead — the athlete is standing in a gym, not browsing.
export default function InviteBanner({
  sessionId,
  name,
  plan,
  avatar,
}: {
  sessionId: string;
  name: string;
  plan: string[];
  avatar: ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"join" | "decline" | null>(null);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const firstName = name.split(" ")[0];

  const join = async () => {
    setBusy("join");
    await respondToSessionInvite(sessionId, true);
    // The log reads ?session= and opens on their plan.
    router.push(`/log?session=${sessionId}`);
  };

  const decline = async () => {
    setBusy("decline");
    await respondToSessionInvite(sessionId, false);
    setDismissed(true);
    router.refresh();
  };

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: "var(--accent-dim)",
        border: "1px solid var(--accent)",
      }}
    >
      <div className="flex items-center gap-3">
        <div className="shrink-0">{avatar}</div>
        <div className="min-w-0 flex-1">
          <p className="label text-[9px]" style={{ color: "var(--accent)" }}>
            Training invite
          </p>
          <p className="text-[14px] font-semibold mt-0.5 truncate">
            {firstName} wants to lift
          </p>
          {plan.length > 0 && (
            <p
              className="text-[11px] mt-0.5 truncate"
              style={{ color: "var(--fg-muted)" }}
            >
              {plan.slice(0, 3).join(" · ")}
              {plan.length > 3 ? ` +${plan.length - 3}` : ""}
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          type="button"
          onClick={decline}
          disabled={busy !== null}
          className="px-4 h-9 rounded-xl text-[13px] font-semibold disabled:opacity-60"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--fg-muted)",
          }}
        >
          {busy === "decline" ? "…" : "Not today"}
        </button>
        <button
          type="button"
          onClick={join}
          disabled={busy !== null}
          className="btn-accent flex-1 h-9 rounded-xl text-[13px] font-semibold disabled:opacity-60"
        >
          {busy === "join" ? "Joining…" : "Join the session"}
        </button>
      </div>
    </div>
  );
}
