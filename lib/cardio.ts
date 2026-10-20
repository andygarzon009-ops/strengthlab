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
  | "floors"
  | "elevation";

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

/// Where an activity sits in the exercise picker's dropdowns. Lifts are
/// "lifting"; everything in this file is one of the others.
export type ActivityCategory =
  | "lifting"
  | "machine"
  | "outdoor"
  | "conditioning"
  | "sport"
  | "mind";

type CardioEntry = {
  name: string;
  muscleGroup: "Cardio" | "Conditioning";
  spec: CardioSpec;
  /// Other names people search for — "stairmaster" finds the Stair Climber.
  aliases?: string[];
  /// Defaults: Conditioning → "conditioning", Cardio → "machine".
  category?: Exclude<ActivityCategory, "lifting">;
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
    category: "outdoor",
    spec: machine("time", "distance", "elevation", "calories"),
    aliases: ["Run", "Running", "Jog"],
  },
  {
    name: "Outdoor Walk",
    muscleGroup: "Cardio",
    category: "outdoor",
    spec: machine("time", "distance", "elevation", "calories"),
    aliases: ["Walk", "Walking"],
  },
  {
    name: "Hike",
    muscleGroup: "Cardio",
    category: "outdoor",
    spec: machine("time", "distance", "elevation", "calories"),
    aliases: ["Hiking"],
  },
  {
    name: "Outdoor Cycling",
    muscleGroup: "Cardio",
    category: "outdoor",
    spec: machine("time", "distance", "elevation", "calories"),
    aliases: ["Bike Ride", "Cycling", "Road Bike"],
  },
  {
    name: "Swimming",
    muscleGroup: "Cardio",
    category: "outdoor",
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

  // Outdoor, water and snow.
  {
    name: "Trail Run",
    muscleGroup: "Cardio",
    category: "outdoor",
    spec: machine("time", "distance", "elevation", "calories"),
    aliases: ["Trail Running", "Trail"],
  },
  {
    name: "Mountain Biking",
    muscleGroup: "Cardio",
    category: "outdoor",
    spec: machine("time", "distance", "elevation", "calories"),
    aliases: ["MTB", "Mountain Bike", "Cycling"],
  },
  {
    name: "Rucking",
    muscleGroup: "Cardio",
    category: "outdoor",
    spec: machine("time", "distance", "elevation", "calories"),
    aliases: ["Ruck", "Weighted Walk"],
  },
  {
    name: "Open Water Swim",
    muscleGroup: "Cardio",
    category: "outdoor",
    spec: machine("time", "distance", "calories"),
    aliases: ["Swim", "Lake Swim", "Ocean Swim"],
  },
  {
    name: "Kayaking",
    muscleGroup: "Cardio",
    category: "outdoor",
    spec: machine("time", "distance", "calories"),
    aliases: ["Kayak", "Canoe", "Paddling"],
  },
  {
    name: "Stand-Up Paddleboarding",
    muscleGroup: "Cardio",
    category: "outdoor",
    spec: machine("time", "distance", "calories"),
    aliases: ["SUP", "Paddleboard", "Paddling"],
  },
  {
    name: "Downhill Skiing",
    muscleGroup: "Cardio",
    category: "outdoor",
    spec: machine("time", "distance", "calories"),
    aliases: ["Skiing", "Ski"],
  },
  {
    name: "Snowboarding",
    muscleGroup: "Cardio",
    category: "outdoor",
    spec: machine("time", "distance", "calories"),
    aliases: ["Snowboard"],
  },
  {
    name: "Cross-Country Skiing",
    muscleGroup: "Cardio",
    category: "outdoor",
    spec: machine("time", "distance", "calories"),
    aliases: ["XC Ski", "Nordic Ski", "Skiing"],
  },
  {
    name: "Snowshoeing",
    muscleGroup: "Cardio",
    category: "outdoor",
    spec: machine("time", "distance", "elevation", "calories"),
    aliases: ["Snowshoe"],
  },
  {
    name: "Inline Skating",
    muscleGroup: "Cardio",
    category: "outdoor",
    spec: machine("time", "distance", "calories"),
    aliases: ["Rollerblading", "Skating"],
  },
  {
    name: "Ice Skating",
    muscleGroup: "Cardio",
    category: "outdoor",
    spec: machine("time", "distance", "calories"),
    aliases: ["Skating"],
  },
  {
    name: "Surfing",
    muscleGroup: "Cardio",
    category: "outdoor",
    spec: machine("time", "calories"),
    aliases: ["Surf"],
  },
  {
    name: "Rock Climbing",
    muscleGroup: "Cardio",
    category: "outdoor",
    spec: machine("time", "calories"),
    aliases: ["Climbing", "Outdoor Climbing"],
  },
  {
    name: "Golf",
    muscleGroup: "Cardio",
    category: "outdoor",
    spec: machine("time", "distance", "calories"),
    aliases: ["Golfing", "18 Holes", "9 Holes"],
  },

  // Sports and combat.
  {
    name: "Basketball",
    muscleGroup: "Cardio",
    category: "sport",
    spec: machine("time", "calories"),
    aliases: ["Hoops", "Pickup"],
  },
  {
    name: "Soccer",
    muscleGroup: "Cardio",
    category: "sport",
    spec: machine("time", "calories"),
    aliases: ["Football", "Futsal"],
  },
  {
    name: "Tennis",
    muscleGroup: "Cardio",
    category: "sport",
    spec: machine("time", "calories"),
  },
  {
    name: "Pickleball",
    muscleGroup: "Cardio",
    category: "sport",
    spec: machine("time", "calories"),
  },
  {
    name: "Squash",
    muscleGroup: "Cardio",
    category: "sport",
    spec: machine("time", "calories"),
    aliases: ["Racquetball"],
  },
  {
    name: "Badminton",
    muscleGroup: "Cardio",
    category: "sport",
    spec: machine("time", "calories"),
  },
  {
    name: "Volleyball",
    muscleGroup: "Cardio",
    category: "sport",
    spec: machine("time", "calories"),
    aliases: ["Beach Volleyball"],
  },
  {
    name: "Hockey",
    muscleGroup: "Cardio",
    category: "sport",
    spec: machine("time", "calories"),
    aliases: ["Ice Hockey", "Ball Hockey"],
  },
  {
    name: "Flag Football",
    muscleGroup: "Cardio",
    category: "sport",
    spec: machine("time", "calories"),
    aliases: ["Football"],
  },
  {
    name: "Baseball / Softball",
    muscleGroup: "Cardio",
    category: "sport",
    spec: machine("time", "calories"),
    aliases: ["Baseball", "Softball"],
  },
  {
    name: "Ultimate Frisbee",
    muscleGroup: "Cardio",
    category: "sport",
    spec: machine("time", "calories"),
    aliases: ["Ultimate", "Frisbee"],
  },
  {
    name: "Brazilian Jiu-Jitsu",
    muscleGroup: "Cardio",
    category: "sport",
    spec: machine("time", "calories"),
    aliases: ["BJJ", "Jiu Jitsu", "Grappling"],
  },
  {
    name: "Muay Thai",
    muscleGroup: "Cardio",
    category: "sport",
    spec: machine("time", "calories"),
    aliases: ["Kickboxing", "Thai Boxing"],
  },
  {
    name: "Martial Arts",
    muscleGroup: "Cardio",
    category: "sport",
    spec: machine("time", "calories"),
    aliases: ["MMA", "Karate", "Taekwondo", "Judo"],
  },
  {
    name: "Wrestling",
    muscleGroup: "Cardio",
    category: "sport",
    spec: machine("time", "calories"),
    aliases: ["Grappling"],
  },

  // Mind and body.
  {
    name: "Yoga",
    muscleGroup: "Cardio",
    category: "mind",
    spec: machine("time", "calories"),
    aliases: ["Vinyasa", "Flow"],
  },
  {
    name: "Hot Yoga",
    muscleGroup: "Cardio",
    category: "mind",
    spec: machine("time", "calories"),
    aliases: ["Bikram", "Yoga"],
  },
  {
    name: "Pilates",
    muscleGroup: "Cardio",
    category: "mind",
    spec: machine("time", "calories"),
    aliases: ["Reformer"],
  },
  {
    name: "Barre",
    muscleGroup: "Cardio",
    category: "mind",
    spec: machine("time", "calories"),
  },
  {
    name: "Stretching",
    muscleGroup: "Cardio",
    category: "mind",
    spec: machine("time", "calories"),
    aliases: ["Stretch", "Flexibility"],
  },
  {
    name: "Mobility Flow",
    muscleGroup: "Cardio",
    category: "mind",
    spec: machine("time", "calories"),
    aliases: ["Mobility"],
  },
  {
    name: "Dance",
    muscleGroup: "Cardio",
    category: "mind",
    spec: machine("time", "calories"),
    aliases: ["Zumba", "Dance Class"],
  },
  {
    name: "Bouldering",
    muscleGroup: "Cardio",
    category: "mind",
    spec: machine("time", "calories"),
    aliases: ["Climbing", "Climbing Gym"],
  },

  // More machines.
  {
    name: "Treadmill Walk",
    muscleGroup: "Cardio",
    spec: machine("time", "distance", "speed", "incline"),
    aliases: ["Treadmill", "Walking"],
  },
];

