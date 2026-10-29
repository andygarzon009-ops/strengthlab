import { prisma } from "@/lib/db";
import { loadRhythm } from "@/lib/rhythm";
import MuscleMap, { muscleLevel } from "@/components/MuscleMap";
import { HEAT_GRADIENT, HEAT_MAX, hoursToRecovered } from "@/lib/bodyScan";
import { PRIORITY_MUSCLES } from "@/lib/exercises";

// Where each word sits on the heat scale (see lib/bodyScan).
const SCALE_LABELS: [string, number][] = [
  ["Cold", 0],
  ["Stale", 0.34],
  ["Fresh", 0.6],
  ["Peak", 1.0],
  ["Over", 1.3],
];

// The body scan on Progress: front and back figures coloured by each muscle's
// last-7-days load on its own recovery clock, the heat scale, then the scan
// in words. It used to sit on the feed's week card; the feed now shows the
// same numbers as recovery bars.
export default async function BodyScanCard({ userId }: { userId: string }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { trainingDays: true, sex: true },
  });
  const rhythm = await loadRhythm(userId, user?.trainingDays, user?.sex).catch(() => null);
  if (!rhythm) return null;

  const entries = Object.entries(rhythm.load);
  const over = entries
    .filter(([, m]) => muscleLevel(m) === "over")
    .sort((a, b) => (b[1]?.weekSets ?? 0) - (a[1]?.weekSets ?? 0))
    .slice(0, 3)
    .map(([name, m]) =>
      m && m.weekSets > m.mrv
        ? `${name} ${Math.round(m.weekSets)} sets (max ~${m.mrv})`
        : `${name} hit again before recovering`,
    );
  const recovering = entries
    .filter(([, m]) => muscleLevel(m) === "ok" && hoursToRecovered(m) > 0)
    .sort((a, b) => hoursToRecovered(b[1]) - hoursToRecovered(a[1]))
    .slice(0, 4)
    .map(([name, m]) => `${name} ${hoursToRecovered(m)}h`);
  const cold = PRIORITY_MUSCLES.filter((m) => muscleLevel(rhythm.load[m]) === "cold").slice(0, 4);

  return (
    <section
      aria-label="Body scan"
      className="mt-4 rounded-3xl p-5"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)" }}
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-bold">Body scan</h2>
        <span className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
          last 7 days
        </span>
      </div>
      <div className="flex justify-center mt-3">
        <MuscleMap load={rhythm.load} sex={user?.sex} width={110} />
      </div>

      {/* One continuous scale, dim to bright to red. */}
      <div className="mt-4">
        <span className="block h-1.5 rounded-full" style={{ background: HEAT_GRADIENT }} />
        <div
          className="relative h-3 text-[9px] mt-1.5"
          style={{ color: "var(--fg-dim)", fontFamily: "var(--font-geist-mono)" }}
        >
          {SCALE_LABELS.map(([label, at]) => (
            <span
              key={label}
              className="absolute top-0 whitespace-nowrap"
              style={{
                left: `${(at / HEAT_MAX) * 100}%`,
                transform: at === 0 ? "none" : at >= HEAT_MAX ? "translateX(-100%)" : "translateX(-50%)",
              }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      {(over.length > 0 || recovering.length > 0 || cold.length > 0) && (
        <div className="mt-3 space-y-1 text-[12.5px] leading-snug">
          {over.length > 0 && (
            <p style={{ color: "#f87171" }}>
              <span className="font-semibold">Overworked:</span> {over.join(" · ")}
            </p>
          )}
          {recovering.length > 0 && (
            <p style={{ color: "var(--fg-muted)" }}>
              <span className="font-semibold">Ready in:</span> {recovering.join(" · ")}
            </p>
          )}
          {cold.length > 0 && (
            <p style={{ color: "var(--fg-muted)" }}>
              <span className="font-semibold">Cold:</span> {cold.join(", ")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
