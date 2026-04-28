export type DefaultExercise = {
  name: string;
  muscleGroup: string;
  splits: string;
};

export const DEFAULT_EXERCISES: DefaultExercise[] = [
  // Chest — barbell
  { name: "Flat Barbell Bench Press", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Incline Barbell Bench Press", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Decline Barbell Bench Press", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Close-Grip Bench Press", muscleGroup: "Chest", splits: "PUSH,UPPER,ARMS" },
  { name: "Reverse-Grip Bench Press", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Pin Bench Press", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Spoto Press", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Larsen Press", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Floor Press", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Paused Bench Press", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Board Press", muscleGroup: "Chest", splits: "PUSH,UPPER" },

  // Chest — dumbbell
  { name: "Flat Dumbbell Bench Press", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Incline Dumbbell Bench Press", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Decline Dumbbell Bench Press", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Neutral-Grip Dumbbell Bench Press", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Flat Dumbbell Fly", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Incline Dumbbell Fly", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Decline Dumbbell Fly", muscleGroup: "Chest", splits: "PUSH,UPPER" },

  // Chest — cable / machine
  { name: "Cable Crossover", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Low-to-High Cable Fly", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Mid Cable Fly", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "High-to-Low Cable Fly", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Single-Arm Cable Fly", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Pec Deck", muscleGroup: "Chest", splits: "PUSH,UPPER" },

  // Chest — bodyweight / landmine
  { name: "Standard Push-Up", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Deficit Push-Up", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Diamond Push-Up", muscleGroup: "Chest", splits: "PUSH,UPPER,ARMS" },
  { name: "Chest Dip", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Landmine Press", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Single-Arm Landmine Press", muscleGroup: "Chest", splits: "PUSH,UPPER" },

  // Chest — Smith machine
  { name: "Smith Machine Flat Bench Press", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Smith Machine Incline Bench Press", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Smith Machine Decline Bench Press", muscleGroup: "Chest", splits: "PUSH,UPPER" },

  // Back
  { name: "Pull-Up", muscleGroup: "Back", splits: "PULL,UPPER" },
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
  { name: "Front Raise (Dumbbell)", muscleGroup: "Shoulders", splits: "PUSH,UPPER" },
  { name: "Front Raise (Plate)", muscleGroup: "Shoulders", splits: "PUSH,UPPER" },
  { name: "Front Raise (Barbell)", muscleGroup: "Shoulders", splits: "PUSH,UPPER" },
  { name: "Behind-the-Neck Press", muscleGroup: "Shoulders", splits: "PUSH,UPPER" },
  { name: "Seated Barbell Overhead Press", muscleGroup: "Shoulders", splits: "PUSH,UPPER" },
  { name: "Standing Dumbbell Shoulder Press", muscleGroup: "Shoulders", splits: "PUSH,UPPER" },
  { name: "Bradford Press", muscleGroup: "Shoulders", splits: "PUSH,UPPER" },
  { name: "Cuban Press", muscleGroup: "Shoulders", splits: "PUSH,UPPER" },
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
  { name: "Paused Back Squat", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Pin Squat", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Tempo Back Squat", muscleGroup: "Quads", splits: "LEGS,LOWER" },
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
  { name: "Glute-Focused Back Extension", muscleGroup: "Glutes", splits: "LEGS,LOWER" },

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

  // Smith machine (push) — Flat/Incline/Decline live in the chest section above.
  { name: "Smith Machine Close-Grip Bench Press", muscleGroup: "Triceps", splits: "PUSH" },
  { name: "Smith Machine Overhead Press", muscleGroup: "Shoulders", splits: "PUSH" },
  { name: "Smith Machine Shoulder Press", muscleGroup: "Shoulders", splits: "PUSH" },
  { name: "Smith Machine Upright Row", muscleGroup: "Shoulders", splits: "PULL" },

  // Smith machine (pull / back)
  { name: "Smith Machine Bent-Over Row", muscleGroup: "Back", splits: "PULL" },
  { name: "Smith Machine Inverted Row", muscleGroup: "Back", splits: "PULL" },
  { name: "Smith Machine Shrug", muscleGroup: "Back", splits: "PULL" },

  // Smith machine (legs) — Smith Machine Squat lives in the Quads section above.
  { name: "Smith Machine Front Squat", muscleGroup: "Quads", splits: "LEGS" },
  { name: "Smith Machine Bulgarian Split Squat", muscleGroup: "Quads", splits: "LEGS" },
  { name: "Smith Machine Reverse Lunge", muscleGroup: "Quads", splits: "LEGS" },
  { name: "Smith Machine Romanian Deadlift", muscleGroup: "Hamstrings", splits: "LEGS" },
  { name: "Smith Machine Good Morning", muscleGroup: "Hamstrings", splits: "LEGS" },
  { name: "Smith Machine Glute Bridge", muscleGroup: "Glutes", splits: "LEGS" },
  { name: "Smith Machine Sumo Squat", muscleGroup: "Glutes", splits: "LEGS" },
  { name: "Smith Machine Calf Raise", muscleGroup: "Calves", splits: "LEGS" },

  // Plate-loaded machines (legs) — Leg Press / Single-Leg Press / Hack Squat / Pendulum Squat
  // live in the Quads section above.
  { name: "Reverse Hack Squat", muscleGroup: "Glutes", splits: "LEGS" },
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

  // Pin-loaded machines (selectorized — stack with a pin)
  { name: "Chest Press Machine (Pin)", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Incline Chest Press Machine (Pin)", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Decline Chest Press Machine (Pin)", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Shoulder Press Machine (Pin)", muscleGroup: "Shoulders", splits: "PUSH,UPPER" },
  { name: "Seated Row Machine (Pin)", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "High Row Machine (Pin)", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Low Row Machine (Pin)", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Converging Chest Press (Pin)", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Pec Deck Rear Delt", muscleGroup: "Shoulders", splits: "PULL,UPPER" },
  { name: "Preacher Curl Machine (Pin)", muscleGroup: "Biceps", splits: "PULL,UPPER,ARMS" },
  { name: "Bicep Curl Machine (Pin)", muscleGroup: "Biceps", splits: "PULL,UPPER,ARMS" },
  { name: "Tricep Extension Machine (Pin)", muscleGroup: "Triceps", splits: "PUSH,UPPER,ARMS" },
  { name: "Dip Machine (Pin)", muscleGroup: "Triceps", splits: "PUSH,UPPER,ARMS" },
  { name: "Assisted Pull-Up Machine", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Assisted Dip Machine", muscleGroup: "Triceps", splits: "PUSH,UPPER,ARMS" },
  { name: "Leg Extension Machine (Pin)", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Seated Leg Curl Machine (Pin)", muscleGroup: "Hamstrings", splits: "LEGS,LOWER" },
  { name: "Lying Leg Curl Machine (Pin)", muscleGroup: "Hamstrings", splits: "LEGS,LOWER" },
  { name: "Standing Leg Curl Machine (Pin)", muscleGroup: "Hamstrings", splits: "LEGS,LOWER" },
  { name: "Abductor Machine (Pin)", muscleGroup: "Glutes", splits: "LEGS,LOWER" },
  { name: "Adductor Machine (Pin)", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Glute Kickback Machine (Pin)", muscleGroup: "Glutes", splits: "LEGS,LOWER" },
  { name: "Hip Abduction Machine (Pin)", muscleGroup: "Glutes", splits: "LEGS,LOWER" },
  { name: "Seated Calf Raise Machine (Pin)", muscleGroup: "Calves", splits: "LEGS,LOWER" },
  { name: "Standing Calf Raise Machine (Pin)", muscleGroup: "Calves", splits: "LEGS,LOWER" },
  { name: "Back Extension Machine (Pin)", muscleGroup: "Back", splits: "PULL,LOWER" },
  { name: "Abdominal Crunch Machine (Pin)", muscleGroup: "Core", splits: "CORE" },
  { name: "Rotary Torso Machine (Pin)", muscleGroup: "Core", splits: "CORE" },
  { name: "Glute Drive Machine", muscleGroup: "Glutes", splits: "LEGS,LOWER" },
  { name: "Chest-Supported Row Machine (Pin)", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Nautilus Pullover Machine", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Smith Machine Incline Row", muscleGroup: "Back", splits: "PULL,UPPER" },

  // Hammer Strength iso-lateral (plate-loaded, named variants)
  { name: "Hammer Strength Iso-Lateral Chest Press", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Hammer Strength Iso-Lateral Incline Press", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Hammer Strength Iso-Lateral Decline Press", muscleGroup: "Chest", splits: "PUSH,UPPER" },
  { name: "Hammer Strength Iso-Lateral Shoulder Press", muscleGroup: "Shoulders", splits: "PUSH,UPPER" },
  { name: "Hammer Strength Iso-Lateral Row", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Hammer Strength Iso-Lateral High Row", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Hammer Strength Iso-Lateral Low Row", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Hammer Strength Iso-Lateral D.Y. Row", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Hammer Strength Iso-Lateral Pulldown", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Hammer Strength Iso-Lateral Front Pulldown", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Hammer Strength Iso-Lateral Leg Press", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Hammer Strength Iso-Lateral Kneeling Leg Curl", muscleGroup: "Hamstrings", splits: "LEGS,LOWER" },
  { name: "Hammer Strength Iso-Lateral Seated Leg Curl", muscleGroup: "Hamstrings", splits: "LEGS,LOWER" },

  // Accessory / grip variants
  { name: "Reverse-Grip Lat Pulldown", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Reverse-Grip Bent-Over Row", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Chest-Supported Dumbbell Row", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Chest-Supported T-Bar Row", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Kroc Row", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Dumbbell Pullover", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Cable Y-Raise", muscleGroup: "Shoulders", splits: "PULL,UPPER" },
  { name: "Cable Front Raise", muscleGroup: "Shoulders", splits: "PUSH,UPPER" },
  { name: "Cable Upright Row", muscleGroup: "Shoulders", splits: "PULL,UPPER" },
  { name: "Z Press", muscleGroup: "Shoulders", splits: "PUSH,UPPER" },
  { name: "Half-Kneeling Single-Arm Press", muscleGroup: "Shoulders", splits: "PUSH,UPPER" },
  { name: "Drag Curl", muscleGroup: "Biceps", splits: "PULL,UPPER,ARMS" },
  { name: "Bayesian Cable Curl", muscleGroup: "Biceps", splits: "PULL,UPPER,ARMS" },
  { name: "French Press", muscleGroup: "Triceps", splits: "PUSH,UPPER,ARMS" },
  { name: "Overhead Rope Tricep Extension", muscleGroup: "Triceps", splits: "PUSH,UPPER,ARMS" },

  // Lower body additions
  { name: "Reverse Nordic Curl", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Copenhagen Plank", muscleGroup: "Core", splits: "CORE,LEGS" },
  { name: "Copenhagen Adduction", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Cossack Squat", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Curtsy Lunge", muscleGroup: "Glutes", splits: "LEGS,LOWER" },
  { name: "Walking Lunge (Dumbbell)", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Reverse Lunge (Barbell)", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Reverse Lunge (Dumbbell)", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Step-Up (Dumbbell)", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Bulgarian Split Squat (Dumbbell)", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Safety Squat Bar Squat", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Front Squat (Dumbbell)", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Deficit Deadlift", muscleGroup: "Hamstrings", splits: "PULL,LOWER" },
  { name: "Block Pull Deadlift", muscleGroup: "Back", splits: "PULL,LOWER" },
  { name: "Pause Deadlift", muscleGroup: "Back", splits: "PULL,LOWER" },
  { name: "Single-Leg Romanian Deadlift", muscleGroup: "Hamstrings", splits: "PULL,LOWER" },
  { name: "B-Stance Romanian Deadlift", muscleGroup: "Hamstrings", splits: "PULL,LOWER" },
  { name: "Deficit Romanian Deadlift", muscleGroup: "Hamstrings", splits: "PULL,LOWER" },
  { name: "Reverse Hyper", muscleGroup: "Glutes", splits: "LEGS,LOWER,PULL" },
  { name: "45-Degree Hyperextension", muscleGroup: "Lower Back", splits: "PULL,LOWER" },

  // Landmine family
  { name: "Landmine Row", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Landmine Meadows Row", muscleGroup: "Back", splits: "PULL,UPPER" },
  { name: "Landmine Squat", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Landmine RDL", muscleGroup: "Hamstrings", splits: "PULL,LOWER" },
  { name: "Landmine Rotation", muscleGroup: "Core", splits: "CORE" },

  // Kettlebell family
  { name: "Kettlebell Clean", muscleGroup: "Back", splits: "PULL,FULL_BODY" },
  { name: "Kettlebell Snatch", muscleGroup: "Shoulders", splits: "PULL,FULL_BODY" },
  { name: "Kettlebell Shoulder Press", muscleGroup: "Shoulders", splits: "PUSH,UPPER" },
  { name: "Turkish Get-Up", muscleGroup: "Core", splits: "FULL_BODY" },

  // Carries + conditioning
  { name: "Suitcase Carry", muscleGroup: "Core", splits: "CORE" },
  { name: "Overhead Carry", muscleGroup: "Shoulders", splits: "PUSH,CORE" },
  { name: "Yoke Carry", muscleGroup: "Back", splits: "FULL_BODY" },
  { name: "Sled Push", muscleGroup: "Quads", splits: "LEGS,FULL_BODY" },
  { name: "Sled Pull", muscleGroup: "Back", splits: "PULL,FULL_BODY" },
  { name: "Prowler Push", muscleGroup: "Quads", splits: "LEGS,FULL_BODY" },
  { name: "Sandbag Squat", muscleGroup: "Quads", splits: "LEGS,LOWER" },
  { name: "Sandbag Carry", muscleGroup: "Core", splits: "FULL_BODY" },

  // Core
  { name: "GHD Sit-Up", muscleGroup: "Core", splits: "CORE" },
  { name: "Jefferson Curl", muscleGroup: "Hamstrings", splits: "PULL,LOWER" },
  { name: "Ab Crunch Machine", muscleGroup: "Core", splits: "CORE" },
  { name: "Hanging Windshield Wiper", muscleGroup: "Core", splits: "CORE" },

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

  // Calisthenics — push
  { name: "Kneeling Push-Up", muscleGroup: "Chest", splits: "PUSH" },
  { name: "Incline Push-Up", muscleGroup: "Chest", splits: "PUSH" },
  { name: "Decline Push-Up", muscleGroup: "Chest", splits: "PUSH" },
  { name: "Wide Push-Up", muscleGroup: "Chest", splits: "PUSH" },
  { name: "Archer Push-Up", muscleGroup: "Chest", splits: "PUSH" },
  { name: "Typewriter Push-Up", muscleGroup: "Chest", splits: "PUSH" },
  { name: "Pseudo-Planche Push-Up", muscleGroup: "Shoulders", splits: "PUSH" },
  { name: "Planche Push-Up", muscleGroup: "Shoulders", splits: "PUSH" },
  { name: "One-Arm Push-Up", muscleGroup: "Chest", splits: "PUSH" },
  { name: "Clapping Push-Up", muscleGroup: "Chest", splits: "PUSH" },
  { name: "Ring Push-Up", muscleGroup: "Chest", splits: "PUSH" },
  { name: "Ring Dip", muscleGroup: "Chest", splits: "PUSH" },
  { name: "Bench Dip", muscleGroup: "Triceps", splits: "PUSH" },
  { name: "Pike Push-Up", muscleGroup: "Shoulders", splits: "PUSH" },
  { name: "Deficit Pike Push-Up", muscleGroup: "Shoulders", splits: "PUSH" },
  { name: "Wall Handstand Push-Up", muscleGroup: "Shoulders", splits: "PUSH" },
  { name: "Freestanding Handstand Push-Up", muscleGroup: "Shoulders", splits: "PUSH" },
  { name: "Handstand Hold (sec)", muscleGroup: "Shoulders", splits: "PUSH" },
  { name: "Wall Walk", muscleGroup: "Shoulders", splits: "PUSH" },

  // Calisthenics — pull
  { name: "Inverted Row", muscleGroup: "Back", splits: "PULL" },
  { name: "Ring Row", muscleGroup: "Back", splits: "PULL" },
  { name: "Archer Row", muscleGroup: "Back", splits: "PULL" },
  { name: "Feet-Elevated Inverted Row", muscleGroup: "Back", splits: "PULL" },
  { name: "Australian Pull-Up", muscleGroup: "Back", splits: "PULL" },
  { name: "Scapular Pull-Up", muscleGroup: "Back", splits: "PULL" },
  { name: "Negative Pull-Up", muscleGroup: "Back", splits: "PULL" },
  { name: "Band-Assisted Pull-Up", muscleGroup: "Back", splits: "PULL" },
  { name: "Wide-Grip Pull-Up", muscleGroup: "Back", splits: "PULL" },
  { name: "Archer Pull-Up", muscleGroup: "Back", splits: "PULL" },
  { name: "Typewriter Pull-Up", muscleGroup: "Back", splits: "PULL" },
  { name: "L-Sit Pull-Up", muscleGroup: "Back", splits: "PULL" },
  { name: "Muscle-Up", muscleGroup: "Back", splits: "PULL" },
  { name: "Ring Muscle-Up", muscleGroup: "Back", splits: "PULL" },
  { name: "Strict Muscle-Up", muscleGroup: "Back", splits: "PULL" },
  { name: "One-Arm Pull-Up Negative", muscleGroup: "Back", splits: "PULL" },
  { name: "One-Arm Pull-Up", muscleGroup: "Back", splits: "PULL" },
  { name: "Front Lever Raise", muscleGroup: "Back", splits: "PULL" },
  { name: "Front Lever Hold (sec)", muscleGroup: "Back", splits: "PULL" },
  { name: "Tuck Front Lever Hold (sec)", muscleGroup: "Back", splits: "PULL" },
  { name: "Back Lever Hold (sec)", muscleGroup: "Back", splits: "PULL" },
  { name: "Skin the Cat", muscleGroup: "Back", splits: "PULL" },

  // Calisthenics — legs
  { name: "Bodyweight Squat", muscleGroup: "Quads", splits: "LEGS" },
  { name: "Jump Squat", muscleGroup: "Quads", splits: "LEGS" },
  { name: "Split Squat (Bodyweight)", muscleGroup: "Quads", splits: "LEGS" },
  { name: "Bulgarian Split Squat (Bodyweight)", muscleGroup: "Quads", splits: "LEGS" },
  { name: "Shrimp Squat", muscleGroup: "Quads", splits: "LEGS" },
  { name: "Skater Squat", muscleGroup: "Quads", splits: "LEGS" },
  { name: "Nordic Curl Negative", muscleGroup: "Hamstrings", splits: "LEGS" },
  { name: "Single-Leg Glute Bridge", muscleGroup: "Glutes", splits: "LEGS" },
  { name: "Step-Up (Bodyweight)", muscleGroup: "Quads", splits: "LEGS" },
  { name: "Walking Lunge (Bodyweight)", muscleGroup: "Quads", splits: "LEGS" },
  { name: "Broad Jump", muscleGroup: "Quads", splits: "LEGS" },
  { name: "Box Jump", muscleGroup: "Quads", splits: "LEGS" },
  { name: "Calf Raise (Bodyweight)", muscleGroup: "Calves", splits: "LEGS" },
  { name: "Single-Leg Calf Raise (Bodyweight)", muscleGroup: "Calves", splits: "LEGS" },

  // Calisthenics — core & skills
  { name: "L-Sit Hold (sec)", muscleGroup: "Core", splits: "CORE" },
  { name: "Tuck L-Sit Hold (sec)", muscleGroup: "Core", splits: "CORE" },
  { name: "V-Sit Hold (sec)", muscleGroup: "Core", splits: "CORE" },
  { name: "Hollow Body Hold (sec)", muscleGroup: "Core", splits: "CORE" },
  { name: "Arch Hold (sec)", muscleGroup: "Core", splits: "CORE" },
  { name: "Dragon Flag Negative", muscleGroup: "Core", splits: "CORE" },
  { name: "Toes-to-Bar", muscleGroup: "Core", splits: "CORE" },
  { name: "Windshield Wiper", muscleGroup: "Core", splits: "CORE" },
  { name: "Human Flag Hold (sec)", muscleGroup: "Core", splits: "FULL_BODY" },
  { name: "Planche Hold (sec)", muscleGroup: "Shoulders", splits: "PUSH" },
  { name: "Tuck Planche Hold (sec)", muscleGroup: "Shoulders", splits: "PUSH" },

  // Calisthenics — full body / hybrid conditioning
  { name: "Burpee", muscleGroup: "Other", splits: "FULL_BODY" },
  { name: "Burpee Pull-Up", muscleGroup: "Other", splits: "FULL_BODY" },
  { name: "Bear Crawl", muscleGroup: "Other", splits: "FULL_BODY" },
  { name: "Crab Walk", muscleGroup: "Other", splits: "FULL_BODY" },
  { name: "Mountain Climber", muscleGroup: "Core", splits: "FULL_BODY" },
  { name: "Sprint (sec)", muscleGroup: "Other", splits: "FULL_BODY" },
];

export type WorkoutShape = "STRENGTH" | "DISTANCE" | "DURATION";

export const WORKOUT_TYPES: {
  value: string;
  label: string;
  shape: WorkoutShape;
}[] = [
  { value: "WEIGHT_TRAINING", label: "Weight training", shape: "STRENGTH" },
  { value: "CALISTHENICS", label: "Calisthenics", shape: "STRENGTH" },
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

// Movements that default to bodyweight but can optionally be loaded with a
// dip belt, vest, etc. For these, the "weight" field represents ADDED load
// on top of bodyweight — leaving it blank means a clean bodyweight set.
const BODYWEIGHT_CAPABLE_PATTERNS = [
  /\bpull-up\b/i,
  /\bchin-up\b/i,
  /\bpush-up\b/i,
  /\bdip\b/i,
  /\bmuscle-up\b/i,
  /\bpistol squat\b/i,
  /\bshrimp squat\b/i,
  /\bskater squat\b/i,
  /\bnordic curl\b/i,
  /\bhandstand\b/i,
  /\bplanche\b/i,
  /\blever\b/i,
  /\bl-sit\b/i,
  /\bv-sit\b/i,
  /\bhollow\b/i,
  /\barch hold\b/i,
  /\bhuman flag\b/i,
  /\bdragon flag\b/i,
  /\bskin the cat\b/i,
  /\bscapular\b/i,
  /\baustralian pull-up\b/i,
  /\binverted row\b/i,
  /\bring row\b/i,
  /\bring dip\b/i,
  /\bring push\b/i,
  /\bring muscle\b/i,
  /\bwall walk\b/i,
  /\btoes-to-bar\b/i,
  /\bwindshield wiper\b/i,
  /\bburpee\b/i,
  /\bbear crawl\b/i,
  /\bcrab walk\b/i,
  /\bmountain climber\b/i,
  /\bbox jump\b/i,
  /\bbroad jump\b/i,
  /\bjump squat\b/i,
  /\bbodyweight\b/i,
  /\bsingle-leg glute bridge\b/i,
  /\bsingle-leg hip thrust\b/i,
  /\bsingle-leg calf raise \(bodyweight\)\b/i,
  /\bcalf raise \(bodyweight\)\b/i,
  /\bplank\b/i,
  /\bside plank\b/i,
  /\bhanging leg raise\b/i,
  /\bhanging knee raise\b/i,
  /\bab wheel\b/i,
  /\bdead bug\b/i,
  /\bback extension\b/i,
  /\bhyperextension\b/i,
  /\breverse hyper\b/i,
  /\bghd\b/i,
  /\bghd sit-up\b/i,
];

export function isBodyweightCapable(name: string): boolean {
  // Pin-loaded / plate-loaded machine variants of the same movement
  // (e.g. "Back Extension Machine (Pin)") take direct weight entry,
  // not "+lb on top of bodyweight."
  if (usesPlates(name)) return false;
  if (/\bmachine\b|\(pin\)/i.test(name)) return false;
  return BODYWEIGHT_CAPABLE_PATTERNS.some((re) => re.test(name));
}

// Specific muscle inference from exercise name. Order matters — more
// specific patterns must come before broader ones (e.g. rear delt before
// "fly", shrug before "shoulder").
export function specificMuscleFor(name: string): string {
  const n = name.toLowerCase();

  // --- Shoulders (granular) — check first so we catch moves often
  // bucketed under Back or Chest in the old taxonomy.
  if (/\brear[- ]?delt\b|\bface pull\b|\breverse fly\b/.test(n))
    return "Rear Delts";
  if (/\blateral raise\b|\bside raise\b|\blaterals?\b|\bupright row\b/.test(n))
    return "Side Delts";
  if (/\bfront raise\b/.test(n)) return "Front Delts";
  if (
    /\bshoulder press\b|\boverhead press\b|\bohp\b|\barnold press\b|\bmilitary press\b|\bpush press\b|\bhandstand push\b|\bpike push\b|\bz press\b|\blandmine press\b/.test(
      n
    )
  )
    return "Front Delts";

  // --- Chest
  if (/\bserratus\b/.test(n)) return "Serratus";
  if (
    /\bbench press\b|\bchest press\b|\bpush-up\b|\bpushup\b|\bfly\b|\bcrossover\b|\bpec deck\b|\bfloor press\b|\bsvend press\b|\bdip\b|\bcable press\b/.test(
      n
    )
  )
    return "Pec Major";

  // --- Back
  if (/\bshrug\b/.test(n)) return "Traps";
  if (/\brhomboid\b/.test(n)) return "Rhomboids";
  if (/\bteres\b/.test(n)) return "Teres";
  // Glute-focused back extensions land on Glutes, not Lower Back.
  if (/\bglute[- ]?focus\b/.test(n)) return "Glutes";
  if (
    /\bback extension\b|\bhyperextension\b|\bgood morning\b|\breverse hyper\b/.test(
      n
    )
  )
    return "Lower Back";
  if (
    /\bpull-?up\b|\bchin-?up\b|\bpulldown\b|\brow\b|\bpullover\b|\bmuscle-?up\b|\blever\b|\bskin the cat\b|\bscapular\b|\bstraight-arm\b/.test(
      n
    )
  )
    return "Lats";

  // --- Arms
  if (
    /\btricep\b|\bskullcrusher\b|\bjm press\b|\bclose-?grip\b|\bpushdown\b|\bdiamond push\b|\btate press\b|\boverhead extension\b|\boverhead (rope )?tricep\b|\bfrench press\b|\bkickback \(tricep\)\b/.test(
      n
    )
  )
    return "Triceps";
  if (/\bhammer curl\b|\breverse curl\b|\bzottman\b/.test(n))
    return "Brachialis";
  if (/\bcurl\b/.test(n)) return "Biceps";
  if (/\bwrist\b|\bfarmer carry\b|\bplate pinch\b/.test(n)) return "Forearms";

  // --- Core
  if (
    /\boblique\b|\bside plank\b|\bwoodchop\b|\bpallof\b|\blandmine twist\b|\brussian twist\b|\brotary torso\b|\brotation\b|\bwindshield\b/.test(
      n
    )
  )
    return "Obliques";
  if (
    /\bplank\b|\bhollow\b|\bcrunch\b|\bsit-?up\b|\bleg raise\b|\bknee raise\b|\bab wheel\b|\bdead bug\b|\bv-up\b|\bv-sit\b|\btoes-to-bar\b|\bl-sit\b|\bdragon flag\b|\bmountain climber\b|\barch hold\b/.test(
      n
    )
  )
    return "Abs";

  // --- Legs (order: calves/tib → adductor/abductor → glutes → hams → quads)
  if (/\btibialis\b/.test(n)) return "Tibialis";
  if (/\bcalf\b|\bcalves\b/.test(n)) return "Calves";
  if (/\badductor\b|\badduction\b|\bcopenhagen\b/.test(n)) return "Adductors";
  if (/\babductor\b|\babduction\b/.test(n)) return "Abductors";
  if (
    /\bhip thrust\b|\bglute bridge\b|\bkickback\b|\bhip extension\b|\bpull-through\b|\bsumo deadlift\b|\bglute\b|\bb-stance hip\b/.test(
      n
    )
  )
    return "Glutes";
  if (/\breverse nordic\b/.test(n)) return "Quads";
  if (
    /\brdl\b|\bromanian deadlift\b|\bstiff-?leg deadlift\b|\bleg curl\b|\bnordic\b|\bghr\b|\bglute[- ]?ham\b|\bjefferson curl\b/.test(
      n
    )
  )
    return "Hamstrings";
  if (/\bdeadlift\b/.test(n)) return "Hamstrings"; // conventional/trap-bar primary
  if (
    /\bsquat\b|\blunge\b|\bstep-?up\b|\bleg press\b|\bhack squat\b|\bpendulum\b|\bbelt squat\b|\bv-squat\b|\bbulgarian\b|\bsissy\b|\bleg extension\b/.test(
      n
    )
  )
    return "Quads";

  return "Other";
}

// Map specific muscle → one of the 6 broad categories used by the
// Muscle Coverage activity ring and weak-spot check.
const BROAD_OF_SPECIFIC: Record<string, string> = {
  "Pec Major": "Chest",
  "Pec Minor": "Chest",
  Serratus: "Chest",
  Lats: "Back",
  Traps: "Back",
  Rhomboids: "Back",
  "Lower Back": "Back",
  Teres: "Back",
  "Front Delts": "Shoulders",
  "Side Delts": "Shoulders",
  "Rear Delts": "Shoulders",
  Biceps: "Arms",
  Brachialis: "Arms",
  Triceps: "Arms",
  Forearms: "Arms",
  Quads: "Legs",
  Hamstrings: "Legs",
  Glutes: "Legs",
  Adductors: "Legs",
  Abductors: "Legs",
  Calves: "Legs",
  Tibialis: "Legs",
  Abs: "Core",
  Obliques: "Core",
};

export function broadGroupForSpecific(
  specific: string | null | undefined
): string | null {
  if (!specific) return null;
  return BROAD_OF_SPECIFIC[specific] ?? null;
}

// Isometric / timed movements. The "reps" field stores SECONDS for these.
const TIMED_PATTERNS = [
  /\(sec\)/i,
  /\bplank\b/i,
  /\bside plank\b/i,
  /\bhollow hold\b/i,
  /\bhollow body hold\b/i,
  /\barch hold\b/i,
  /\bwall sit\b/i,
  /\bdead hang\b/i,
  /\bflexed-arm hang\b/i,
  /\bl-sit hold\b/i,
  /\bv-sit hold\b/i,
  /\btuck l-sit\b/i,
  /\bfront lever hold\b/i,
  /\btuck front lever\b/i,
  /\bback lever hold\b/i,
  /\bhandstand hold\b/i,
  /\bplanche hold\b/i,
  /\btuck planche\b/i,
  /\bhuman flag hold\b/i,
  /\bfarmer carry\b/i,
  /\bplate pinch\b/i,
  /\bsprint \(sec\)\b/i,
];

export function isTimedExercise(name: string): boolean {
  return TIMED_PATTERNS.some((re) => re.test(name));
}

// Pin-loaded (selectorized) machines — stack with a pin, weight is entered
// directly (not plates per side). Used for UI hints and analytics filtering.
const PIN_LOADED_PATTERNS = [
  /\(pin\)/i,
  /\bcable\b/i,
  /\bpulldown\b/i,
  /\bpec deck\b/i,
  /\bpushdown\b/i,
  /\bassisted (pull-up|dip)\b/i,
  /\bface pull\b/i,
];

export function isPinLoaded(name: string): boolean {
  if (usesPlates(name)) return false; // Smith / plate-loaded take priority
  return PIN_LOADED_PATTERNS.some((re) => re.test(name));
}

export function shapeForType(type: string): WorkoutShape {
  if (LEGACY_STRENGTH_TYPES.includes(type)) return "STRENGTH";
  return WORKOUT_TYPES.find((t) => t.value === type)?.shape ?? "STRENGTH";
}

export function labelForType(type: string): string {
  if (LEGACY_STRENGTH_TYPES.includes(type)) return "Weight training";
  return WORKOUT_TYPES.find((t) => t.value === type)?.label ?? type;
}

// Infer the most likely strength split from the exercises the user added.
// Uses muscleGroup as the primary signal (so curls bucket as Arms, not Pull)
// and consults the splits tags to disambiguate Lower vs. Full body.
const MUSCLE_BUCKET: Record<string, string> = {
  Chest: "PUSH",
  Shoulders: "PUSH",
  Back: "PULL",
  "Lower Back": "PULL",
  Biceps: "ARMS",
  Triceps: "ARMS",
  Forearms: "ARMS",
  Quads: "LEGS",
  Hamstrings: "LEGS",
  Glutes: "LEGS",
  Calves: "LEGS",
  Core: "CORE",
};

export function detectSplit(exerciseNames: string[]): string | null {
  const tally: Record<string, number> = {};
  let posteriorChainCount = 0; // pulls that are also Lower (deadlifts)
  let lowerTaggedCount = 0;
  let nonCoreCount = 0;

  for (const name of exerciseNames) {
    const ex = DEFAULT_EXERCISES.find((e) => e.name === name);
    if (!ex) continue;
    const bucket = MUSCLE_BUCKET[ex.muscleGroup];
    if (!bucket) continue;
    tally[bucket] = (tally[bucket] ?? 0) + 1;
    if (bucket !== "CORE") nonCoreCount++;
    const tags = ex.splits.split(",");
    if (tags.includes("LOWER")) lowerTaggedCount++;
    if (bucket === "PULL" && tags.includes("LOWER")) posteriorChainCount++;
  }
  if (Object.keys(tally).length === 0) return null;

  const push = tally.PUSH ?? 0;
  const pull = tally.PULL ?? 0;
  const legs = tally.LEGS ?? 0;
  const arms = tally.ARMS ?? 0;
  const core = tally.CORE ?? 0;
  const pplCount = [push, pull, legs].filter((v) => v > 0).length;

  // Lower day: LEGS plus only posterior-chain pulls (e.g. deadlifts), no
  // upper-body presses or rows.
  if (legs > 0 && push === 0 && arms === 0) {
    if (pull === 0) return "LEGS";
    if (pull === posteriorChainCount && lowerTaggedCount === nonCoreCount) {
      return "LOWER";
    }
  }

  // Anything spanning legs + upper body is full-body.
  if (pplCount === 3) return "FULL_BODY";
  if (legs > 0 && (push > 0 || pull > 0 || arms > 0)) return "FULL_BODY";

  // Upper-body-only days: classify as Arms when arm work dominates, else
  // Push / Pull / Upper based on which compound buckets are present.
  if (push > 0 && pull > 0) {
    return arms > push + pull ? "ARMS" : "UPPER";
  }
  if (push > 0) return arms > push ? "ARMS" : "PUSH";
  if (pull > 0) return arms > pull ? "ARMS" : "PULL";
  if (arms > 0) return "ARMS";
  if (core > 0) return "CORE";
  return null;
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
  { value: "STRONG_SESSION", label: "Fire", icon: "flame", color: "#f97316" },
  { value: "PR", label: "PR", icon: "trophy", color: "#eab308" },
  { value: "GOOD_WORK", label: "Like", icon: "thumbsup", color: "#22c55e" },
];
