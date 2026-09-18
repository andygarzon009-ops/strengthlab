// Cardio machines and conditioning blocks logged INSIDE a lifting session.
//
// A lifter who finishes on the stair climber, or closes with a HIIT circuit,
// used to have nowhere to put it short of logging a second workout. These go
// in as exercise cards like any lift, but their rows are stored as sets of
// type CARDIO with the numbers in `Set.metrics` — never in weight/reps. That
// one choice keeps every existing stat honest for free: set counts, tonnage,
// PRs and muscle coverage all filter on WORKING/SUPERSET/DROP_SET, so a
// CARDIO row is invisible to them without touching any of that code.

export const CARDIO_SET_TYPE = "CARDIO";

/// A value the cardio card can ask for. Distance is kilometres.
export type CardioField =
  | "time"
  | "distance"
  | "calories"
  | "level"
  | "incline"
  | "speed"
  | "floors";

export type CardioSpec =
  | { kind: "machine"; fields: CardioField[] }
  | {
      kind: "circuit";
      rounds: number;
      workSec: number;
      restSec: number;
      movements?: string[];
    }
  /// Time cap plus rounds completed. Work/rest intervals don't apply.
  | { kind: "amrap"; capSec: number };

type CardioEntry = {
  name: string;
  muscleGroup: "Cardio" | "Conditioning";
  spec: CardioSpec;
  /// Other names people search for — "stairmaster" finds the Stair Climber.
  aliases?: string[];
};

const machine = (...fields: CardioField[]): CardioSpec => ({
  kind: "machine",
  fields,
});
const circuit = (
  rounds: number,
  workSec: number,
  restSec: number,
  movements?: string[],
): CardioSpec => ({ kind: "circuit", rounds, workSec, restSec, movements });