const BY_NAME = new Map(
  CARDIO_EXERCISES.map((e) => [e.name.toLowerCase(), e]),
);

export const CARDIO_GROUPS = new Set(["Cardio", "Conditioning", "Outdoor", "Sport", "Mind & Body"]);

/// The exercise picker's and the library's dropdowns, in order. `group` is
/// the muscleGroup a custom activity is saved under so it lands back here
/// (lifting customs use a real muscle instead).
export const ACTIVITY_CATEGORIES: {
  key: ActivityCategory;
  label: string;
  blurb: string;
  emoji: string;
  /// "r,g,b" — used at different alphas for the tile, border and chips.
  tint: string;
  group: string | null;
}[] = [
  { key: "lifting", label: "Weightlifting", blurb: "Barbell, dumbbell, machines, bodyweight", emoji: "🏋️", tint: "34,197,94", group: null },
  { key: "machine", label: "Cardio machines", blurb: "Treadmill, spin, rower, stairs", emoji: "🚴", tint: "56,189,248", group: "Cardio" },
  { key: "outdoor", label: "Outdoors", blurb: "Run, hike, ride, swim, ski, paddle", emoji: "🥾", tint: "163,230,53", group: "Outdoor" },
  { key: "conditioning", label: "HIIT & conditioning", blurb: "Intervals, circuits, EMOM, AMRAP", emoji: "🔥", tint: "249,115,22", group: "Conditioning" },
  { key: "sport", label: "Sports & combat", blurb: "Court, field, ice, mat", emoji: "🏀", tint: "250,204,21", group: "Sport" },
  { key: "mind", label: "Mind & body", blurb: "Yoga, pilates, stretching, dance", emoji: "🧘", tint: "192,132,252", group: "Mind & Body" },
];

