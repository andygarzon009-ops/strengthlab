"use client";

// The body of a cardio or conditioning card in the logger.
//
// Two shapes. A machine (stair climber, treadmill, rower...) logs one row per
// bout: time, then whatever that machine's display shows. A conditioning block
// (HIIT, Tabata, battle ropes...) logs rounds × work/rest plus the movements.
// Neither needs the timer — type what the machine said and tick it. The
// block's Start button is there for anyone who wants the floating timer to
// run the rounds for them.

import { useEffect, useState } from "react";
import {
  FIELD_LABEL,
  circuitSeconds,
  formatClock,
  minutesInput,
  parseMinutes,
  type CardioField,
  type CardioInput,
  type CardioSpec,
} from "@/lib/cardio";

type Row = {
  cardio?: CardioInput;
  completed?: boolean;
};

const inputStyle = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  color: "var(--fg)",
  fontFamily: "var(--font-geist-mono)",
} as const;

/// Which CardioInput key each field writes to.
const FIELD_KEY: Record<CardioField, keyof CardioInput> = {
  time: "time",
  distance: "distance",
  calories: "calories",
  level: "level",
  incline: "incline",
  speed: "speed",
  floors: "floors",
};

export default function CardioCard({
  spec,
  rows,
  onChange,
  onToggleDone,
  onAddRow,
  onRemoveRow,
}: {
  spec: CardioSpec;
  rows: Row[];
  onChange: (rowIdx: number, next: CardioInput) => void;
  /// Ticks (or unticks) a row. `patch` replaces its numbers in the same
  /// update — finishing a started bout fills its time.
  onToggleDone: (rowIdx: number, patch?: CardioInput) => void;
  onAddRow: () => void;
  onRemoveRow: (rowIdx: number) => void;
}) {
  const machine = spec.kind === "machine";
  return (
    <div className="px-4 pb-3">
      <div className="space-y-2">
        {rows.map((row, i) => {
          const cardio = row.cardio ?? {};
          const set = (key: keyof CardioInput, value: string | string[]) =>
            onChange(i, { ...cardio, [key]: value });
          const start = () =>
            onChange(i, { ...cardio, startedAt: new Date().toISOString() });
          // Ticking a bout that was started and never given a time: the time
          // is how long it ran. A time the athlete typed always wins.
          const toggle = () => {
            if (
              !row.completed &&
              cardio.startedAt &&
              spec.kind === "machine" &&
              !parseMinutes(cardio.time)
            ) {
              const secs = Math.round(
                (Date.now() - Date.parse(cardio.startedAt)) / 1000,
              );
              if (secs > 0) {
                onToggleDone(i, { ...cardio, time: minutesInput(secs) });
                return;
              }
            }
            onToggleDone(i);
          };
          return (
            <div key={i}>
              {rows.length > 1 && (
                <p className="label text-[9px] mb-1" style={{ color: "var(--fg-dim)" }}>
                  {machine ? `Interval ${i + 1}` : `Block ${i + 1}`}
                </p>
              )}
              {spec.kind === "machine" ? (
                <MachineRow
                  fields={spec.fields}
                  value={row.cardio ?? {}}
                  set={set}
                  done={!!row.completed}
                  onToggleDone={toggle}
                  onStart={start}
                  onRemove={rows.length > 1 ? () => onRemoveRow(i) : undefined}
                />
              ) : (
                <CircuitRow
                  amrap={spec.kind === "amrap"}
                  value={row.cardio ?? {}}
                  set={set}
                  done={!!row.completed}
                  onToggleDone={toggle}
                  onStart={start}
                  onRemove={rows.length > 1 ? () => onRemoveRow(i) : undefined}
                />
              )}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onAddRow}
        className="mt-3 w-full py-2 rounded-lg text-[11px] font-semibold label transition-colors"
        style={{
          background: "var(--bg-elevated)",
          color: "var(--fg-muted)",
          letterSpacing: "0.1em",
        }}
      >
        {machine ? "+ Add interval" : "+ Add block"}
      </button>
    </div>
  );
}

function MachineRow({
  fields,
  value,
  set,
  done,
  onToggleDone,
  onStart,
  onRemove,
}: {
  fields: CardioField[];
  value: CardioInput;
  set: (key: keyof CardioInput, v: string) => void;
  done: boolean;
  onToggleDone: () => void;
  onStart: () => void;
  onRemove?: () => void;
}) {
  return (
    <div>
    <div className="flex items-end gap-1.5">
      <div
        className="grid gap-1.5 flex-1 min-w-0"
        style={{ gridTemplateColumns: `repeat(${fields.length}, minmax(0, 1fr))` }}
      >
        {fields.map((f) => {
          const meta = FIELD_LABEL[f];
          const key = FIELD_KEY[f];
          return (
            <label key={f} className="min-w-0">
              <span
                className="block text-[9px] uppercase tracking-wider font-semibold mb-1 truncate"
                style={{ color: "var(--fg-dim)" }}
              >
                {meta.label}
                {meta.unit && (
                  <span className="normal-case tracking-normal"> {meta.unit}</span>
                )}
              </span>
              <input
                // Time takes "20" or "20:30", so it needs the colon — a
                // number keyboard on iOS doesn't have one.
                type="text"
                inputMode={f === "time" ? "text" : "decimal"}
                value={(value[key] as string | undefined) ?? ""}
                onChange={(e) => set(key, e.target.value)}
                placeholder={f === "time" ? "min" : "—"}
                className="w-full text-center text-[14px] rounded-lg py-2 focus:outline-none nums"
                style={inputStyle}
              />
            </label>
          );
        })}
      </div>
      <DoneButton done={done} onClick={onToggleDone} />
      {onRemove && <RemoveButton onClick={onRemove} />}
    </div>
      <div className="mt-1.5">
        <StartLine startedAt={value.startedAt} done={done} onStart={onStart} />
      </div>
    </div>
  );
}

/// The start of a bout — what puts it on the heart rate chart as a band
/// rather than a guess. Tap before getting on; tick when getting off.
function StartLine({
  startedAt,
  done,
  onStart,
}: {
  startedAt?: string;
  done: boolean;
  onStart: () => void;
}) {
  const running = !!startedAt && !done;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const mono = { fontFamily: "var(--font-geist-mono)" } as const;
  if (running) {
    const secs = Math.max(0, Math.round((now - Date.parse(startedAt!)) / 1000));
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] nums" style={{ color: "var(--accent)", ...mono }}>
        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--accent)" }} />
        {formatClock(secs)} · tick ✓ when done
      </span>
    );
  }
  if (startedAt) {
    return (
      <span className="text-[11px] nums" style={{ color: "var(--fg-dim)", ...mono }}>
        Started{" "}
        {new Date(startedAt).toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        })}
      </span>
    );
  }
  if (done) return null;
  return (
    <button
      type="button"
      onClick={onStart}
      className="px-2.5 h-6 rounded-full text-[11px] font-semibold active:scale-95 transition-transform"
      style={{
        background: "var(--accent-dim)",
        border: "1px solid var(--accent)",
        color: "var(--accent)",
      }}
      title="Marks the start, so this shows on your heart rate chart"
    >
      ▶ Start
    </button>
  );
}

