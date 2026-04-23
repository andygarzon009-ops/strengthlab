"use client";

import { createGoal, deleteGoal, type GoalType } from "@/lib/actions/goals";
import { useMemo, useState, useTransition } from "react";

type Exercise = { id: string; name: string };

export type GoalWithProgress = {
  id: string;
  type: string;
  title: string;
  exerciseId: string | null;
  exerciseName: string | null;
  targetValue: number;
  targetReps: number | null;
  unit: string | null;
  deadline: string | null;
  currentValue: number;
  currentReps: number | null;
  progressPct: number;
};

export default function GoalsSection({
  goals,
  exercises,
}: {
  goals: GoalWithProgress[];
  exercises: Exercise[];
}) {
  const [adding, setAdding] = useState(false);

  const activeCount = goals.length;

  return (
    <div className="mb-6">
      <div className="flex items-end justify-between mb-4">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-[22px] font-bold tracking-tight leading-none">
            Targets
          </h2>
          {activeCount > 0 && (
            <p
              className="nums text-[12px] font-semibold"
              style={{
                color: "var(--fg-dim)",
                fontFamily: "var(--font-geist-mono)",
              }}
            >
              Chasing {activeCount}
            </p>
          )}
        </div>
        <button
          onClick={() => setAdding(!adding)}
          className="btn-ghost px-3 py-2 rounded-lg text-[12px] font-medium label"
        >
          {adding ? "Cancel" : "+ Add"}
        </button>
      </div>

      {adding && (
        <AddGoalForm
          exercises={exercises}
          onDone={() => setAdding(false)}
        />
      )}

      {goals.length === 0 ? (
        !adding && (
          <div
            className="card p-6 text-center"
            style={{
              border: "1px dashed var(--border-strong)",
              background: "transparent",
            }}
          >
            <p
              className="text-[13px] mb-2"
              style={{ color: "var(--fg-muted)" }}
            >
              No goals set yet
            </p>
            <p
              className="text-[11px]"
              style={{ color: "var(--fg-dim)" }}
            >
              Set a target — we&apos;ll track progress every session.
            </p>
          </div>
        )
      ) : (
        <div className="space-y-2.5">
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} />
          ))}
        </div>
      )}
    </div>
  );
}

function GoalCard({ goal }: { goal: GoalWithProgress }) {
  const [, startTransition] = useTransition();
  const [showDelete, setShowDelete] = useState(false);

  const pct = Math.min(100, Math.max(0, goal.progressPct));
  const complete = pct >= 100;
  const daysLeft = goal.deadline
    ? Math.ceil(
        (new Date(goal.deadline).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24)
      )
    : null;

  return (
    <div
      className="card p-4"
      style={
        complete
          ? {
              borderColor: "rgba(34,197,94,0.4)",
              background:
                "linear-gradient(180deg, rgba(34,197,94,0.05) 0%, var(--bg-card) 100%)",
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <p
            className="label text-[9px] mb-1"
            style={{ color: "var(--fg-dim)" }}
          >
            {goalTypeLabel(goal.type)}
          </p>
          <h3 className="font-semibold text-[15px] tracking-tight truncate">
            {goal.title}
          </h3>
          {daysLeft !== null && (
            <p
              className="text-[11px] mt-0.5 nums"
              style={{
                color: daysLeft < 0 ? "#f87171" : "var(--fg-dim)",
                fontFamily: "var(--font-geist-mono)",
              }}
            >
              {daysLeft < 0
                ? `${Math.abs(daysLeft)}d past deadline`
                : daysLeft === 0
                  ? "Due today"
                  : `${daysLeft}d to go`}
            </p>
          )}
        </div>
        <button
          onClick={() => setShowDelete(!showDelete)}
          className="text-[11px] label"
          style={{ color: "var(--fg-dim)" }}
        >
          {showDelete ? "Cancel" : "•••"}
        </button>
      </div>

      {/* Progress */}
      <div className="flex items-baseline justify-between mb-1.5">
        <span
          className="nums text-[22px] font-bold leading-none tracking-tight"
          style={{
            fontFamily: "var(--font-geist-mono)",
            color: complete ? "var(--accent)" : "var(--fg)",
          }}
        >
          {formatNumber(goal.currentValue)}
          {unitSuffix(goal.unit) && (
            <span
              className="text-[12px] ml-0.5 font-normal"
              style={{ color: "var(--fg-dim)" }}
            >
              {unitSuffix(goal.unit)}
            </span>
          )}
          {goal.type === "STRENGTH" && (
            <span
              className="text-[13px] ml-1 font-normal"
              style={{ color: "var(--fg-dim)" }}
            >
              × {goal.currentReps ?? 1}
            </span>
          )}
          <span
            className="text-[12px] ml-1 font-normal"
            style={{ color: "var(--fg-dim)" }}
          >
            / {formatNumber(goal.targetValue)}
            {unitSuffix(goal.unit) && (
              <span className="ml-0.5">{unitSuffix(goal.unit)}</span>
            )}
            {goal.type === "STRENGTH" && goal.targetReps != null && (
              <> × {goal.targetReps}</>
            )}
          </span>
        </span>
        <span
          className="nums text-[13px] font-semibold"
          style={{
            color: complete ? "var(--accent)" : "var(--fg-muted)",
            fontFamily: "var(--font-geist-mono)",
          }}
        >
          {pct.toFixed(0)}%
        </span>
      </div>

      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ background: "var(--bg-elevated)" }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: complete
              ? "linear-gradient(90deg, var(--accent) 0%, var(--accent-hover) 100%)"
              : "var(--accent)",
          }}
        />
      </div>

      {complete && (
        <p
          className="label text-[10px] mt-2.5"
          style={{ color: "var(--accent)" }}
        >
          Goal reached — set a new one
        </p>
      )}

      {showDelete && (
        <div
          className="mt-3 pt-3 flex gap-2"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <button
            onClick={() =>
              startTransition(async () => {
                await deleteGoal(goal.id);
                setShowDelete(false);
              })
            }
            className="flex-1 py-2 rounded-lg text-[12px] font-medium"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
              color: "#f87171",
            }}
          >
            Delete goal
          </button>
        </div>
      )}
    </div>
  );
}

