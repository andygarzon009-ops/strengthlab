"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  FEELING_OPTIONS,
  labelForType,
  shapeForType,
  formatDuration,
} from "@/lib/exercises";
import ReactionButtons from "@/components/ReactionButtons";
import CommentSection from "@/components/CommentSection";

type WorkoutProp = {
  id: string;
  userId: string;
  title: string;
  type: string;
  date: Date;
  notes: string | null;
  feeling: string | null;
  distance: number | null;
  duration: number | null;
  pace: string | null;
  rounds: number | null;
  rpe: number | null;
  user: { name: string };
  exercises: {
    id: string;
    exercise: { name: string };
    sets: { type: string; weight: number | null; reps: number | null }[];
  }[];
  reactions: Parameters<typeof ReactionButtons>[0]["reactions"];
  comments: Parameters<typeof CommentSection>[0]["comments"];
};

export default function FeedWorkoutCard({
  workout,
  currentUserId,
}: {
  workout: WorkoutProp;
  currentUserId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const typeLabel = labelForType(workout.type);
  const shape = shapeForType(workout.type);
  const feeling = FEELING_OPTIONS.find((f) => f.value === workout.feeling);
  const workingSets = workout.exercises.flatMap((e) =>
    e.sets.filter((s) => s.type === "WORKING")
  );
  const topSetWeight = workingSets.reduce(
    (max, s) => Math.max(max, s.weight ?? 0),
    0
  );
  const isOwn = workout.userId === currentUserId;

  return (
    <article className="card overflow-hidden animate-slide-up">
      {/* Header row */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-semibold shrink-0"
              style={{
                background: "var(--accent-dim)",
                color: "var(--accent)",
                border: "1px solid rgba(34,197,94,0.2)",
              }}
            >
              {workout.user.name[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-[14px] truncate">
                {isOwn ? "You" : workout.user.name}
              </p>
              <p
                className="text-[11px] mt-0.5"
                style={{ color: "var(--fg-dim)" }}
              >
                {formatDistanceToNow(new Date(workout.date), {
                  addSuffix: true,
                })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {feeling && (
              <span
                className="label text-[9px]"
                style={{ color: "var(--fg-dim)" }}
              >
                {feeling.label}
              </span>
            )}
            <span
              className="label text-[9px] px-2 py-1 rounded-md"
              style={{
                background: "var(--bg-elevated)",
                color: "var(--fg-muted)",
              }}
            >
              {typeLabel}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full text-left mt-3"
          aria-expanded={expanded}
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold text-[17px] tracking-tight leading-tight">
              {workout.title}
            </h3>
            <span
              className="text-[12px] shrink-0 transition-transform"
              style={{
                color: "var(--fg-dim)",
                transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              }}
              aria-hidden
            >
              ▾
            </span>
          </div>
        </button>

        {/* Compact summary row — always visible */}
        <CompactSummary
          shape={shape}
          exercisesCount={workout.exercises.length}
          workingSets={workingSets.length}
          topSetWeight={topSetWeight}
          distance={workout.distance}
          duration={workout.duration}
          pace={workout.pace}
          rounds={workout.rounds}
          rpe={workout.rpe}
        />
      </div>

      {expanded && (
        <>
          {workout.notes && (
            <p
              className="px-4 pb-3 text-[13px] leading-relaxed -mt-1"
              style={{ color: "var(--fg-muted)" }}
            >
              {workout.notes}
            </p>
          )}

          <div
            className="px-4 py-3 grid grid-cols-3 gap-px"
            style={{ background: "var(--border)" }}
          >
            {shape === "STRENGTH" ? (
              <>
                <Stat label="Exercises" value={workout.exercises.length} />
                <Stat label="Sets" value={workingSets.length} />
                <Stat
                  label="Top set"
                  value={topSetWeight > 0 ? topSetWeight : "—"}
                  suffix={topSetWeight > 0 ? "lb" : undefined}
                />
              </>
            ) : shape === "DISTANCE" ? (
              <>
                <Stat
                  label="Distance"
                  value={workout.distance ?? "—"}
                  suffix={workout.distance ? "km" : undefined}
                />
                <Stat label="Time" value={formatDuration(workout.duration)} />
                <Stat
                  label="Pace"
                  value={workout.pace ?? "—"}
                  suffix={workout.pace ? "/km" : undefined}
                />
              </>
            ) : (
              <>
                <Stat label="Time" value={formatDuration(workout.duration)} />
                <Stat label="Rounds" value={workout.rounds ?? "—"} />
                <Stat
                  label="RPE"
                  value={workout.rpe ?? "—"}
                  suffix={workout.rpe ? "/10" : undefined}
                />
              </>
            )}
          </div>

          {shape === "STRENGTH" && workout.exercises.length > 0 && (
            <div className="px-4 pt-3 pb-3">
              <div className="flex flex-wrap gap-1.5">
                {workout.exercises.map((ex) => (
                  <span
                    key={ex.id}
                    className="text-[11px] px-2 py-1 rounded-md"
                    style={{
                      background: "var(--bg-elevated)",
                      color: "var(--fg-muted)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {ex.exercise.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="px-4 pb-3">
            <Link
              href={`/workout/${workout.id}`}
              className="text-[11px] label"
              style={{ color: "var(--accent)" }}
            >
              Open session →
            </Link>
          </div>
        </>
      )}

      <div
        className="px-4 py-3 flex items-center gap-2"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <ReactionButtons
          workoutId={workout.id}
          reactions={workout.reactions}
          currentUserId={currentUserId}
        />
        {!isOwn && (
          <Link
            href={`/log?clone=${workout.id}`}
            className="ml-auto text-[11px] label px-2.5 py-1.5 rounded-lg"
            style={{
              background: "var(--accent-dim)",
              color: "var(--accent)",
              border: "1px solid rgba(34,197,94,0.3)",
            }}
          >
            ⚡ Do this workout
          </Link>
        )}
      </div>

      {expanded && (
        <CommentSection
          workoutId={workout.id}
          comments={workout.comments}
          currentUserId={currentUserId}
        />
      )}
    </article>
  );
}

function CompactSummary({
  shape,
  exercisesCount,
  workingSets,
  topSetWeight,
  distance,
  duration,
  pace,
  rounds,
  rpe,
}: {
  shape: "STRENGTH" | "DISTANCE" | "DURATION";
  exercisesCount: number;
  workingSets: number;
  topSetWeight: number;
  distance: number | null;
  duration: number | null;
  pace: string | null;
  rounds: number | null;
  rpe: number | null;
}) {
  const bits: ReactNode[] = [];
  if (shape === "STRENGTH") {
    bits.push(<Bit key="ex">{exercisesCount} ex</Bit>);
    bits.push(<Bit key="sets">{workingSets} sets</Bit>);
    if (topSetWeight > 0) bits.push(<Bit key="top">top {topSetWeight}lb</Bit>);
  } else if (shape === "DISTANCE") {
    if (distance != null) bits.push(<Bit key="d">{distance}km</Bit>);
    if (duration != null) bits.push(<Bit key="t">{formatDuration(duration)}</Bit>);
    if (pace) bits.push(<Bit key="p">{pace}/km</Bit>);
  } else {
    if (duration != null) bits.push(<Bit key="t">{formatDuration(duration)}</Bit>);
    if (rounds != null) bits.push(<Bit key="r">{rounds} rds</Bit>);
    if (rpe != null) bits.push(<Bit key="rpe">RPE {rpe}</Bit>);
  }
  if (bits.length === 0) return null;
  return <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">{bits}</div>;
}

function Bit({ children }: { children: ReactNode }) {
  return (
    <span
      className="text-[12px] nums"
      style={{
        color: "var(--fg-muted)",
        fontFamily: "var(--font-geist-mono)",
      }}
    >
      {children}
    </span>
  );
}

function Stat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string | number;
  suffix?: string;
}) {
  return (
    <div
      className="px-3 py-2.5 text-center"
      style={{ background: "var(--bg-card)" }}
    >
      <p
        className="font-semibold text-[18px] leading-none tracking-tight nums"
        style={{ fontFamily: "var(--font-geist-mono)" }}
      >
        {value}
        {suffix && (
          <span
            className="text-[10px] ml-0.5 font-normal"
            style={{ color: "var(--fg-dim)" }}
          >
            {suffix}
          </span>
        )}
      </p>
      <p
        className="label text-[9px] mt-1.5"
        style={{ color: "var(--fg-dim)" }}
      >
        {label}
      </p>
    </div>
  );
}