/// Which picker dropdown an exercise belongs in. A custom exercise filed
/// under Cardio lands with the machines, Conditioning with conditioning,
/// anything else with the lifts.
export function activityCategory(
  name: string,
  muscleGroup?: string | null,
): ActivityCategory {
  const hit = BY_NAME.get(name.trim().toLowerCase());
  if (hit) return hit.category ?? (hit.muscleGroup === "Conditioning" ? "conditioning" : "machine");
  if (muscleGroup === "Cardio") return "machine";
  if (muscleGroup === "Conditioning") return "conditioning";
  if (muscleGroup === "Outdoor") return "outdoor";
  if (muscleGroup === "Sport") return "sport";
  if (muscleGroup === "Mind & Body") return "mind";
  return "lifting";
}

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
  if (muscleGroup === "Outdoor") return machine("time", "distance", "calories");
  if (muscleGroup === "Sport" || muscleGroup === "Mind & Body") return machine("time", "calories");
  return null;
}

/// What a conditioning block hit. Picked from the dropdown on the card.
export const CIRCUIT_FOCUS = [
  "Full Body",
  "Upper Body",
  "Lower Body",
  "Legs",
  "Arms",
  "Core",
  "Cardio",
] as const;

/// The muscles each focus works. "Spread" regions share the block across
/// many muscles, so each gets half — a full-body circuit is not a chest day.
const FOCUS_MUSCLES: Record<string, { muscles: string[]; spread: boolean }> = {
  "Full Body": {
    muscles: ["Quads", "Glutes", "Hamstrings", "Pec Major", "Lats", "Front Delts", "Abs"],
    spread: true,
  },
  "Upper Body": {
    muscles: ["Pec Major", "Lats", "Front Delts", "Biceps", "Triceps"],
    spread: true,
  },
  "Lower Body": { muscles: ["Quads", "Hamstrings", "Glutes", "Calves"], spread: false },
  Legs: { muscles: ["Quads", "Hamstrings", "Glutes", "Calves"], spread: false },
  Arms: { muscles: ["Biceps", "Triceps", "Forearms"], spread: false },
  Core: { muscles: ["Abs", "Obliques"], spread: false },
  Cardio: { muscles: [], spread: false },
};

