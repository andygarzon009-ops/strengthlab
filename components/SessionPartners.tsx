"use client";

// Who you're lifting with, live, inside the logger.
//
// The whole thing runs off polling a single endpoint every few seconds. A set
// lands every 60–180 seconds in a real session, so a socket would buy nothing a
// lifter could perceive and would cost a service this stack doesn't have.

import { useCallback, useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import {
  inviteToSession,
  invitableCrew,
  respondToSessionInvite,
  leaveSession,
} from "@/lib/actions/sessions";

type Partner = {
  userId: string;
  name: string;
  image: string | null;
  status: string;
  setsDone: number;
  lastSet: string | null;
  lastSetAt: string | null;
  restEndsAt: string | null;
  finished?: boolean;
};

type CrewMember = { id: string; name: string; image: string | null };

const POLL_MS = 5000;

function ago(iso: string): string {
  const secs = Math.max(
    0,
    Math.round((Date.now() - new Date(iso).getTime()) / 1000),
  );
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  return mins === 1 ? "1m ago" : `${mins}m ago`;
}

/// Seconds left on a partner's rest, or null once it's run out. Counted on the
/// client off the absolute end time, so a laggy poll can't make it drift.
function useCountdown(endsAt: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  if (!endsAt) return null;
  const left = Math.round((new Date(endsAt).getTime() - now) / 1000);
  return left > 0 ? left : null;
}

export default function SessionPartners({
  sessionId,
  /// The lifts already queued, so an invite tells the other person what they'd
  /// be walking into.
  plan,
  onJoined,
  onLeft,
  onSession,
  /// Adds the caller's lifts to this athlete's own log. Only ever offered, and
  /// only while this athlete has logged nothing — see the note on the adopt
  /// button.
  onAdoptPlan,
}: {
  sessionId: string | null;
  plan: { exerciseId: string; exerciseName: string }[];
  onAdoptPlan?: (items: { exerciseId: string; exerciseName: string }[]) => void;
  /// Fired when this athlete accepts the invite, carrying the kind of session
  /// the caller is running so the form can open the log instead of leaving
  /// them on the type picker.
  onJoined?: (
    planType: string | null,
    planSplit: string | null,
    plan: { exerciseId: string; exerciseName: string }[],
  ) => void;
  /// Fired after walking out, so the caller can drop ?session= from the URL.
  onLeft?: () => void;
  /// Fired when this strip opens or learns a session, so the form can carry the
  /// id into its draft and onto the saved workout. The caller's id exists
  /// nowhere else — it isn't in their URL.
  onSession?: (sessionId: string) => void;
}) {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [myStatus, setMyStatus] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [crew, setCrew] = useState<CrewMember[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set once an invite is sent from a session this client started, so the strip
  // appears immediately instead of waiting for the caller to re-render.
  const [localSessionId, setLocalSessionId] = useState<string | null>(null);
  // Leaving has to survive the next poll. Without this the 5s tick re-reads the
  // session — where the other athlete is still happily JOINED — and puts the
  // partner straight back on screen a moment after you walked out.
  const [gone, setGone] = useState(false);
  /// The session caller's queued lifts, for the adopt button.
  const [theirPlan, setTheirPlan] = useState<
    { exerciseId: string; exerciseName: string }[]
  >([]);
  const [planType, setPlanType] = useState<string | null>(null);
  const [planSplit, setPlanSplit] = useState<string | null>(null);

  const liveId = gone ? null : (sessionId ?? localSessionId);

  const load = useCallback(async () => {
    if (!liveId) return;
    try {
      const res = await fetch(`/api/sessions/${liveId}/live`);
      // 403 means declined or left — stop watching rather than keeping the last
      // known partners on screen forever.
      if (res.status === 403) {
        setGone(true);
        setPartners([]);
        setMyStatus(null);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      setPartners(data.partners ?? []);
      setMyStatus(data.myStatus ?? null);
      setTheirPlan(data.plan ?? []);
      setPlanType(data.planType ?? null);
      setPlanSplit(data.planSplit ?? null);
    } catch {
      // A dropped poll in a gym basement is not an error worth showing.
    }
  }, [liveId]);

  // Self-scheduling rather than setInterval: the next poll is only queued once
  // the last one has come back, so a slow connection in a gym basement can't
  // stack up overlapping requests.
  useEffect(() => {
    if (!liveId) return;
    let stopped = false;
    let timer: number | undefined;
    const tick = async () => {
      await load();
      if (!stopped) timer = window.setTimeout(tick, POLL_MS);
    };
    timer = window.setTimeout(tick, 0);
    // A phone in a pocket stops firing timers; coming back to the screen should
    // show the truth immediately rather than up to a poll late.
    const onFocus = () => {
      void load();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [liveId, load]);

  const openPicker = async () => {
    setPicking(true);
    setError(null);
    if (crew === null) {
      try {
        setCrew(await invitableCrew());
      } catch {
        setCrew([]);
      }
    }
  };

  const invite = async (id: string) => {
    setBusy(id);
    setError(null);
    const res = await inviteToSession(id, plan);
    setBusy(null);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    // Inviting after having left re-enters the session, so the latch that
    // stopped the poll has to come off — otherwise liveId stays null, nothing
    // polls, and a successful invite looks like a dead button.
    setGone(false);
    setLocalSessionId(res.sessionId);
    onSession?.(res.sessionId);
    setPicking(false);
  };

  const respond = async (join: boolean) => {
    if (!liveId) return;
    setBusy("respond");
    const res = await respondToSessionInvite(liveId, join);
    setBusy(null);
    if (!join) {
      setGone(true);
      setPartners([]);
      setMyStatus(null);
      onLeft?.();
      return;
    }
    if (!("error" in res)) {
      // The plan may not have arrived yet when the invite is answered straight
      // off a push — the strip mounted moments ago. Ask once more so joining
      // lands in the workout rather than an empty log.
      let joinPlan = theirPlan;
      let joinType = planType;
      let joinSplit = planSplit;
      if (joinPlan.length === 0) {
        try {
          const res2 = await fetch(`/api/sessions/${liveId}/live`);
          if (res2.ok) {
            const data = await res2.json();
            joinPlan = data.plan ?? [];
            joinType = data.planType ?? joinType;
            joinSplit = data.planSplit ?? joinSplit;
          }
        } catch {
          // Land them in an empty log rather than nowhere.
        }
      }
      onJoined?.(joinType, joinSplit, joinPlan);
    }
    load();
  };

  const leave = async () => {
    if (!liveId) return;
    setBusy("leave");
    await leaveSession(liveId);
    setBusy(null);
    setPartners([]);
    setTheirPlan([]);
    setMyStatus(null);
    setLocalSessionId(null);
    setGone(true);
    // The session id also lives in the URL when this athlete arrived from an
    // invite; left there, a refresh would drop them straight back in.
    onLeft?.();
  };

  // The crew sheet. Hoisted into a variable so the slim solo affordance and
  // the full strip can both open it without duplicating the markup.
  const picker = picking ? (
    <>
      <div
        className="fixed inset-0 z-[59]"
        style={{ background: "rgba(0,0,0,0.6)" }}
        onClick={() => setPicking(false)}
      />
      <div
        className="fixed z-[60] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        style={{
          background: "var(--bg)",
          border: "1px solid var(--border)",
          left: 12,
          right: 12,
          bottom: "calc(env(safe-area-inset-bottom) + 16px)",
          maxHeight: "70vh",
        }}
      >
        <div
          className="px-4 py-3"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <p className="text-[14px] font-semibold">Invite to this session</p>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--fg-dim)" }}>
            Crew who follow you back
          </p>
          {error && (
            <p className="text-[11px] mt-1.5" style={{ color: "#f87171" }}>
              {error}
            </p>
          )}
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain p-2">
          {crew === null ? (
            <p className="p-4 text-[13px]" style={{ color: "var(--fg-dim)" }}>
              Loading…
            </p>
          ) : crew.length === 0 ? (
            <p
              className="p-4 text-[13px] leading-relaxed"
              style={{ color: "var(--fg-dim)" }}
            >
              Nobody yet. An invite needs a follow in both directions — follow
              someone who follows you and they&apos;ll show up here.
            </p>
          ) : (
            crew.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => invite(c.id)}
                disabled={busy !== null}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left active:opacity-70"
              >
                <Avatar name={c.name} image={c.image} size={32} />
                <span className="text-[14px] font-medium flex-1 truncate">
                  {c.name}
                </span>
                <span
                  className="text-[12px] font-semibold"
                  style={{ color: "var(--accent)" }}
                >
                  {busy === c.id ? "…" : "Invite"}
                </span>
              </button>
            ))
          )}
        </div>
        <button
          type="button"
          onClick={() => setPicking(false)}
          className="px-4 py-3 text-[13px] font-semibold"
          style={{
            borderTop: "1px solid var(--border)",
            color: "var(--fg-muted)",
          }}
        >
          Close
        </button>
      </div>
    </>
  ) : null;

  const active = partners.filter((p) => p.status === "JOINED");
  const pending = partners.filter((p) => p.status === "INVITED");
  const invited = myStatus === "INVITED";
  // Nobody in the session and nobody asked — which is every solo workout, and
  // most workouts are solo. A full card announcing "Training alone" is a card
  // spent saying nothing, so this collapses to the one thing worth offering.
  const solo = !invited && active.length === 0 && pending.length === 0;
  // What the partner is doing that this athlete isn't.
  const mine = new Set(plan.map((p) => p.exerciseId));
  const missingFromMine = theirPlan.filter((p) => !mine.has(p.exerciseId));

  if (solo) {
    return (
      <>
        <button
          type="button"
          onClick={openPicker}
          className="w-full rounded-2xl px-4 py-2.5 mb-3 text-[12px] font-semibold active:opacity-70"
          style={{
            background: "var(--bg-card)",
            border: "1px dashed var(--border-strong)",
            color: "var(--fg-muted)",
          }}
        >
          + Invite a training partner
        </button>
        {picker}
      </>
    );
  }

  return (
    <>
      <div
        className="rounded-2xl overflow-hidden mb-3"
        style={{
          background: "var(--bg-card)",
          border: `1px solid ${
            active.length > 0 || invited ? "var(--accent)" : "var(--border)"
          }`,
        }}
      >
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="label text-[9px]" style={{ color: "var(--fg-dim)" }}>
              Training partner
            </p>
            <p className="text-[13px] font-semibold mt-0.5 truncate">
              {invited
                ? "You've been invited"
                : active.length > 0
                  ? `Lifting with ${active.map((p) => p.name.split(" ")[0]).join(", ")}`
                  : pending.length > 0
                    ? `Waiting on ${pending.map((p) => p.name.split(" ")[0]).join(", ")}`
                    : "Training alone"}
            </p>
          </div>
          {invited ? (
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => respond(false)}
                disabled={busy !== null}
                className="px-3 h-8 rounded-full text-[12px] font-semibold"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  color: "var(--fg-muted)",
                }}
              >
                No
              </button>
              <button
                type="button"
                onClick={() => respond(true)}
                disabled={busy !== null}
                className="btn-accent px-4 h-8 rounded-full text-[12px] font-semibold"
              >
                Join
              </button>
            </div>
          ) : (
            <div className="flex gap-2 shrink-0">
              {(active.length > 0 || pending.length > 0) && (
                <button
                  type="button"
                  onClick={leave}
                  disabled={busy !== null}
                  className="px-3 h-8 rounded-full text-[12px] font-semibold"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    color: "var(--fg-dim)",
                  }}
                >
                  Leave
                </button>
              )}
              <button
                type="button"
                onClick={openPicker}
                className="px-3 h-8 rounded-full text-[12px] font-semibold"
                style={{
                  background: "var(--accent-dim)",
                  border: "1px solid var(--accent)",
                  color: "var(--accent)",
                }}
              >
                + Invite
              </button>
            </div>
          )}
        </div>

        {active.length > 0 && (
          <div style={{ borderTop: "1px solid var(--border)" }}>
            {active.map((p) => (
              <PartnerRow key={p.userId} partner={p} />
            ))}
          </div>
        )}

        {/* Offered, never applied for them: adopting is destructive-adjacent,
            and it's only on the table while this athlete's own list is still
            empty — nobody's half-logged session gets rewritten. */}
        {/* The way across for someone already mid-log. It used to hide the
            moment this athlete had any lift of their own — which is precisely
            the athlete who lands in the wrong workout and needs it. It's now
            offered whenever their partner is doing a lift they aren't, and it
            adds only what's missing. */}
        {onAdoptPlan && missingFromMine.length > 0 && (
          <button
            type="button"
            onClick={() => onAdoptPlan(theirPlan)}
            className="w-full px-4 py-2.5 text-[12px] font-semibold text-left active:opacity-70"
            style={{
              borderTop: "1px solid var(--border)",
              color: "var(--accent)",
            }}
          >
            + Add their {missingFromMine.length} lift
            {missingFromMine.length === 1 ? "" : "s"}
            <span
              className="block text-[10px] font-normal mt-0.5"
              style={{ color: "var(--fg-dim)" }}
            >
              {missingFromMine.map((p) => p.exerciseName).join(" · ")}
            </span>
          </button>
        )}

        {error && (
          <p className="px-4 pb-3 text-[11px]" style={{ color: "#f87171" }}>
            {error}
          </p>
        )}
      </div>

      {picker}
    </>
  );
}

