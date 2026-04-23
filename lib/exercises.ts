export type DefaultExercise = {
  name: string;
  muscleGroup: string;
  splits: string;
};

export const DEFAULT_EXERCISES: DefaultExercise[] = [
  // Chest
  { name: "Barbell Bench Press", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Incline Barbell Bench Press", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Decline Barbell Bench Press", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Close-Grip Bench Press", muscleGroup: "Chest", splits: "PUSH,UPPER,ARMS" },
  { name: "Dumbbell Bench Press", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Incline Dumbbell Bench Press", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Decline Dumbbell Bench Press", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Dumbbell Fly", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Incline Dumbbell Fly", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Cable Crossover", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Low-to-High Cable Fly", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "High-to-Low Cable Fly", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Pec Deck", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Push-Up", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Weighted Push-Up", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Deficit Push-Up", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Diamond Push-Up", muscleGroup: "Chest", splits: "PUSH,UPPER,ARMS" },
  { name: "Chest Dip", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Landmine Press", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Floor Press", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Smith Machine Bench Press", muscleGroup: "Chest", splits: "PUSH,UPPER" },

  // Back
  { name: "Pull-Up", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Weighted Pull-Up", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Chin-Up", muscleGroup: "Back", splits: "PULL,UPPER,ARMS" },
  { name: "Neutral-Grip Pull-Up", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Lat Pulldown", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Wide-Grip Lat Pulldown", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Neutral-Grip Lat Pulldown", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Close-Grip Lat Pulldown", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Single-Arm Lat Pulldown", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Barbell Row", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Pendlay Row", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Yates Row", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "T-Bar Row", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Seal Row", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Chest-Supported Row", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Single-Arm Dumbbell Row", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Seated Cable Row", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Wide-Grip Cable Row", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Machine Row", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Meadows Row", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Straight-Arm Pulldown", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Face Pull", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Barbell Shrug", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Dumbbell Shrug", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Trap Bar Shrug", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Rack Pull", muscleGroup: "Back", splits: "PULL" },

  // Deadlifts
  { name: "Conventional Deadlift", muscleGroup: "Back", splits: "PULL,LOWER" },
  { name: "Sumo Deadlift", muscleGroup: "Back", splits: "PULL,LOWER" },
  { name: "Trap Bar Deadlift", muscleGroup: "Back", splits: "PULL,LOWER" },
  { name: "Romanian Deadlift (Barbell)", muscleGroup: "Hamstrings", splits: "PULL,LEGS,LOWER" },
  { name: "Romanian Deadlift (Dumbbell)", muscleGroup: "Hamstrings", splits: "PULL,LEGS,LOWER" },
  { name: "Stiff-Leg Deadlift", muscleGroup: "Hamstrings", splits: "PULL,LEGS,LOWER" },
  { name: "Snatch-Grip Deadlift", muscleGroup: "Back", splits: "PULL" },
  { name: "Good Morning", muscleGroup: "Hamstrings", splits: "LEGS,LOWER,PULL" },

  // Shoulders
  { name: "Overhead Press (Barbell)", muscleGroup: "Shoulders", splits: "PUSH,UPPER" },
  { name: "Overhead Press (Dumbbell)", muscleGroup: "Shoulders", splits: "PUSH,UPPER" },
  { name: "Seated Dumbbell Shoulder Press", muscleGroup: "Shoulders", splits: "PUSH,UPPER" },
  { name: "Machine Shoulder Press", muscleGroup: "Shoulders", splits: "PUSH,UPPER" },
  { name: "Push Press", muscleGroup: "Shoulders", splits: "PUSH,UPPER" },
  { name: "Arnold Press", muscleGroup: "Shoulders", splits: "PUSH,UPPER" },
  { name: "Lateral Raise (Dumbbell)", muscleGroup: "Shoulders", splits: "PUSH,UPPER" },
  { name: "Lateral Raise (Cable)", muscleGroup: "Shoulders", splits: "PUSH,UPPER" },
  { name: "Lateral Raise (Machine)", muscleGroup: "Shoulders", splits: "PUSH,UPPER" },
  { name: "Front Raise", muscleGroup: "Shoulders", splits: "PUSH,UPPER" },
  { name: "Rear Delt Fly (Dumbbell)", muscleGroup: "Shoulders", splits: "PULL,UPPER" },
  { name: "Rear Delt Fly (Cable)", muscleGroup: "Shoulders", splits: "PULL,UPPER" },
  { name: "Rear Delt Fly (Machine)", muscleGroup: "Shoulders", splits: "PULL,UPPER" },
  { name: "Upright Row", muscleGroup: "Shoulders", splits: "PULL,UPPER" },
  { name: "Handstand Push-Up", muscleGroup: "Shoulders", splits: "PUSH,UPPER" },

  // Biceps
  { name: "Barbell Curl", muscleGroup: "Biceps", splits: "PULL,UPPER,ARMS" },
  { name: "EZ-Bar Curl", muscleGroup: "Biceps", splits: "PULL,UPPER,ARMS" },
  { name: "Dumbbell Curl", muscleGroup: "Biceps", splits: "PULL,UPPER,ARMS" },
  { name: "Hammer Curl", muscleGroup: "Biceps", splits: "PULL,UPPER,ARMS" },
  { name: "Barbell Preacher Curl", muscleGroup: "Biceps", splits: "PULL,UPPER,ARMS" },
  { name: "Dumbbell Preacher Curl", muscleGroup: "Biceps", splits: "PULL,UPPER,ARMS" },
  { name: "Incline Dumbbell Curl", muscleGroup: "Biceps", splits: "PULL,UPPER,ARMS" },
  { name: "Spider Curl", muscleGroup: "Biceps", splits: "PULL,UPPER,ARMS" },
  { name: "Concentration Curl", muscleGroup: "Biceps", splits: "PULL,UPPER,ARMS" },
  { name: "Cable Curl (Rope)", muscleGroup: "Biceps", splits: "PULL,UPPER,ARMS" },
  { name: "Cable Curl (Bar)", muscleGroup: "Biceps", splits: "PULL,UPPER,ARMS" },
  { name: "Single-Arm Cable Curl", muscleGroup: "Biceps", splits: "PULL,UPPER,ARMS" },
  { name: "Reverse Curl", muscleGroup: "Biceps", splits: "PULL,UPPER,ARMS" },
  { name: "Zottman Curl", muscleGroup: "Biceps", splits: "PULL,UPPER,ARMS" },

  // Triceps
  { name: "Tricep Pushdown (Rope)", muscleGroup: "Triceps", splits: "PUSH,UPPER,ARMS" },
  { name: "Tricep Pushdown (Bar)", muscleGroup: "Triceps", splits: "PUSH,UPPER,ARMS" },
  { name: "Tricep Pushdown (V-Bar)", muscleGroup: "Triceps", splits: "PUSH,UPPER,ARMS" },
  { name: "Reverse-Grip Pushdown", muscleGroup: "Triceps", splits: "PUSH,UPPER,ARMS" },
  { name: "Skullcrusher (Barbell)", muscleGroup: "Triceps", splits: "PUSH,UPPER,ARMS" },
  { name: "Skullcrusher (Dumbbell)", muscleGroup: "Triceps", splits: "PUSH,UPPER,ARMS" },
  { name: "Overhead Tricep Extension (Dumbbell)", muscleGroup: "Triceps", splits: "PUSH,UPPER,ARMS" },
  { name: "Overhead Tricep Extension (Cable)", muscleGroup: "Triceps", splits: "PUSH,UPPER,ARMS" },
  { name: "Overhead Tricep Extension (Rope)", muscleGroup: "Triceps", splits: "PUSH,UPPER,ARMS" },
  { name: "Tricep Dip", muscleGroup: "Triceps", splits: "PUSH,UPPER,ARMS" },
  { name: "Tricep Kickback", muscleGroup: "Triceps", splits: "PUSH,UPPER,ARMS" },

  // Quads
  { name: "Back Squat (High Bar)", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Back Squat (Low Bar)", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Front Squat", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Goblet Squat", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Hack Squat", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Leg Press", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Single-Leg Press", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Leg Extension", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Bulgarian Split Squat", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Walking Lunge", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Reverse Lunge", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Step-Up", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Pistol Squat", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Box Squat", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Zercher Squat", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Sissy Squat", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Smith Machine Squat", muscleGroup: "Quads", splits: "LEGS,LOWER" },

  // Hamstrings
  { name: "Lying Leg Curl", muscleGroup: "Hamstrings", splits: "LEGS,LOWER" },
  { name: "Seated Leg Curl", muscleGroup: "Hamstrings", splits: "LEGS,LOWER" },
  { name: "Standing Leg Curl", muscleGroup: "Hamstrings", splits: "LEGS,LOWER" },
  { name: "Glute-Ham Raise", muscleGroup: "Hamstrings", splits: "LEGS,LOWER" },
  { name: "Nordic Curl", muscleGroup: "Hamstrings", splits: "LEGS,LOWER" },
  { name: "Kettlebell Swing", muscleGroup: "Hamstrings", splits: "PULL,LEGS,LOWER" },

  // Glutes
  { name: "Barbell Hip Thrust", muscleGroup: "Glutes", splits: "LEGS,LOWER" },
  { name: "Machine Hip Thrust", muscleGroup: "Glutes", splits: "LEGS,LOWER" },
  { name: "Single-Leg Hip Thrust", muscleGroup: "Glutes", splits: "LEGS,LOWER" },
  { name: "Smith Machine Hip Thrust", muscleGroup: "Glutes", splits: "LEGS,LOWER" },
  { name: "B-Stance Hip Thrust", muscleGroup: "Glutes", splits: "LEGS,LOWER" },
  { name: "Glute Bridge", muscleGroup: "Glutes", splits: "LEGS,LOWER" },
  { name: "Cable Kickback", muscleGroup: "Glutes", splits: "LEGS,LOWER" },
  { name: "Cable Pull-Through", muscleGroup: "Glutes", splits: "LEGS,LOWER,PULL" },

  // Calves
  { name: "Standing Calf Raise", muscleGroup: "Calves", splits: "LEGS,LOWER" },
  { name: "Seated Calf Raise", muscleGroup: "Calves", splits: "LEGS,LOWER" },
  { name: "Leg Press Calf Raise", muscleGroup: "Calves", splits: "LEGS,LOWER" },
  { name: "Single-Leg Calf Raise", muscleGroup: "Calves", splits: "LEGS,LOWER" },
  { name: "Donkey Calf Raise", muscleGroup: "Calves", splits: "LEGS,LOWER" },
  { name: "Tibialis Raise", muscleGroup: "Calves", splits: "LEGS,LOWER" },

  // Core
  { name: "Plank", muscleGroup: "Core", splits: "CORE" },
  { name: "Side Plank", muscleGroup: "Core", splits: "CORE" },
  { name: "Hanging Leg Raise", muscleGroup: "Core", splits: "CORE" },
  { name: "Hanging Knee Raise", muscleGroup: "Core", splits: "CORE" },
  { name: "Ab Wheel Rollout", muscleGroup: "Core", splits: "CORE" },
  { name: "Cable Crunch", muscleGroup: "Core", splits: "CORE" },
  { name: "Decline Sit-Up", muscleGroup: "Core", splits: "CORE" },
  { name: "Weighted Decline Sit-Up", muscleGroup: "Core", splits: "CORE" },
  { name: "Russian Twist", muscleGroup: "Core", splits: "CORE" },
  { name: "Dead Bug", muscleGroup: "Core", splits: "CORE" },
  { name: "Pallof Press", muscleGroup: "Core", splits: "CORE" },
  { name: "Dragon Flag", muscleGroup: "Core", splits: "CORE" },
  { name: "L-Sit", muscleGroup: "Core", splits: "CORE" },
  { name: "Hollow Hold", muscleGroup: "Core", splits: "CORE" },
  { name: "Landmine Twist", muscleGroup: "Core", splits: "CORE" },
  { name: "Cable Woodchop", muscleGroup: "Core", splits: "CORE" },

  // Forearms / grip
  { name: "Wrist Curl", muscleGroup: "Forearms", splits: "ARMS,UPPER,PULL" },
  { name: "Reverse Wrist Curl", muscleGroup: "Forearms", splits: "ARMS,UPPER,PULL" },
  { name: "Farmer Carry", muscleGroup: "Forearms", splits: "FULL_BODY" },
  { name: "Plate Pinch Hold", muscleGroup: "Forearms", splits: "ARMS" },

  // Smith machine (push)
  { name: "Smith Machine Incline Bench Press", muscleGroup: "Chest", splits: "PUSH" },
  { name: "Smith Machine Decline Bench Press", muscleGroup: "Chest", splits: "PUSH" },
  { name: "Smith Machine Close-Grip Bench Press", muscleGroup: "Triceps", splits: "PUSH" },
  { name: "Smith Machine Overhead Press", muscleGroup: "Shoulders", splits: "PUSH" },
  { name: "Smith Machine Shoulder Press", muscleGroup: "Shoulders", splits: "PUSH" },
  { name: "Smith Machine Upright Row", muscleGroup: "Shoulders", splits: "PULL" },

  // Smith machine (pull / back)
  { name: "Smith Machine Bent-Over Row", muscleGroup: "Back", splits: "PULL" },
  { name: "Smith Machine Inverted Row", muscleGroup: "Back", splits: "PULL" },
  { name: "Smith Machine Shrug", muscleGroup: "Back", splits: "PULL" },

  // Smith machine (legs)
  { name: "Smith Machine Squat", muscleGroup: "Quads", splits: "LEGS" },
  { name: "Smith Machine Front Squat", muscleGroup: "Quads", splits: "LEGS" },
  { name: "Smith Machine Bulgarian Split Squat", muscleGroup: "Quads", splits: "LEGS" },
  { name: "Smith Machine Reverse Lunge", muscleGroup: "Quads", splits: "LEGS" },
  { name: "Smith Machine Romanian Deadlift", muscleGroup: "Hamstrings", splits: "LEGS" },
  { name: "Smith Machine Good Morning", muscleGroup: "Hamstrings", splits: "LEGS" },
  { name: "Smith Machine Hip Thrust", muscleGroup: "Glutes", splits: "LEGS" },
  { name: "Smith Machine Glute Bridge", muscleGroup: "Glutes", splits: "LEGS" },
  { name: "Smith Machine Sumo Squat", muscleGroup: "Glutes", splits: "LEGS" },
  { name: "Smith Machine Calf Raise", muscleGroup: "Calves", splits: "LEGS" },

  // Plate-loaded machines (legs)
  { name: "Leg Press", muscleGroup: "Quads", splits: "LEGS" },
  { name: "Single-Leg Leg Press", muscleGroup: "Quads", splits: "LEGS" },
  { name: "Hack Squat Machine", muscleGroup: "Quads", splits: "LEGS" },
  { name: "Reverse Hack Squat", muscleGroup: "Glutes", splits: "LEGS" },
  { name: "Pendulum Squat", muscleGroup: "Quads", splits: "LEGS" },
  { name: "Belt Squat", muscleGroup: "Quads", splits: "LEGS" },
  { name: "V-Squat Machine", muscleGroup: "Quads", splits: "LEGS" },
  { name: "Hip Thrust Machine", muscleGroup: "Glutes", splits: "LEGS" },
  { name: "Plate-Loaded Glute Kickback", muscleGroup: "Glutes", splits: "LEGS" },
  { name: "Plate-Loaded Abductor", muscleGroup: "Glutes", splits: "LEGS" },
  { name: "Plate-Loaded Adductor", muscleGroup: "Quads", splits: "LEGS" },
  { name: "Plate-Loaded Leg Extension", muscleGroup: "Quads", splits: "LEGS" },
  { name: "Plate-Loaded Lying Leg Curl", muscleGroup: "Hamstrings", splits: "LEGS" },
  { name: "Plate-Loaded Seated Leg Curl", muscleGroup: "Hamstrings", splits: "LEGS" },
  { name: "Plate-Loaded Standing Calf Raise", muscleGroup: "Calves", splits: "LEGS" },
  { name: "Plate-Loaded Seated Calf Raise", muscleGroup: "Calves", splits: "LEGS" },

  // Plate-loaded machines (upper)
  { name: "Plate-Loaded Chest Press", muscleGroup: "Chest", splits: "PUSH" },
  { name: "Plate-Loaded Incline Chest Press", muscleGroup: "Chest", splits: "PUSH" },
  { name: "Plate-Loaded Decline Chest Press", muscleGroup: "Chest", splits: "PUSH" },
  { name: "Plate-Loaded Shoulder Press", muscleGroup: "Shoulders", splits: "PUSH" },
  { name: "Plate-Loaded Iso-Lateral Row", muscleGroup: "Back", splits: "PULL" },
  { name: "Plate-Loaded High Row", muscleGroup: "Back", splits: "PULL" },
  { name: "Plate-Loaded Low Row", muscleGroup: "Back", splits: "PULL" },
  { name: "Plate-Loaded Lat Pulldown", muscleGroup: "Back", splits: "PULL" },
  { name: "Plate-Loaded Pullover", muscleGroup: "Back", splits: "PULL" },
  { name: "Plate-Loaded Preacher Curl", muscleGroup: "Biceps", splits: "PULL" },
  { name: "Plate-Loaded Triceps Extension", muscleGroup: "Triceps", splits: "PUSH" },
  { name: "Plate-Loaded Shrug", muscleGroup: "Back", splits: "PULL" },
];

export type WorkoutShape = "STRENGTH" | "DISTANCE" | "DURATION";

export const WORKOUT_TYPES: {
  value: string;
  label: string;
  shape: WorkoutShape;
}[] = [
  { value: "WEIGHT_TRAINING", label: "Weight training", shape: "STRENGTH" },
  { value: "RUNNING", label: "Running", shape: "DISTANCE" },
  { value: "CYCLING", label: "Cycling", shape: "DISTANCE" },
  { value: "SWIMMING", label: "Swimming", shape: "DISTANCE" },
  { value: "ROWING", label: "Rowing", shape: "DISTANCE" },
  { value: "HIIT", label: "HIIT / Conditioning", shape: "DURATION" },
  { value: "COMBAT", label: "Combat", shape: "DURATION" },
  { value: "MOBILITY", label: "Mobility / Yoga", shape: "DURATION" },
  { value: "SPORT", label: "Sport", shape: "DURATION" },
  { value: "OTHER", label: "Other", shape: "DURATION" },
];

export const STRENGTH_SPLITS = [
  { value: "PUSH", label: "Push" },
  { value: "PULL", label: "Pull" },
  { value: "LEGS", label: "Legs" },
  { value: "FULL_BODY", label: "Full body" },
  { value: "CORE", label: "Core" },
];

// Legacy strength types → always treated as WEIGHT_TRAINING
const LEGACY_STRENGTH_TYPES = [
  "PUSH",
  "PULL",
  "LEGS",
  "UPPER",
  "LOWER",
  "ARMS",
  "CUSTOM",
];

// Machine-style exercises we exclude from projections and top-lift PRs —
// the "compound lift leaderboard" is more meaningful when it's limited to
// free-weight / bodyweight movements. T-Bar Row stays in since athletes
// treat it as a free-ish compound.
const MACHINE_PATTERNS = [
  /\bmachine\b/i,
  /\bsmith\b/i,
  /\bcable\b/i,
  /\bpulldown\b/i,
  /\bpec deck\b/i,
  /\bleg press\b/i,
  /\bleg extension\b/i,
  /\bleg curl\b/i,
  /\bhack squat\b/i,
  /\bassisted\b/i,
  /\bplate-loaded\b/i,
  /\bpendulum squat\b/i,
  /\bbelt squat\b/i,
  /\bv-squat\b/i,
];

export function isMachineExercise(name: string): boolean {
  return MACHINE_PATTERNS.some((re) => re.test(name));
}

// Plate-loaded apparatuses where athletes naturally count plates per side
// rather than total weight on the rack.
const PLATE_LOADED_PATTERNS = [
  /\bsmith\b/i,
  /\bplate-loaded\b/i,
  /\bhack squat\b/i,
  /\bleg press\b/i,
  /\bhip thrust machine\b/i,
  /\bpendulum squat\b/i,
  /\bbelt squat\b/i,
  /\bv-squat\b/i,
  /\bt-bar row\b/i,
];

export const PLATE_WEIGHT_LB = 45;

export function usesPlates(name: string): boolean {
  return PLATE_LOADED_PATTERNS.some((re) => re.test(name));
}

export function shapeForType(type: string): WorkoutShape {
  if (LEGACY_STRENGTH_TYPES.includes(type)) return "STRENGTH";
  return WORKOUT_TYPES.find((t) => t.value === type)?.shape ?? "STRENGTH";
}

export function labelForType(type: string): string {
  if (LEGACY_STRENGTH_TYPES.includes(type)) return "Weight training";
  return WORKOUT_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export const FEELING_OPTIONS = [
  { value: "STRONG", label: "Strong" },
  { value: "NORMAL", label: "Steady" },
  { value: "FATIGUED", label: "Fatigued" },
];

export const REACTION_TYPES = [
  { value: "STRONG_SESSION", label: "Fire", icon: "flame" },
  { value: "PR", label: "PR", icon: "trophy" },
  { value: "GOOD_WORK", label: "Respect", icon: "bolt" },
];
