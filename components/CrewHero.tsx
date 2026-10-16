// Top of the Crew page: the crew's week at a glance (sessions, a day-by-day
// bar strip, who's active and where you rank), with the story circles living
// inside the same card. Plain markup, no hooks — renders on the server.

import Link from "next/link";
import Avatar from "@/components/Avatar";

export type CrewCircle = {
  id: string;
  name: string;
  image: string | null;
  last: Date | null;
};

const GREEN = "#4ade80";

// Story-style ring: bright gradient if trained today, soft accent within a
// week, no ring when quiet.
function ringFor(last: Date | null): string | undefined {
  if (!last) return undefined;
  const days = Math.floor((Date.now() - last.getTime()) / 86_400_000);
  if (days <= 0) return "linear-gradient(135deg, #22c55e, #a3e635)";
  if (days <= 7) return "rgba(34,197,94,0.45)";
  return undefined;
}

function Tile({ label, value, note, color }: { label: string; value: string; note: string; color?: string }) {
  return (
    <div className="rounded-2xl py-2.5 px-2 text-center" style={{ background: "var(--bg-elevated)" }}>
      <p className="text-[11px] font-semibold" style={{ color: "var(--fg-muted)" }}>{label}</p>
      <p className="text-[18px] font-bold tabular-nums leading-tight mt-0.5" style={{ color: color ?? "var(--fg)" }}>
        {value}
      </p>
      <p className="text-[10px] mt-0.5 truncate" style={{ color: "var(--fg-muted)" }}>{note}</p>
    </div>
  );
}

export default function CrewHero({
  circles,
  sessions,
  volumeLabel,
  perDay,
  active,
  crewSize,
  trainedToday,
  myRank,
}: {
  circles: CrewCircle[];
  sessions: number;
  volumeLabel: string;
  perDay: { label: string; count: number; today: boolean }[]; // oldest → today
  active: number;
  crewSize: number;
  trainedToday: number;
  myRank: number | null;
}) {
  const peak = Math.max(1, ...perDay.map((d) => d.count));
  const medal = myRank && myRank <= 3 ? ["🥇", "🥈", "🥉"][myRank - 1] : null;

  return (
    <section
      className="relative rounded-3xl pt-5 pb-4 mb-5 overflow-hidden"
      style={{
        background:
          "radial-gradient(140% 90% at 0% 0%, rgba(34,197,94,0.16) 0%, transparent 60%), var(--bg-card)",
        border: "1px solid var(--border-strong)",
      }}
    >
      <div className="px-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold" style={{ color: "var(--fg-muted)" }}>
              Crew this week
            </p>
            <p className="mt-1 leading-none">
              <span className="text-[52px] font-bold tabular-nums" style={{ letterSpacing: "-0.04em" }}>
                {sessions}
              </span>
              <span className="text-[15px] font-semibold ml-1.5" style={{ color: "var(--fg-muted)" }}>
                {sessions === 1 ? "session" : "sessions"}
              </span>
            </p>
            <p className="text-[12px] mt-1.5 tabular-nums" style={{ color: "var(--fg-muted)" }}>
              {volumeLabel} lifted together
            </p>
          </div>

          {/* sessions per day, last 7 days */}
          <div className="flex items-end gap-1.5 pt-2" aria-label="Crew sessions per day">
            {perDay.map((d, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className="flex items-end" style={{ height: 52 }}>
                  <div
                    className="w-[9px] rounded-full"
                    style={{
                      height: d.count ? Math.max(8, (d.count / peak) * 52) : 4,
                      background: d.count
                        ? d.today
                          ? "linear-gradient(180deg, #a3e635, #22c55e)"
                          : "rgba(74,222,128,0.55)"
                        : "var(--bg-elevated)",
                    }}
                  />
                </div>
                <span
                  className="text-[9px] font-semibold"
                  style={{ color: d.today ? "var(--fg)" : "var(--fg-muted)" }}
                >
                  {d.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4">
          <Tile
            label="Your rank"
            value={myRank ? `#${myRank}${medal ? ` ${medal}` : ""}` : "—"}
            note={myRank ? `of ${crewSize}` : "log a session"}
          />
          <Tile label="Active" value={`${active}/${crewSize}`} note="trained this week" />
          <Tile
            label="Today"
            value={`${trainedToday}`}
            note={trainedToday === 1 ? "has trained" : "have trained"}
            color={trainedToday > 0 ? GREEN : undefined}
          />
        </div>
      </div>

      {/* story circles */}
      <div
        className="flex gap-3 mt-4 overflow-x-auto px-5 pb-1"
        style={{ scrollbarWidth: "none" }}
      >
        {circles.map((c) => (
          <Link
            key={c.id}
            href={`/u/${c.id}`}
            className="flex flex-col items-center gap-1.5 shrink-0"
            style={{ width: 58 }}
          >
            <Avatar name={c.name} image={c.image} size={54} ring={ringFor(c.last)} />
            <span className="text-[11px] truncate w-full text-center">
              {c.name === "You" ? "You" : c.name.split(" ")[0]}
            </span>
          </Link>
        ))}
        <a
          href="#grow"
          className="flex flex-col items-center gap-1.5 shrink-0"
          style={{ width: 58 }}
        >
          <span
            className="rounded-full flex items-center justify-center text-[22px]"
            style={{
              width: 54,
              height: 54,
              background: "var(--bg-elevated)",
              border: "1px dashed var(--border-strong)",
              color: "var(--fg-muted)",
            }}
          >
            +
          </span>
          <span className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
            Add
          </span>
        </a>
      </div>
    </section>
  );
}