export const CARDIO_EXERCISES: CardioEntry[] = [
  // --- Machines --------------------------------------------------------
  {
    name: "Stair Climber",
    muscleGroup: "Cardio",
    spec: machine("time", "level", "floors", "calories"),
    aliases: ["StairMaster", "Stairmill", "Stair Stepper", "Stepmill"],
  },
  {
    name: "Treadmill Run",
    muscleGroup: "Cardio",
    spec: machine("time", "distance", "speed", "incline"),
    aliases: ["Treadmill", "Running"],
  },
  {
    name: "Treadmill Incline Walk",
    muscleGroup: "Cardio",
    spec: machine("time", "distance", "speed", "incline"),
    aliases: ["Treadmill", "12-3-30", "Incline Walk", "Walking"],
  },
  {
    name: "Stationary Bike",
    muscleGroup: "Cardio",
    spec: machine("time", "distance", "level", "calories"),
    aliases: ["Bike", "Upright Bike", "Cycling"],
  },
  {
    name: "Spin Bike",
    muscleGroup: "Cardio",
    spec: machine("time", "distance", "level", "calories"),
    aliases: ["Spin", "Peloton", "Cycling"],
  },
  {
    name: "Recumbent Bike",
    muscleGroup: "Cardio",
    spec: machine("time", "distance", "level", "calories"),
    aliases: ["Bike"],
  },
  {
    name: "Air Bike",
    muscleGroup: "Cardio",
    spec: machine("time", "calories", "distance"),
    aliases: ["Assault Bike", "Echo Bike", "Fan Bike", "Airdyne"],
  },
  {
    name: "Rowing Machine",
    muscleGroup: "Cardio",
    spec: machine("time", "distance", "calories"),
    aliases: ["Rower", "Erg", "Concept2", "Row"],
  },
  {
    name: "SkiErg",
    muscleGroup: "Cardio",
    spec: machine("time", "distance", "calories"),
    aliases: ["Ski Erg", "Ski"],
  },
  {
    name: "Elliptical",
    muscleGroup: "Cardio",
    spec: machine("time", "distance", "level", "calories"),
    aliases: ["Cross Trainer"],
  },
  {
    name: "Arc Trainer",
    muscleGroup: "Cardio",
    spec: machine("time", "level", "calories"),
  },
  {
    name: "Jacob's Ladder",
    muscleGroup: "Cardio",
    spec: machine("time", "distance", "calories"),
    aliases: ["Ladder"],
  },
  {
    name: "VersaClimber",
    muscleGroup: "Cardio",
    spec: machine("time", "distance", "calories"),
    aliases: ["Versa Climber", "Climber"],
  },

  // --- Outdoors and everything else ------------------------------------
  {
    name: "Outdoor Run",
    muscleGroup: "Cardio",
    spec: machine("time", "distance", "calories"),
    aliases: ["Run", "Running", "Jog"],
  },
  {
    name: "Outdoor Walk",
    muscleGroup: "Cardio",
    spec: machine("time", "distance", "calories"),
    aliases: ["Walk", "Walking"],
  },
  {
    name: "Hike",
    muscleGroup: "Cardio",
    spec: machine("time", "distance", "calories"),
    aliases: ["Hiking", "Rucking", "Ruck"],
  },
  {
    name: "Outdoor Cycling",
    muscleGroup: "Cardio",
    spec: machine("time", "distance", "calories"),
    aliases: ["Bike Ride", "Cycling", "Road Bike"],
  },
  {
    name: "Swimming",
    muscleGroup: "Cardio",
    spec: machine("time", "distance", "calories"),
    aliases: ["Swim", "Laps"],
  },
  {
    name: "Jump Rope",
    muscleGroup: "Cardio",
    spec: machine("time", "calories"),
    aliases: ["Skipping", "Skip Rope", "Double Unders"],
  },

  // --- Conditioning blocks ---------------------------------------------
  {
    name: "HIIT Circuit",
    muscleGroup: "Conditioning",
    spec: circuit(5, 40, 20),
    aliases: ["HIIT", "Intervals", "Finisher"],
  },
  {
    name: "Tabata",
    muscleGroup: "Conditioning",
    spec: circuit(8, 20, 10),
    aliases: ["HIIT"],
  },
  {
    name: "EMOM",
    muscleGroup: "Conditioning",
    spec: circuit(10, 60, 0),
    aliases: ["Every Minute On The Minute"],
  },
  {
    name: "AMRAP",
    muscleGroup: "Conditioning",
    spec: { kind: "amrap", capSec: 12 * 60 },
    aliases: ["As Many Rounds As Possible", "WOD", "Metcon"],
  },
  {
    name: "Circuit Training",
    muscleGroup: "Conditioning",
    spec: circuit(3, 60, 30),
    aliases: ["Circuit", "Metcon"],
  },
  {
    name: "Battle Ropes",
    muscleGroup: "Conditioning",
    spec: circuit(6, 30, 30, ["Alternating Waves"]),
    aliases: ["Battle Rope", "Ropes"],
  },
  {
    name: "Sprint Intervals",
    muscleGroup: "Conditioning",
    spec: circuit(8, 30, 90),
    aliases: ["Sprints", "HIIT"],
  },
  {
    name: "Bike Sprints",
    muscleGroup: "Conditioning",
    spec: circuit(8, 20, 40),
    aliases: ["Air Bike Sprints", "Assault Bike Sprints", "HIIT"],
  },
  {
    name: "Rowing Intervals",
    muscleGroup: "Conditioning",
    spec: circuit(6, 60, 60),
    aliases: ["Row Intervals", "Rower"],
  },
  {
    name: "Boxing Rounds",
    muscleGroup: "Conditioning",
    spec: circuit(6, 180, 60, ["Heavy Bag"]),
    aliases: ["Boxing", "Heavy Bag", "Kickboxing", "Shadow Boxing"],
  },
  {
    name: "Kettlebell Circuit",
    muscleGroup: "Conditioning",
    spec: circuit(4, 45, 15, ["KB Swings"]),
    aliases: ["Kettlebell", "KB"],
  },
];

const BY_NAME = new Map(
  CARDIO_EXERCISES.map((e) => [e.name.toLowerCase(), e]),
);

export const CARDIO_GROUPS = new Set(["Cardio", "Conditioning"]);

/// How a card for this exercise should look, or null for an ordinary lift.
///
/// Known names get their tailored fields. A custom exercise the athlete filed
/// under Cardio or Conditioning gets the generic version of that card, so
/// "Sled Drag" or "Row Machine (gym #2)" still logs as cardio.
export function cardioSpecFor(
  name: string,
  muscleGroup?: string | null,
): CardioSpec | null {
  const hit = BY_NAME.get(name.trim().toLowerCase());
  if (hit) return hit.spec;
  if (muscleGroup === "Cardio") return machine("time", "distance", "calories");
  if (muscleGroup === "Conditioning") return circuit(5, 40, 20);
  return null;
}