/// What one logged conditioning block counts for on the body scan, in
/// working sets per (specific) muscle. Roughly a set per minute of actual
/// work, between one and four: Tabata (8 × 20s) is ~3, a 5 × 40s circuit ~3,
/// a 12-minute AMRAP caps at 4. No focus picked → nothing, since there's no
/// telling what it hit.
export function focusCredit(raw: unknown): { muscle: string; sets: number }[] {
  const m = (raw ?? {}) as CardioMetrics;
  const region = m.focus ? FOCUS_MUSCLES[m.focus] : undefined;
  if (!region || region.muscles.length === 0) return [];
  const workSec =
    m.rounds && m.workSec ? m.rounds * m.workSec : (m.durationSec ?? 0);
  const base = Math.min(4, Math.max(1, Math.round(workSec / 60)));
  const sets = region.spread ? base / 2 : base;
  return region.muscles.map((muscle) => ({ muscle, sets }));
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
    elevation: { label: "Climb", unit: "m" },
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
  /// Metres climbed — typed for a hike, worked out from incline on a treadmill.
  elevationM?: number;
  /// Average heart rate, when it came from the watch.
  avgHr?: number;
  rounds?: number;
  workSec?: number;
  restSec?: number;
  movements?: string[];
  /// Conditioning blocks only — one of CIRCUIT_FOCUS.
  focus?: string;
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
  elevation?: string;
  avgHr?: string;
  rounds?: string;
  work?: string;
  rest?: string;
  movements?: string[];
  focus?: string;
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

/// Distance and climb from a treadmill row's speed, time and incline, or null
/// when there isn't enough to work them out. Distance uses the typed value
/// when there is one; climb is distance × incline (the grade, as % rise).
export function treadmillDerived(
  input: CardioInput,
): { distanceKm: number; elevationM: number } | null {
  const sec = parseMinutes(input.time);
  const speed = num(input.speed);
  const incline = num(input.incline);
  const typed = num(input.distance);
  const distanceKm =
    typed ?? (speed && sec ? Math.round((speed * sec) / 36) / 100 : undefined);
  if (!distanceKm || (!speed && !incline)) return null;
  const elevationM = incline ? Math.round(distanceKm * 1000 * (incline / 100)) : 0;
  return { distanceKm, elevationM };
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
    m.elevationM = int(input.elevation);
    m.avgHr = int(input.avgHr);
    // A treadmill knows its own distance and climb: speed × time, and the
    // incline's share of that. Typed numbers always win.
    const t = treadmillDerived(input);
    if (t) {
      if (m.distanceKm === undefined) m.distanceKm = t.distanceKm;
      if (m.elevationM === undefined && t.elevationM > 0) m.elevationM = t.elevationM;
    }
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
  if (spec.kind !== "machine" && input.focus) m.focus = input.focus;
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
    elevation: s(m.elevationM),
    avgHr: s(m.avgHr),
    rounds: s(m.rounds),
    work: s(m.workSec),
    rest: s(m.restSec),
    movements: m.movements ?? [],
    focus: m.focus,
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
  if (m.focus) bits.push(m.focus);
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
  if (m.elevationM) bits.push(`↑${m.elevationM} m`);
  if (m.floors) bits.push(`${m.floors} floors`);
  if (m.level) bits.push(`L${m.level}`);
  if (m.incline) bits.push(`${m.incline}%`);
  if (m.speed) bits.push(`${m.speed} km/h`);
  if (m.calories) bits.push(`${m.calories} cal`);
  if (m.avgHr) bits.push(`${m.avgHr} bpm avg`);
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
    if (m.elevationM) t.elevationM = (t.elevationM ?? 0) + m.elevationM;
    if (m.calories) t.calories = (t.calories ?? 0) + m.calories;
    if (m.rounds) rounds += m.rounds;
  }
  if (rounds) t.rounds = rounds;
  return cardioSummary(t);
}

const RUN = new Set(["outdoor run", "trail run"]);
const HIKE = new Set(["hike", "outdoor walk", "rucking", "snowshoeing"]);
const RIDE = new Set(["outdoor cycling", "mountain biking"]);
const INDOOR_BIKE = new Set(["spin bike", "stationary bike", "recumbent bike", "air bike"]);
const SWIM = new Set(["swimming", "open water swim"]);
const COMBAT = new Set(["brazilian jiu-jitsu", "muay thai", "martial arts", "wrestling", "boxing rounds"]);

/// The workout type (lib/exercises WORKOUT_TYPES) a session of only this
/// activity is filed under, so a lone hike shows as Hiking in the feed.
export function workoutTypeFor(name: string, muscleGroup?: string | null): string {
  const n = name.trim().toLowerCase();
  const cat = activityCategory(name, muscleGroup);
  if (cat === "lifting") return "WEIGHT_TRAINING";
  if (RUN.has(n)) return "RUNNING";
  if (HIKE.has(n)) return "HIKING";
  if (RIDE.has(n)) return "CYCLING";
  if (INDOOR_BIKE.has(n)) return "SPIN";
  if (SWIM.has(n)) return "SWIMMING";
  if (COMBAT.has(n)) return "COMBAT";
  if (n.startsWith("treadmill")) return "TREADMILL";
  if (n === "elliptical") return "ELLIPTICAL";
  if (n === "stair climber") return "STAIR_CLIMBER";
  if (n === "rowing machine") return "ROWING";
  if (cat === "conditioning") return "HIIT";
  if (cat === "mind") return "MOBILITY";
  if (cat === "sport" || cat === "outdoor") return "SPORT";
  return "CARDIO_MACHINE";
}
