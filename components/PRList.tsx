import { format } from "date-fns";
import { isTimedExercise } from "@/lib/exercises";

type PR = {
  id: string;
  value: number;
  reps: number | null;
  date: Date;
  exercise: { name: string };
};

export default function PRList({ prs }: { prs: PR[] }) {
  return (
    <div className="space-y-2.5">
      {prs.map((pr) => {
        const timed = isTimedExercise(pr.exercise.name);
        return (
          <div
            key={pr.id}
            className="flex items-center justify-between py-1"
          >
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
              className="text-right shrink-0 nums"
              style={{ fontFamily: "var(--font-geist-mono)" }}
            >
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
          </div>
        );
      })}
    </div>
  );
}