export function cardioAliases(name: string): string[] {
  return BY_NAME.get(name.trim().toLowerCase())?.aliases ?? [];
}

export const FIELD_LABEL: Record<CardioField, { label: string; unit: string }> =
  {
    time: { label: "Time", unit: "min" },
    // Short: four of these share a phone-width row.
    distance: { label: "Dist", unit: "km" },
    calories: { label: "Calories", unit: "" },
    level: { label: "Level", unit: "" },
    incline: { label: "Incline", unit: "%" },
    speed: { label: "Speed", unit: "km/h" },
    floors: { label: "Floors", unit: "" },
  };

/// Stored numbers for one cardio row. Everything optional — log what the
/// machine showed, skip what it didn't.
export type CardioMetrics = {
  durationSec?: number;
  distanceKm?: number;
  calories?: number;
  level?: number;
  incline?: number;
  speed?: number;
  floors?: number;
  rounds?: number;
  workSec?: number;
  restSec?: number;
  movements?: string[];
  /// When the bout began (ISO). The row's end is the set's loggedAt, stamped
  /// on tick — together they put the bout on the heart rate chart as a span.
  startedAt?: string;
};

/// The same row as the form holds it: strings, exactly as typed.
export type CardioInput = {
  time?: string;
  distance?: string;
  calories?: string;
  level?: string;
  incline?: string;
  speed?: string;
  floors?: string;
  rounds?: string;
  work?: string;
  rest?: string;
  movements?: string[];
  startedAt?: string;
};

/// "20", "20.5" or "20:30" → seconds. Minutes are what every machine display
/// shows, so a bare number is minutes.
export function parseMinutes(raw: string | undefined): number | undefined {
  const t = (raw ?? "").trim();
  if (!t) return undefined;
  if (t.includes(":")) {
    const [m, s] = t.split(":");
    const mins = parseInt(m || "0", 10);
    const secs = parseInt(s || "0", 10);
    if (!Number.isFinite(mins) || !Number.isFinite(secs)) return undefined;
    const total = mins * 60 + secs;
    return total > 0 ? total : undefined;
  }
  const n = parseFloat(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 60) : undefined;
}

function num(raw: string | undefined): number | undefined {
  const n = parseFloat((raw ?? "").trim());
  return Number.isFinite(n) && n >= 0 && (raw ?? "").trim() !== ""
    ? n
    : undefined;
}

function int(raw: string | undefined): number | undefined {
  const n = num(raw);
  return n === undefined ? undefined : Math.round(n);
}