function AddGoalForm({
  exercises,
  onDone,
}: {
  exercises: Exercise[];
  onDone: () => void;
}) {
  const [type, setType] = useState<GoalType>("STRENGTH");
  const [exerciseId, setExerciseId] = useState("");
  const [target, setTarget] = useState("");
  const [reps, setReps] = useState("");
  const [deadline, setDeadline] = useState("");
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();

  const unitForType = (t: GoalType) => {
    switch (t) {
      case "STRENGTH":
        return "lb";
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

  const autoTitle = () => {
    const t = parseFloat(target);
    if (!t) return "";
    const ex = exercises.find((e) => e.id === exerciseId);
    if (type === "STRENGTH" && ex) {
      const r = parseInt(reps);
      return r > 0 ? `${t}lb ${ex.name} × ${r}` : `${t}lb ${ex.name}`;
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

    startTransition(async () => {
      await createGoal({
        type,
        title: finalTitle || "Goal",
        exerciseId: finalExerciseId,
        targetValue: parsedTarget,
        targetReps,
        unit: unitForType(type),
        deadline: deadline || undefined,
      });
      onDone();
    });
  };

  return (
    <div className="card p-4 mb-3 animate-slide-up">
      <p className="label mb-3">New goal</p>

      <div className="space-y-2.5">
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
          <p className="label mb-1.5">Target ({unitForType(type)})</p>
          <input
            type="number"
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={
              type === "STRENGTH"
                ? "315"
                : type === "FREQUENCY"
                  ? "5"
                  : type === "DISTANCE"
                    ? "10"
                    : "180"
            }
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
            {pending ? "Saving…" : "Save goal"}
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

function goalTypeLabel(type: string): string {
  switch (type) {
    case "STRENGTH":
      return "Lift target";
    case "FREQUENCY":
      return "Frequency";
    case "BODYWEIGHT_GAIN":
    case "BODYWEIGHT_CUT":
      return "Body weight";
    case "DISTANCE":
      return "Distance";
    case "PACE":
      return "Pace";
    default:
      return type;
  }
}

function formatNumber(v: number): string {
  return Number.isInteger(v) || Math.abs(v - Math.round(v)) < 0.05
    ? Math.round(v).toString()
    : v.toFixed(1);
}

function unitSuffix(unit: string | null): string {
  if (!unit) return "";
  if (unit === "sessions/week") return "";
  return unit;
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
