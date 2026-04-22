import { format } from "date-fns";

type PR = {
  id: string;
  value: number;
  reps: number | null;
  date: Date;
  exercise: { name: string };
};

export default function PRList({ prs }: { prs: PR[] }) {
  return (
    <div className="space-y-3">
      {prs.map((pr) => (
        <div key={pr.id} className="flex items-center justify-between">
          <div>
            <p className="text-white text-sm font-medium">{pr.exercise.name}</p>
            <p className="text-zinc-500 text-xs">
              {format(new Date(pr.date), "MMM d, yyyy")}
            </p>
          </div>
          <div className="text-right">
            <p className="text-orange-400 font-bold">{pr.value} lbs</p>
            {pr.reps && (
              <p className="text-zinc-500 text-xs">for {pr.reps} reps</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