export function formatClock(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/// Minutes as the time box shows them: "20", or "20:30" when there are
/// leftover seconds.
export function minutesInput(sec: number | undefined): string {
  if (!sec) return "";
  return sec % 60 === 0 ? String(sec / 60) : formatClock(sec);
}

/// Total length of a circuit: every round's work, and the rests between them.
export function circuitSeconds(
  rounds: number,
  workSec: number,
  restSec: number,
): number {
  if (rounds <= 0) return 0;
  return rounds * workSec + Math.max(0, rounds - 1) * restSec;
}

export function toCardioMetrics(
  spec: CardioSpec,
  input: CardioInput,
): CardioMetrics {
  const m: CardioMetrics = {};
  if (spec.kind === "machine") {
    m.durationSec = parseMinutes(input.time);
    m.distanceKm = num(input.distance);
    m.calories = int(input.calories);
    m.level = num(input.level);
    m.incline = num(input.incline);
    m.speed = num(input.speed);
    m.floors = int(input.floors);
  } else if (spec.kind === "circuit") {
    m.rounds = int(input.rounds);
    m.workSec = int(input.work);
    m.restSec = int(input.rest);
    m.calories = int(input.calories);
    if (m.rounds && m.workSec) {
      m.durationSec = circuitSeconds(m.rounds, m.workSec, m.restSec ?? 0);
    }
  } else {
    m.durationSec = parseMinutes(input.time);
    m.rounds = int(input.rounds);
    m.calories = int(input.calories);
  }
  if (input.movements && input.movements.length > 0) {
    m.movements = input.movements;
  }
  if (input.startedAt) m.startedAt = input.startedAt;
  // Drop the empties so the stored JSON says only what was logged.
  for (const k of Object.keys(m) as (keyof CardioMetrics)[]) {
    if (m[k] === undefined) delete m[k];
  }
  return m;
}

export function fromCardioMetrics(
  raw: unknown,
): CardioInput {
  const m = (raw ?? {}) as CardioMetrics;
  const s = (n: number | undefined) => (n === undefined ? "" : String(n));
  return {
    time: minutesInput(m.durationSec),
    distance: s(m.distanceKm),
    calories: s(m.calories),
    level: s(m.level),
    incline: s(m.incline),
    speed: s(m.speed),
    floors: s(m.floors),
    rounds: s(m.rounds),
    work: s(m.workSec),
    rest: s(m.restSec),
    movements: m.movements ?? [],
    startedAt: m.startedAt,
  };
}

/// A blank row for a freshly added card. Circuits come pre-filled with
/// their standard shape (Tabata is 8 × 20/10), so the common case is one tap.
export function defaultCardioInput(spec: CardioSpec): CardioInput {
  if (spec.kind === "circuit") {
    return {
      rounds: String(spec.rounds),
      work: String(spec.workSec),
      rest: String(spec.restSec),
      movements: spec.movements ?? [],
    };
  }
  if (spec.kind === "amrap") {
    return { time: minutesInput(spec.capSec), rounds: "", movements: [] };
  }
  return {};
}

/// One line for a finished row: "20 min · 3.2 km · 180 cal".
export function cardioSummary(raw: unknown): string {
  const m = (raw ?? {}) as CardioMetrics;
  const bits: string[] = [];
  if (m.rounds && m.workSec !== undefined) {
    bits.push(
      `${m.rounds} × ${m.workSec}s${m.restSec ? `/${m.restSec}s` : ""}`,
    );
  } else if (m.rounds) {
    bits.push(`${m.rounds} rounds`);
  }
  if (m.durationSec) {
    bits.push(
      m.durationSec % 60 === 0
        ? `${m.durationSec / 60} min`
        : formatClock(m.durationSec),
    );
  }
  if (m.distanceKm) bits.push(`${m.distanceKm} km`);
  if (m.floors) bits.push(`${m.floors} floors`);
  if (m.level) bits.push(`L${m.level}`);
  if (m.incline) bits.push(`${m.incline}%`);
  if (m.speed) bits.push(`${m.speed} km/h`);
  if (m.calories) bits.push(`${m.calories} cal`);
  return bits.join(" · ");
}

/// Summary across every row of one card — for the feed chip and the "last
/// time" line. Times, distances, floors and calories add up; the rest don't.
/// When a finished row ran, for the heart rate chart. The end is the tick.
/// The start is the Start tap when there was one, otherwise the logged time
/// counted back from the end — so a row that was only ever typed in still
/// gets its band, as long as it has a time.
export function cardioSpan(
  raw: unknown,
  loggedAt: Date | string | null | undefined,
): { start: Date; end: Date } | null {
  if (!loggedAt) return null;
  const end = new Date(loggedAt);
  const m = (raw ?? {}) as CardioMetrics;
  let start: Date | null = m.startedAt ? new Date(m.startedAt) : null;
  if ((!start || !(start < end)) && m.durationSec) {
    start = new Date(end.getTime() - m.durationSec * 1000);
  }
  if (!start || Number.isNaN(start.getTime()) || !(start < end)) return null;
  return { start, end };
}

export function cardioTotal(rows: unknown[]): string {
  const t: CardioMetrics = {};
  let rounds = 0;
  for (const raw of rows) {
    const m = (raw ?? {}) as CardioMetrics;
    if (m.durationSec) t.durationSec = (t.durationSec ?? 0) + m.durationSec;
    if (m.distanceKm) t.distanceKm = +((t.distanceKm ?? 0) + m.distanceKm).toFixed(2);
    if (m.floors) t.floors = (t.floors ?? 0) + m.floors;
    if (m.calories) t.calories = (t.calories ?? 0) + m.calories;
    if (m.rounds) rounds += m.rounds;
  }
  if (rounds) t.rounds = rounds;
  return cardioSummary(t);
}
