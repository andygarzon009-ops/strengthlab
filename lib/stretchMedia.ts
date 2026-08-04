// Real demonstration clips for the live stretch player.
//
// These are matched on the DRILL NAME, deliberately not on the pose slug from
// lib/stretchPoses.ts. That distinction is the whole design:
//
//   A pose is a loose bucket. resolvePose() sends anything containing
//   "hamstring" to `hamstring-hinge`, which is exactly right for a stick
//   figure — the drawn hinge is close enough to any hamstring stretch to be
//   useful, and it's obviously a diagram, so nobody copies it literally.
//
//   A clip is a specific human in a specific position. Routing clips through
//   the pose bucket meant "Supine Hamstring Stretch with Strap" played a
//   STANDING forward fold, and "Half-Kneeling Adductor Stretch" played a
//   quadruped rocking frog. Same muscle, wrong body position — and people
//   copy what they see, so that's worse than showing no clip at all.
//
// So a clip plays only when the drill name states BOTH what's being stretched
// (`subject`) and, where the clip is position-specific, the position itself
// (`position`) — with `not` to reject names that contradict it. Anything that
// doesn't clear that bar falls back to its drawn figure. This is tuned for
// precision, not coverage: a routine full of drawn figures is fine, one clip
// showing the wrong position is not.
//
// Sources: ExerciseGymGifsDB (github.com/JahelCuadrado/ExerciseGymGifsDB) for
// most clips, plus individual drills pulled from lyfta.app where that dataset
// has no entry — it's a ~20% subset of the upstream catalogue, which is why so
// many mobility and yoga drills appeared to have "no match anywhere".
// All media © Gym Visual — see public/stretch/NOTICE.txt.

type Clip = {
  /** File in public/stretch, without the .webp extension. */
  file: string;
  /** What the drill stretches. Required. */
  subject: RegExp;
  /** Position words the clip depends on. Omit when the clip is position-neutral. */
  position?: RegExp;
  /** Words that rule this clip out even when the rest matches. */
  not?: RegExp;
};

// Order matters: the most specific position variant has to be tested before
// the general one, or "supine hamstring" gets claimed by the standing hinge.
const CLIPS: Clip[] = [
  // --- hamstrings: two genuinely different positions ---
  {
    file: "hamstring-supine",
    subject: /hamstring/,
    position: /supine|lying|lie |on (your |the )?back|strap|towel|leg[- ]?up/,
  },
  {
    file: "hamstring-hinge",
    subject: /hamstring|forward fold|toe touch|pike|good morning/,
    not: /supine|lying|lie |seated|sitting|strap|towel|band|wall|ball|roller|foam|kneel|floor/,
  },

  // --- glutes ---
  {
    file: "figure-4",
    subject: /figure.?4|figure.?four|piriformis|glute/,
    position: /seated|sitting|floor|chair/,
    not: /supine|lying|standing|roller|foam|bridge|kneel|ball/,
  },
  { file: "glute-bridge", subject: /glute bridge|hip bridge/, not: /single|march|barbell|band/ },

  // --- position-specific holds ---
  { file: "calf-wall", subject: /calf|gastroc|soleus/, position: /wall/ },
  {
    file: "kneeling-lat",
    subject: /lat |lats|latissimus/,
    position: /kneel|quadruped|all.?fours/,
    not: /roller|foam/,
  },
  {
    file: "supine-twist",
    subject: /twist|scorpion/,
    position: /supine|lying|lie |on (your |the )?back/,
    not: /seated|sitting|standing|chair/,
  },

  // --- position-neutral enough to be safe on the subject alone ---
  { file: "neck-lateral", subject: /neck|upper trap|levator|scalene/, not: /roller|foam|ball/ },
  { file: "overhead-triceps", subject: /tricep/, not: /roller|foam|ball|band/ },
  {
    file: "side-bend",
    subject: /lateral stretch|side bend|side body|quadratus/,
    not: /lying|seated|roller|foam/,
  },
  { file: "cat-cow", subject: /cat.?cow|cat.?camel/ },
  { file: "worlds-greatest", subject: /world.?s? greatest/ },
  { file: "deep-squat", subject: /deep squat|squat hold|malasana|garland|third.?world squat/ },
  { file: "shoulder-pass-through", subject: /pass.?through|dislocate/ },

  // --- soft tissue: the roller word is mandatory, then the target ---
  {
    file: "foamroll-quad",
    subject: /foam ?roll|roller|smr/,
    position: /quad|thigh|hip flexor/,
  },
  {
    file: "foamroll-back",
    subject: /foam ?roll|roller|smr/,
    position: /back|thoracic|t.?spine/,
  },
];

export const STRETCH_MEDIA_CREDIT = "Exercise animations © Gym Visual";

// The clip for a drill, or null when nothing clears the bar — in which case
// the caller should render the drawn figure instead. Null is the normal,
// expected result for most drills, not an error.
export function stretchMediaSrc(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = name.toLowerCase();
  for (const c of CLIPS) {
    if (!c.subject.test(n)) continue;
    if (c.position && !c.position.test(n)) continue;
    if (c.not && c.not.test(n)) continue;
    return `/stretch/${c.file}.webp`;
  }
  return null;
}

// True when at least one drill in a routine will play a real clip — used to
// decide whether the media credit is worth showing at all.
export function routineUsesMedia(names: (string | null | undefined)[]): boolean {
  return names.some((n) => stretchMediaSrc(n) !== null);
}
