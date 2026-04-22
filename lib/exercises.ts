export const DEFAULT_EXERCISES = [
  { name: "Barbell Back Squat", muscleGroup: "Legs" },
  { name: "Barbell Front Squat", muscleGroup: "Legs" },
  { name: "Romanian Deadlift", muscleGroup: "Legs" },
  { name: "Leg Press", muscleGroup: "Legs" },
  { name: "Leg Curl", muscleGroup: "Legs" },
  { name: "Leg Extension", muscleGroup: "Legs" },
  { name: "Walking Lunges", muscleGroup: "Legs" },
  { name: "Hip Thrust", muscleGroup: "Legs" },
  { name: "Calf Raise", muscleGroup: "Legs" },
  { name: "Conventional Deadlift", muscleGroup: "Pull" },
  { name: "Sumo Deadlift", muscleGroup: "Pull" },
  { name: "Barbell Row", muscleGroup: "Pull" },
  { name: "Pendlay Row", muscleGroup: "Pull" },
  { name: "Dumbbell Row", muscleGroup: "Pull" },
  { name: "Cable Row", muscleGroup: "Pull" },
  { name: "Lat Pulldown", muscleGroup: "Pull" },
  { name: "Pull Up", muscleGroup: "Pull" },
  { name: "Chin Up", muscleGroup: "Pull" },
  { name: "Face Pull", muscleGroup: "Pull" },
  { name: "Barbell Curl", muscleGroup: "Arms" },
  { name: "Dumbbell Curl", muscleGroup: "Arms" },
  { name: "Hammer Curl", muscleGroup: "Arms" },
  { name: "Incline Dumbbell Curl", muscleGroup: "Arms" },
  { name: "Barbell Bench Press", muscleGroup: "Push" },
  { name: "Incline Barbell Bench Press", muscleGroup: "Push" },
  { name: "Dumbbell Bench Press", muscleGroup: "Push" },
  { name: "Incline Dumbbell Bench Press", muscleGroup: "Push" },
  { name: "Cable Fly", muscleGroup: "Push" },
  { name: "Overhead Press", muscleGroup: "Push" },
  { name: "Dumbbell Shoulder Press", muscleGroup: "Push" },
  { name: "Lateral Raise", muscleGroup: "Push" },
  { name: "Tricep Pushdown", muscleGroup: "Arms" },
  { name: "Skull Crusher", muscleGroup: "Arms" },
  { name: "Close Grip Bench Press", muscleGroup: "Arms" },
  { name: "Overhead Tricep Extension", muscleGroup: "Arms" },
  { name: "Dip", muscleGroup: "Push" },
  { name: "Push Up", muscleGroup: "Push" },
  { name: "Plank", muscleGroup: "Core" },
  { name: "Ab Wheel Rollout", muscleGroup: "Core" },
  { name: "Cable Crunch", muscleGroup: "Core" },
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
  { value: "UPPER", label: "Upper" },
  { value: "LOWER", label: "Lower" },
  { value: "ARMS", label: "Arms" },
  { value: "FULL_BODY", label: "Full body" },
  { value: "CUSTOM", label: "Custom" },
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
