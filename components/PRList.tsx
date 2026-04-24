import { format } from "date-fns";
import Link from "next/link";
import { isTimedExercise } from "@/lib/exercises";

type PR = {
  id: string;
  value: number;
  reps: number | null;
  date: Date;
  workoutId: string | null;
  exercise: { name: string };
};

export default function PRList({ prs }: { prs: PR[] }) {
  return (
    <div className="space-y-0.5">
      {prs.map((pr) => {
        const timed = isTimedExercise(pr.exercise.name);
        const body = (
          <div className="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-lg transition-colors hover:bg-[var(--bg-elevated)]">
            <div className="min-w-0 flex-1 pr-3">
              <p className="text-[14px] font-medium truncate">
                {pr.exercise.name}
              </p>
              <p
                className="text-[11px] mt-0.5 nums"
                style={{
                  color: "var(--fg-dim)",
                  fontFamily: "var(--font-geist-mono)",
                }}
              >
                {format(new Date(pr.date), "MMM d, yyyy")}
              </p>
            </div>
            <div
              className="text-right shrink-0 nums flex items-center gap-2"
              style={{ fontFamily: "var(--font-geist-mono)" }}
            >
              <div>
                <p
                  className="font-semibold text-[16px] leading-tight"
                  style={{ color: "var(--accent)" }}
                >
                  {pr.value}
                  <span
                    className="text-[10px] ml-0.5 font-normal"
                    style={{ color: "var(--accent)", opacity: 0.6 }}
                  >
                    {timed ? "sec" : "lb"}
                  </span>
                </p>
                {!timed && (
                  <p
                    className="text-[10px] mt-0.5"
                    style={{ color: "var(--fg-dim)" }}
                  >
                    × {pr.reps ?? 1} reps
                  </p>
                )}
              </div>
              {pr.workoutId && (
                <span
                  className="text-[14px]"
                  style={{ color: "var(--fg-dim)" }}
                >
                  ›
                </span>
              )}
            </div>
          </div>
        );

        return pr.workoutId ? (
          <Link key={pr.id} href={`/workout/${pr.workoutId}`} className="block">
            {body}
          </Link>
        ) : (
          <div key={pr.id}>{body}</div>
        );
      })}
    </div>
  );
}