function CircuitRow({
  amrap,
  value,
  set,
  done,
  onToggleDone,
  onStart,
  onRemove,
}: {
  amrap: boolean;
  value: CardioInput;
  set: (key: keyof CardioInput, v: string | string[]) => void;
  done: boolean;
  onToggleDone: () => void;
  onStart: () => void;
  onRemove?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const movements = value.movements ?? [];

  const rounds = parseInt(value.rounds ?? "", 10);
  const work = parseInt(value.work ?? "", 10);
  const rest = parseInt(value.rest ?? "", 10) || 0;
  const cap = parseMinutes(value.time);
  const total =
    !amrap && rounds > 0 && work > 0 ? circuitSeconds(rounds, work, rest) : 0;

  const addMovement = () => {
    const name = draft.trim().replace(/,$/, "");
    if (!name) return;
    set("movements", [...movements, name]);
    setDraft("");
  };

  // The floating timer does the counting. Optional: the block logs the same
  // whether or not this is ever pressed.
  const startTimer = () => {
    // Starting the timer is also the start of the block, for the HR chart.
    if (!value.startedAt) onStart();
    if (amrap) {
      if (!cap) return;
      window.dispatchEvent(
        new CustomEvent("strengthlab:amrap-start", { detail: { seconds: cap } }),
      );
      return;
    }
    if (!(rounds > 0 && work > 0)) return;
    window.dispatchEvent(
      new CustomEvent("strengthlab:interval-start", {
        detail: { rounds, workSeconds: work, restSeconds: rest },
      }),
    );
  };
  const canStart = amrap ? !!cap : rounds > 0 && work > 0;

  const box = (
    label: string,
    key: keyof CardioInput,
    placeholder: string,
    mode: "numeric" | "text" = "numeric",
  ) => (
    <label className="min-w-0">
      <span
        className="block text-[9px] uppercase tracking-wider font-semibold mb-1 truncate"
        style={{ color: "var(--fg-dim)" }}
      >
        {label}
      </span>
      <input
        type="text"
        inputMode={mode}
        value={(value[key] as string | undefined) ?? ""}
        onChange={(e) => set(key, e.target.value)}
        placeholder={placeholder}
        className="w-full text-center text-[14px] rounded-lg py-2 focus:outline-none nums"
        style={inputStyle}
      />
    </label>
  );

  return (
    <div>
      <div className="flex items-end gap-1.5">
        <div className="grid grid-cols-3 gap-1.5 flex-1 min-w-0">
          {amrap ? (
            <>
              {box("Time cap min", "time", "12", "text")}
              {box("Rounds", "rounds", "—")}
              {box("Calories", "calories", "—")}
            </>
          ) : (
            <>
              {box("Rounds", "rounds", "5")}
              {box("Work sec", "work", "40")}
              {box("Rest sec", "rest", "20")}
            </>
          )}
        </div>
        <DoneButton done={done} onClick={onToggleDone} />
        {onRemove && <RemoveButton onClick={onRemove} />}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        {movements.map((m, mi) => (
          <button
            key={`${m}-${mi}`}
            type="button"
            onClick={() =>
              set(
                "movements",
                movements.filter((_, j) => j !== mi),
              )
            }
            className="text-[11px] px-2 py-1 rounded-md"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              color: "var(--fg-muted)",
            }}
            aria-label={`Remove ${m}`}
          >
            {m} <span style={{ color: "var(--fg-dim)" }}>×</span>
          </button>
        ))}
        <input
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            if (v.endsWith(",")) {
              const name = v.slice(0, -1).trim();
              if (name) set("movements", [...movements, name]);
              setDraft("");
            } else {
              setDraft(v);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addMovement();
            }
          }}
          onBlur={addMovement}
          placeholder={movements.length ? "+ movement" : "Movements (burpees, swings…)"}
          className="flex-1 min-w-[120px] text-[12px] rounded-lg px-2.5 py-1.5 focus:outline-none"
          style={{
            background: "transparent",
            border: "1px dashed var(--border)",
            color: "var(--fg-muted)",
          }}
        />
      </div>

      <div className="flex items-center justify-between mt-2">
        <span
          className="text-[11px] nums"
          style={{ color: "var(--fg-dim)", fontFamily: "var(--font-geist-mono)" }}
        >
          {amrap
            ? cap
              ? `${formatClock(cap)} cap`
              : ""
            : total > 0
              ? `${formatClock(total)} total`
              : ""}
        </span>
        {value.startedAt ? (
          <StartLine startedAt={value.startedAt} done={done} onStart={onStart} />
        ) : done ? null : (
        <button
          type="button"
          onClick={startTimer}
          disabled={!canStart}
          className="px-3 h-7 rounded-full text-[11px] font-semibold disabled:opacity-40 active:scale-95 transition-transform"
          style={{
            background: "var(--accent-dim)",
            border: "1px solid var(--accent)",
            color: "var(--accent)",
          }}
          title="Optional — runs the rounds on the floating timer"
        >
          ▶ Start timer
        </button>
        )}
      </div>
    </div>
  );
}

function DoneButton({ done, onClick }: { done: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-transform active:scale-90"
      style={{
        background: done ? "var(--accent)" : "var(--bg-elevated)",
        border: `1px solid ${done ? "var(--accent)" : "var(--border)"}`,
        color: done ? "#0a0a0a" : "var(--fg-muted)",
      }}
      aria-label={done ? "Mark incomplete" : "Mark complete"}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12l5 5 9-11" />
      </svg>
    </button>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-6 h-9 flex items-center justify-center shrink-0"
      style={{ color: "var(--fg-dim)" }}
      aria-label="Remove"
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  );
}
