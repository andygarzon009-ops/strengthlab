"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createChallenge } from "@/lib/actions/crewChallenges";
import { CHALLENGE_TYPES, type ChallengeType } from "@/lib/crewChallenges";

type Person = { id: string; name: string };
type Exercise = { id: string; name: string };
type Duration = "1w" | "1m" | "open";

export default function NewChallengeForm({
  people,
  exercises,
  onDone,
}: {
  people: Person[];
  exercises: Exercise[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [type, setType] = useState<ChallengeType>("VOLUME");
  const [name, setName] = useState("");
  const [exerciseId, setExerciseId] = useState("");
  const [target, setTarget] = useState("");
  const [duration, setDuration] = useState<Duration>("1w");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(people.map((p) => p.id)),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const autoName = () => {
    if (type === "LIFT_RACE") {
      const ex = exercises.find((e) => e.id === exerciseId);
      return ex ? `${ex.name} race` : "Lift race";
    }
    return CHALLENGE_TYPES.find((t) => t.value === type)?.label ?? "Challenge";
  };

  const endsAtISO = () => {
    if (duration === "open") return null;
    const days = duration === "1w" ? 7 : 30;
    return new Date(Date.now() + days * 86_400_000).toISOString();
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = () => {
    setError(null);
    if (type === "LIFT_RACE" && !exerciseId) {
      setError("Pick a lift to race.");
      return;
    }
    startTransition(async () => {
      const res = await createChallenge({
        name: name.trim() || autoName(),
        type,
        exerciseId: type === "LIFT_RACE" ? exerciseId : null,
        targetValue:
          type === "LIFT_RACE" && target ? parseFloat(target) : null,
        endsAt: endsAtISO(),
        memberIds: [...selected],
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.id) router.push(`/group/challenges/${res.id}`);
    });
  };

  const fieldStyle = {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    color: "var(--fg)",
  };

  return (
    <div className="card p-4 mb-4 animate-slide-up">
      <p className="label mb-3">New challenge</p>

      {/* Type */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {CHALLENGE_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setType(t.value)}
            className="text-left rounded-xl px-3 py-2.5"
            style={{
              background:
                type === t.value ? "var(--accent-dim)" : "var(--bg-elevated)",
              border:
                type === t.value
                  ? "1px solid rgba(34,197,94,0.4)"
                  : "1px solid var(--border)",
            }}
          >
            <p
              className="text-[13px] font-semibold"
              style={{ color: type === t.value ? "var(--accent)" : "var(--fg)" }}
            >
              {t.label}
            </p>
            <p className="text-[10px]" style={{ color: "var(--fg-dim)" }}>
              {t.blurb}
            </p>
          </button>
        ))}
      </div>

      {/* Lift race specifics */}
      {type === "LIFT_RACE" && (
        <div className="space-y-2.5 mb-3">
          <div>
            <p className="label mb-1.5">Lift</p>
            <select
              value={exerciseId}
              onChange={(e) => setExerciseId(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-[14px] focus:outline-none"
              style={fieldStyle}
            >
              <option value="">— pick a lift —</option>
              {exercises.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="label mb-1.5">Target weight (optional)</p>
            <input
              type="number"
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="e.g. 315 — flags who hits it"
              className="w-full rounded-xl px-4 py-3 text-[15px] focus:outline-none nums"
              style={{ ...fieldStyle, fontFamily: "var(--font-geist-mono)" }}
            />
          </div>
        </div>
      )}

      {/* Name */}
      <div className="mb-3">
        <p className="label mb-1.5">Name (auto-filled)</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={autoName()}
          className="w-full rounded-xl px-4 py-3 text-[14px] focus:outline-none"
          style={fieldStyle}
        />
      </div>

      {/* Duration */}
      <div className="mb-3">
        <p className="label mb-1.5">Runs for</p>
        <div className="flex gap-1.5">
          {(
            [
              ["1w", "1 week"],
              ["1m", "1 month"],
              ["open", "No end"],
            ] as [Duration, string][]
          ).map(([val, lbl]) => (
            <button
              key={val}
              type="button"
              onClick={() => setDuration(val)}
              className="flex-1 py-2 rounded-lg text-[12px] font-semibold"
              style={{
                background:
                  duration === val ? "var(--accent)" : "var(--bg-elevated)",
                color: duration === val ? "#0a0a0a" : "var(--fg-dim)",
                border: "1px solid var(--border)",
              }}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Members */}
      {people.length > 0 && (
        <div className="mb-3">
          <p className="label mb-1.5">Who&apos;s in (you&apos;re always in)</p>
          <div className="flex flex-wrap gap-1.5">
            {people.map((p) => {
              const on = selected.has(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  className="px-3 py-1.5 rounded-full text-[12px] font-medium"
                  style={{
                    background: on ? "var(--accent-dim)" : "var(--bg-elevated)",
                    border: on
                      ? "1px solid rgba(34,197,94,0.4)"
                      : "1px solid var(--border)",
                    color: on ? "var(--accent)" : "var(--fg-dim)",
                  }}
                >
                  {on ? "✓ " : ""}
                  {p.name.split(" ")[0]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <p className="text-[12px] mb-2" style={{ color: "#f87171" }}>
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={pending}
          className="btn-accent flex-1 py-3 rounded-xl text-[14px]"
        >
          {pending ? "Creating…" : "Create challenge"}
        </button>
        <button
          onClick={onDone}
          className="btn-ghost px-5 rounded-xl text-[14px]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