/// One partner's live line: what they last hit, and — the part that actually
/// matters when you're sharing a rack — how long until they want it back.
function PartnerRow({ partner }: { partner: Partner }) {
  const restLeft = useCountdown(partner.restEndsAt);

  return (
    <div className="px-4 py-2.5 flex items-center gap-3">
      <Avatar name={partner.name} image={partner.image} size={28} />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] truncate">
          {partner.finished ? (
            <span style={{ color: "var(--accent)" }}>Finished their session</span>
          ) : (
            (partner.lastSet ?? (
              <span style={{ color: "var(--fg-dim)" }}>No sets yet</span>
            ))
          )}
        </p>
        <p
          className="text-[10px] mt-0.5 nums"
          style={{
            color: "var(--fg-dim)",
            fontFamily: "var(--font-geist-mono)",
          }}
        >
          {partner.setsDone} set{partner.setsDone === 1 ? "" : "s"}
          {!partner.finished && partner.lastSetAt
            ? ` · ${ago(partner.lastSetAt)}`
            : ""}
        </p>
      </div>
      {restLeft !== null && (
        <span
          className="nums text-[12px] font-bold px-2 py-1 rounded-full shrink-0"
          style={{
            background: "var(--accent-dim)",
            color: "var(--accent)",
            fontFamily: "var(--font-geist-mono)",
          }}
          title="Resting — the rack is free"
        >
          {Math.floor(restLeft / 60)}:{String(restLeft % 60).padStart(2, "0")}
        </span>
      )}
    </div>
  );
}
