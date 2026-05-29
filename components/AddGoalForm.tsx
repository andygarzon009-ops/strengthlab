"use client";

import { createGoal, type GoalType } from "@/lib/actions/goals";
import { PLATE_WEIGHT_LB, usesPlates, isSingleLoaded } from "@/lib/exercises";
import { useMemo, useState, useTransition } from "react";

const PLATE_UNIT = "plates/side";
const PLATE_SINGLE_UNIT = "plates";
const LB_PER_PLATE_PAIR = PLATE_WEIGHT_LB * 2;

type Exercise = { id: string; name: string };

/// Shared "new goal" form. Used by the Stats Targets section and the
/// Progress page's Strength card. `strengthOnly` hides the type selector and
/// locks it to a lift target (so a goal added from the Strength card always
/// shows up there). `onSaved` fires after a successful create — callers use
/// it to refresh the server-rendered list.
export default function AddGoalForm({
  exercises,
  onDone,
  onSaved,
  strengthOnly,
}: {
  exercises: Exercise[];
  onDone: () => void;
  onSaved?: () => void;
  strengthOnly?: boolean;
}) {
  const [type, setType] = useState<GoalType>("STRENGTH");
  const [exerciseId, setExerciseId] = useState("");
  const [target, setTarget] = useState("");
  const [reps, setReps] = useState("");
  const [deadline, setDeadline] = useState("");
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();

  const selectedExercise = exercises.find((e) => e.id === exerciseId);
  const isPlateLift =
    type === "STRENGTH" && !!selectedExercise && usesPlates(selectedExercise.name);
  // Chest-supported / landmine T-bar rows load only one sleeve, so the
  // lifter thinks in "plates" rather than "plates per side".
  const isSinglePlateLift =
    isPlateLift && !!selectedExercise && isSingleLoaded(selectedExercise.name);
  const plateUnit = isSinglePlateLift ? PLATE_SINGLE_UNIT : PLATE_UNIT;
  const platesMultiplier = isSinglePlateLift ? PLATE_WEIGHT_LB : LB_PER_PLATE_PAIR;

  const unitForType = (t: GoalType) => {
    switch (t) {
      case "STRENGTH":
        return isPlateLift ? plateUnit : "lb";
      case "FREQUENCY":
        return "sessions/week";
      case "BODYWEIGHT_GAIN":
      case "BODYWEIGHT_CUT":
        return "lb";
      case "DISTANCE":
        return "km";
      case "PACE":
        return "sec/km";
    }
  };

  const targetFieldLabel = () => {
    if (type === "STRENGTH" && isPlateLift) {
      return isSinglePlateLift ? "Target (plates)" : "Target (plates per side)";
    }
    return `Target (${unitForType(type)})`;
  };

  const targetPlaceholder = () => {
    if (type === "STRENGTH") return isPlateLift ? "2" : "315";
    if (type === "FREQUENCY") return "5";
    if (type === "DISTANCE") return "10";
    return "180";
  };

  const autoTitle = () => {
    const t = parseFloat(target);
    if (!t) return "";
    const ex = selectedExercise;
    if (type === "STRENGTH" && ex) {
      const r = parseInt(reps);
      const loadStr = isPlateLift
        ? `${t} plate${t === 1 ? "" : "s"}${isSinglePlateLift ? "" : "/side"}`
        : `${t}lb`;
      return r > 0 ? `${loadStr} ${ex.name} × ${r}` : `${loadStr} ${ex.name}`;
    }
    if (type === "FREQUENCY") return `Train ${t}× per week`;
    if (type === "BODYWEIGHT_GAIN") return `Reach ${t}lb`;
    if (type === "BODYWEIGHT_CUT") return `Cut to ${t}lb`;
    if (type === "DISTANCE") return `Run ${t}km`;
    if (type === "PACE") return `${t} sec/km pace`;
    return "";
  };

  const handleSave = () => {
    const parsedTarget = parseFloat(target);
    if (!parsedTarget) return;
    const finalTitle = title.trim() || autoTitle();
    const finalExerciseId =
      type === "STRENGTH" && exerciseId ? exerciseId : undefined;

    const parsedReps = parseInt(reps);
    const targetReps =
      type === "STRENGTH" && parsedReps > 0 ? parsedReps : undefined;

    // Convert plates-per-side into total bar weight so progression
    // tracking (which compares against logged set weights in lb) works.
    const storedTarget = isPlateLift
      ? parsedTarget * platesMultiplier
      : parsedTarget;

    startTransition(async () => {
      await createGoal({
        type,
        title: finalTitle || "Goal",
        exerciseId: finalExerciseId,
        targetValue: storedTarget,
        targetReps,
        unit: unitForType(type),
        deadline: deadline || undefined,
      });
      onSaved?.();
      onDone();
    });
  };

  return (
    <div className="card p-4 mb-3 animate-slide-up">
      <p className="label mb-3">New {strengthOnly ? "target" : "goal"}</p>

      <div className="space-y-2.5">
        {!strengthOnly && (
          <div>
            <p className="label mb-1.5">Type</p>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as GoalType)}
              className="w-full rounded-xl px-4 py-3 text-[14px] focus:outline-none appearance-none"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
                backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2352525b' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 0.75rem center",
                paddingRight: "2rem",
              }}
            >
              <option value="STRENGTH">Lift target</option>
              <option value="FREQUENCY">Weekly frequency</option>
              <option value="BODYWEIGHT_GAIN">Body weight (gain)</option>
              <option value="BODYWEIGHT_CUT">Body weight (cut)</option>
              <option value="DISTANCE">Run/ride distance</option>
            </select>
          </div>
        )}

        {type === "STRENGTH" && (
          <div>
            <p className="label mb-1.5">Exercise</p>
            <ExercisePicker
              exercises={exercises}
              value={exerciseId}
              onChange={setExerciseId}
            />
          </div>
        )}

        <div>
          <p className="label mb-1.5">{targetFieldLabel()}</p>
          <input
            type="number"
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={targetPlaceholder()}
            className="w-full rounded-xl px-4 py-3 text-[15px] focus:outline-none nums"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              color: "var(--fg)",
              fontFamily: "var(--font-geist-mono)",
            }}
          />
        </div>

        {type === "STRENGTH" && (
          <div>
            <p className="label mb-1.5">Reps (optional)</p>
            <input
              type="number"
              inputMode="numeric"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              placeholder="5"
              className="w-full rounded-xl px-4 py-3 text-[15px] focus:outline-none nums"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
                fontFamily: "var(--font-geist-mono)",
              }}
            />
          </div>
        )}

        <div>
          <p className="label mb-1.5">Deadline (optional)</p>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="w-full rounded-xl px-4 py-3 text-[14px] focus:outline-none nums"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              color: "var(--fg)",
              fontFamily: "var(--font-geist-mono)",
              colorScheme: "dark",
            }}
          />
        </div>

        <div>
          <p className="label mb-1.5">Title (auto-filled)</p>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={autoTitle()}
            className="w-full rounded-xl px-4 py-3 text-[14px] focus:outline-none"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              color: "var(--fg)",
            }}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={
              pending ||
              !target ||
              (type === "STRENGTH" && !exerciseId)
            }
            className="btn-accent flex-1 py-3 rounded-xl text-[14px]"
          >
            {pending ? "Saving…" : strengthOnly ? "Save target" : "Save goal"}
          </button>
          <button
            onClick={onDone}
            className="btn-ghost px-5 rounded-xl text-[14px]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function ExercisePicker({
  exercises,
  value,
  onChange,
}: {
  exercises: Exercise[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () => exercises.find((e) => e.id === value),
    [exercises, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return exercises;
    return exercises.filter((e) => e.name.toLowerCase().includes(q));
  }, [exercises, query]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl px-4 py-3 text-[14px] text-left flex items-center justify-between"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          color: selected ? "var(--fg)" : "var(--fg-muted)",
        }}
      >
        <span className="truncate">
          {selected ? selected.name : "— pick an exercise —"}
        </span>
        <span style={{ color: "var(--fg-dim)" }}>▾</span>
      </button>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-strong)",
      }}
    >
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search exercises…"
        className="w-full px-4 py-3 text-[14px] focus:outline-none"
        style={{
          background: "transparent",
          color: "var(--fg)",
          borderBottom: "1px solid var(--border)",
        }}
      />
      <div className="max-h-60 overflow-y-auto">
        {filtered.length === 0 ? (
          <p
            className="px-4 py-3 text-[12px]"
            style={{ color: "var(--fg-dim)" }}
          >
            No match.
          </p>
        ) : (
          filtered.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => {
                onChange(e.id);
                setQuery("");
                setOpen(false);
              }}
              className="w-full text-left px-4 py-2.5 text-[13px]"
              style={{
                background:
                  e.id === value ? "var(--accent-dim)" : "transparent",
                color:
                  e.id === value ? "var(--accent)" : "var(--fg-muted)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              {e.name}
            </button>
          ))
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setQuery("");
        }}
        className="w-full py-2 text-[11px] label"
        style={{
          color: "var(--fg-dim)",
          background: "var(--bg-card)",
        }}
      >
        Cancel
      </button>
    </div>
  );
}
