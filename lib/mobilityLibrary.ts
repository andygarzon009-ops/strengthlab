// The mobility vocabulary the coach prescribes from.
//
// Left to itself the model reaches for the same dozen generic drills it has
// seen a million times — supine hamstring with a strap, doorway pec, child's
// pose — and every routine comes out interchangeable. This file is the
// concrete alternative: the drills and the three routines from the Strength
// Side material, with the cue and the regression that make each one work,
// rendered into the trainer prompt so the coach has something specific to
// prescribe and specific things to say about it.
//
// Two halves:
//   DRILLS    — the catalog. Named movements with kind, pose, hold, cue and
//               scale-down, grouped by what they open.
//   TEMPLATES — the three routines as complete, ready-to-emit sessions, so
//               "give me the daily practice" returns THAT routine rather than
//               an improvisation around its theme.

import type { StretchKind, StretchRoutine } from "./stretchRoutine";
import type { StretchPose } from "./stretchPoses";

export type MobilityDrill = {
  name: string;
  kind: StretchKind;
  pose: StretchPose;
  // Per-side (or per-round) work time the drill is normally prescribed at.
  durationSec: number;
  side?: "both";
  // The cue that makes the position work — what to actively do, not what it
  // stretches. Doubles as the item's "instructions" when prescribed.
  cue: string;
  // How to make it accessible when the full version is out of reach. Every
  // drill that has one carries one; the coach appends it to the cue.
  regression?: string;
};

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const DRILLS: Record<string, MobilityDrill[]> = {
  "Hips — rotation & glutes": [
    {
      name: "Seated Piriformis Stretch",
      kind: "static",
      pose: "figure-4",
      durationSec: 60,
      side: "both",
      cue: "Hook the elbow under the knee, pull it toward the opposite armpit, drive the down-hip into the floor and lift the ribcage — don't round forward",
      regression: "keep the bottom leg straight and press the elbow into the back of the knee instead",
    },
    {
      name: "90/90 Hip Switch",
      kind: "dynamic",
      pose: "hip-cars",
      durationSec: 45,
      cue: "Rock the hip up off the floor, fold over the front shin, then switch sides — reach the arms forward and relax into each side",
      regression: "use the hands to guide you through the switch, or sit on a block",
    },
    {
      name: "90/90 Hip IR Isometrics",
      kind: "loaded",
      pose: "ninety-ninety",
      durationSec: 50,
      side: "both",
      cue: "Back leg is the one working: press the foot down into the floor 5s, then hand or weight on the foot and try to lift 5s. Sit tall, repeat",
      regression: "prop the hips up higher on a block or cushion — start higher than you think, lower it over weeks",
    },
    {
      name: "Elevated Pigeon Hinge",
      kind: "loaded",
      pose: "pigeon",
      durationSec: 50,
      side: "both",
      cue: "Shin on a knee-height surface, roughly parallel to your hips. Flat back, hinge the chest forward and drive back up with the hip for reps",
      regression: "lower the surface and put a block under the knee so the knee sits above the ankle; let the hands assist, then use them less",
    },
    {
      name: "Pigeon (90° Shin)",
      kind: "static",
      pose: "pigeon",
      durationSec: 60,
      side: "both",
      cue: "Front shin at a true 90°, chest down toward the ankle, keep the spine long and let the front hip release on each exhale",
      regression: "cushion under the working hip and take the shin off 90°",
    },
    {
      name: "Wall Butterfly",
      kind: "loaded",
      pose: "butterfly",
      durationSec: 50,
      cue: "Back against the wall, soles together, dumbbells on the knees. Let the weight press the knees down, then drive them back up against it for reps",
      regression: "hips up on a block or pillow, hands instead of dumbbells",
    },
  ],
  "Hips — front / quads": [
    {
      name: "Couch Stretch",
      kind: "loaded",
      pose: "hip-flexor-lunge",
      durationSec: 60,
      side: "both",
      cue: "Back knee into the corner of the wall, torso upright, tailbone TUCKED and that glute squeezed — the squeeze is the stretch, not the lean",
      regression: "knee up on pillows or a yoga block to cut the range; hands overhead only once the tuck holds",
    },
    {
      name: "Deep Hip Flexor Stretch",
      kind: "static",
      pose: "hip-flexor-lunge",
      durationSec: 60,
      side: "both",
      cue: "Back toes flat, press the back hip down and forward as the front knee travels away — the two thighs pull in opposite directions. Squeeze the glute, rotate gently toward the front leg",
      regression: "stay in a normal half-kneeling lunge with a cushion under the knee",
    },
    {
      name: "Yoga Quad Stretch",
      kind: "static",
      pose: "hip-flexor-lunge",
      durationSec: 50,
      side: "both",
      cue: "From half-kneeling, pull the back heel to the butt without letting the ribs flare — stay hollow and keep the glute on",
      regression: "loop a strap around the foot instead of reaching for it",
    },
    {
      name: "Bretzel",
      kind: "static",
      pose: "bretzel",
      durationSec: 60,
      side: "both",
      cue: "Side-lying: top knee stays down at 90°, pull the bottom heel to the butt, then let the top shoulder fall back to the floor. Stay ACTIVE — pull the shoulder down, push the hip forward, squeeze the glute",
      regression: "let the shoulder rest on a cushion and hold the ankle with a strap",
    },
  ],
  "Posterior chain — hamstrings & spine": [
    {
      name: "Jefferson Curl",
      kind: "loaded",
      pose: "hamstring-hinge",
      durationSec: 50,
      cue: "Toes on a ledge, light weight (start at 5–10lb). Chin to chest and curl down one vertebra at a time, weight in the front of the foot, then reverse. Depth is the goal, never load",
      regression: "no weight and a smaller range until the segmental curl is smooth",
    },
    {
      name: "Straight-Leg Good Morning",
      kind: "loaded",
      pose: "hamstring-hinge",
      durationSec: 45,
      cue: "Knees locked, back arched, hips travel BACK. Only go as low as the arch holds — round and you've gone too far. Hold the bottom 10s on the last rep",
      regression: "hands on the low back to feel the arch, and stop well above parallel",
    },
    {
      name: "Half-Kneeling Hamstring Stretch",
      kind: "static",
      pose: "hamstring-hinge",
      durationSec: 60,
      side: "both",
      cue: "Front leg locked out, toes pulled back. First half arch the low back and pull the chest to the knee; second half round the spine and fold in deep",
      regression: "cushion under the down knee, and bend the front knee slightly if the arch collapses",
    },
    {
      name: "Standing Downward Dog",
      kind: "static",
      pose: "down-dog",
      durationSec: 60,
      cue: "Hands on a counter or wall, walk the feet back, tailbone tucked and knees bent, then press the chest and armpits DOWN through the arms — the opening is between the shoulder blades",
      regression: "use a higher surface and stay closer to it",
    },
    {
      name: "Downward Dog Press",
      kind: "dynamic",
      pose: "down-dog",
      durationSec: 45,
      cue: "Five presses with bent knees to get the hips high and the spine long, then straighten the knees and press the chest toward the thighs. Hold the last one 10s",
      regression: "keep the knees bent and the heels off the floor throughout",
    },
    {
      name: "Deep Squat Sit",
      kind: "static",
      pose: "deep-squat",
      durationSec: 60,
      cue: "Sit all the way down, elbows prying the knees apart, keep the arches of the feet and let the hips release. Finish here so the range you just opened gets used",
      regression: "elevate the heels on plates or books, or hold a doorframe in front of you",
    },
    {
      name: "Squat to Downward Dog",
      kind: "dynamic",
      pose: "deep-squat",
      durationSec: 60,
      cue: "Walk the hands out from the squat, drive the hips high into down dog, then push the floor away to walk back and drop DEEPER into the squat — each position feeds the other",
      regression: "heels down wherever they land, bend the knees in the dog",
    },
  ],
  "Shoulders & thoracic spine": [
    {
      name: "Dead Hang",
      kind: "loaded",
      pose: "bar-hang",
      durationSec: 45,
      cue: "Relax and let the torso be dragged down — shoulders travel up toward the ears, ribcage sinks. Just breathe and hold on",
      regression: "keep the toes on the floor or a box to take some weight off",
    },
    {
      name: "Lounge Chair",
      kind: "loaded",
      pose: "crab-bridge",
      durationSec: 45,
      cue: "Seated, hands behind you with fingers pointing away. Press the hands down, pull the shoulder blades back and shift the hips forward",
      regression: "leave the hips on the floor and move the hands closer in",
    },
    {
      name: "Crab Press",
      kind: "loaded",
      pose: "crab-bridge",
      durationSec: 45,
      cue: "From the lounge chair, drive the hips up toward parallel with the floor. Squeeze the glutes, actively pull the shoulders back and press the hands down — this one is all active",
      regression: "lower the hips; height is the intensity dial here",
    },
    {
      name: "Butcher's Block",
      kind: "loaded",
      pose: "butchers-block",
      durationSec: 50,
      cue: "Elbows on a bench, knees under hips, holding a stick behind the head. Pull the hands toward the upper back and let the chest fall — stay hollow, resist shrugging the blades up",
      regression: "higher surface for the elbows, and knees further forward",
    },
    {
      name: "Thoracic Rotation (Open Book)",
      kind: "dynamic",
      pose: "open-book",
      durationSec: 40,
      side: "both",
      cue: "Knees stay stacked and still — the rotation is all spine. Reach the top arm back and follow the hand with your eyes",
      regression: "pillow between the knees and a smaller reach",
    },
  ],
  "Movement / integration": [
    {
      name: "Hip Rotations (Seated)",
      kind: "dynamic",
      pose: "hip-cars",
      durationSec: 40,
      side: "both",
      cue: "Rotate the whole leg in and out while keeping the pelvis still — the movement should come from the hip socket, not from swinging the hips",
    },
    {
      name: "Windshield Wipers",
      kind: "dynamic",
      pose: "hip-cars",
      durationSec: 40,
      cue: "Now let the hips move — drop both knees side to side, one hip into internal rotation and one into external, tapping the floor if you can",
    },
    {
      name: "Basic Crawl",
      kind: "loaded",
      pose: "crawl",
      durationSec: 45,
      cue: "Knees just off the floor, opposite hand and foot together, slow and quiet. Press the ground away and keep the hips from rocking — this is reactive core strength",
      regression: "crawl forward only until it's smooth, then add the reverse",
    },
    {
      name: "Kneel to Stand",
      kind: "dynamic",
      pose: "deep-squat",
      durationSec: 45,
      cue: "Knees forward to the floor, point the toes and sit back to the heels, then reverse it. Sink weight into the feet to open the shins",
      regression: "hands on the floor or the knees for support, cushion under the knees",
    },
  ],
};

// ---------------------------------------------------------------------------
// Templates — the three routines, ready to emit as-is
// ---------------------------------------------------------------------------

export type MobilityTemplate = {
  slug: string;
  // What the athlete might call it, lowercase. Used both in the prompt and by
  // matchTemplate() for the "give me the daily practice" case.
  aliases: string[];
  // One line of framing the coach can use as its prose.
  framing: string;
  routine: StretchRoutine;
};

const d = (
  group: string,
  name: string,
  over?: Partial<{ durationSec: number; side: "both" | null; cue: string }>
) => {
  const found = DRILLS[group].find((x) => x.name === name);
  if (!found) throw new Error(`unknown drill: ${name}`);
  const instructions = over?.cue ?? [found.cue, found.regression && `— easier: ${found.regression}`].filter(Boolean).join(" ");
  return {
    name: found.name,
    durationSec: over?.durationSec ?? found.durationSec,
    side: over?.side === null ? undefined : (over?.side ?? found.side),
    kind: found.kind,
    pose: found.pose,
    instructions: instructions.slice(0, 200),
  };
};

export const TEMPLATES: MobilityTemplate[] = [
  {
    slug: "hips-and-spine",
    aliases: [
      "hip routine",
      "hips and spine",
      "hip and spine routine",
      "stretching routine",
      "josh's stretching routine",
      "strength side stretching routine",
    ],
    framing:
      "The hips-and-spine routine — rotation first, then the front of the hip, then hamstrings, finishing in a squat so the range gets used. Minute holds, 3–4×/week.",
    routine: {
      title: "Hips & Spine",
      restSec: 15,
      stretches: [
        d("Hips — rotation & glutes", "Seated Piriformis Stretch"),
        d("Hips — front / quads", "Bretzel"),
        d("Posterior chain — hamstrings & spine", "Half-Kneeling Hamstring Stretch"),
        d("Hips — front / quads", "Deep Hip Flexor Stretch"),
        d("Hips — rotation & glutes", "Pigeon (90° Shin)"),
        d("Posterior chain — hamstrings & spine", "Deep Squat Sit"),
      ],
    },
  },
  {
    slug: "daily-practice",
    aliases: [
      "daily practice",
      "the daily practice",
      "daily routine",
      "daily mobility",
      "everyday routine",
      "full body stretching routine",
    ],
    framing:
      "The daily practice — every major range in about 15 minutes, no equipment beyond a wall. Do it daily if you like; 3–4×/week is the floor.",
    routine: {
      title: "Daily Practice",
      restSec: 12,
      stretches: [
        d("Movement / integration", "Hip Rotations (Seated)"),
        d("Movement / integration", "Windshield Wipers"),
        d("Posterior chain — hamstrings & spine", "Standing Downward Dog"),
        d("Hips — front / quads", "Yoga Quad Stretch"),
        d("Shoulders & thoracic spine", "Lounge Chair"),
        d("Posterior chain — hamstrings & spine", "Straight-Leg Good Morning"),
        d("Posterior chain — hamstrings & spine", "Deep Squat Sit"),
        d("Posterior chain — hamstrings & spine", "Downward Dog Press"),
        d("Movement / integration", "Basic Crawl"),
      ],
    },
  },
  {
    slug: "mobility-a",
    aliases: ["mobility a", "mobility day a", "weekly mobility a"],
    framing:
      "Mobility A — the loaded day. Pairs run as supersets: hang + squat, couch + Jefferson curl, crab + pigeon hinge. Start at the times below and add 5–10s a week.",
    routine: {
      title: "Mobility A",
      restSec: 15,
      stretches: [
        d("Shoulders & thoracic spine", "Dead Hang"),
        d("Posterior chain — hamstrings & spine", "Deep Squat Sit"),
        d("Hips — front / quads", "Couch Stretch"),
        d("Posterior chain — hamstrings & spine", "Jefferson Curl"),
        d("Shoulders & thoracic spine", "Crab Press"),
        d("Hips — rotation & glutes", "Elevated Pigeon Hinge"),
      ],
    },
  },
  {
    slug: "mobility-b",
    aliases: ["mobility b", "mobility day b", "weekly mobility b"],
    framing:
      "Mobility B — the second loaded day. Hang + hinge, weighted butterfly + 90/90 isometrics, couch + butcher's block. Same progression: time first, then variation, then load.",
    routine: {
      title: "Mobility B",
      restSec: 15,
      stretches: [
        d("Shoulders & thoracic spine", "Dead Hang"),
        d("Posterior chain — hamstrings & spine", "Straight-Leg Good Morning"),
        d("Hips — rotation & glutes", "Wall Butterfly"),
        d("Hips — rotation & glutes", "90/90 Hip IR Isometrics"),
        d("Hips — front / quads", "Couch Stretch"),
        d("Shoulders & thoracic spine", "Butcher's Block"),
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Prompt rendering
// ---------------------------------------------------------------------------

// The catalog as prompt text. Compact on purpose — one line per drill — but
// carrying the cue and the regression, since those are the part the coach
// cannot reconstruct on its own and the part that makes a routine feel
// coached rather than listed.
export function formatMobilityLibraryForPrompt(): string {
  const groups = Object.entries(DRILLS)
    .map(([group, drills]) => {
      const lines = drills
        .map((x) => {
          const side = x.side === "both" ? ' side:"both"' : "";
          const reg = x.regression ? ` | EASIER: ${x.regression}` : "";
          return `  - ${x.name} [${x.kind}, pose:${x.pose}, ${x.durationSec}s${side}] — ${x.cue}${reg}`;
        })
        .join("\n");
      return `${group}\n${lines}`;
    })
    .join("\n");

  const templates = TEMPLATES.map(
    (t) =>
      `  - "${t.routine.title}" (athlete may call it: ${t.aliases.slice(0, 3).join(", ")}): ${t.routine.stretches.map((s) => s.name).join(" → ")}`
  ).join("\n");

  return `
MOBILITY DRILL LIBRARY — PRESCRIBE FROM THIS FIRST. These are the movements this app coaches, with the cue and the scale-down that make each one work. Prefer a drill from this list over a generic one you'd otherwise reach for (supine strap hamstring, doorway pec, standard child's pose), and when you use one, USE ITS CUE — reword freely, but keep the actual instruction and keep the regression. Drills outside the library are fine when the request genuinely calls for something not here.
${groups}

NAMED ROUTINES — when the athlete asks for one of these by name, emit exactly this roster in this order, at the library durations:
${templates}
  Mobility A and Mobility B are a weekly pair: run each once or twice a week (2–4 sessions total), pairs performed as supersets, progressing hold time by 5–10s per week before touching variation or load.
`.trim();
}

// Match a message against the named routines so the coach can be told, in the
// prompt, that the athlete is asking for a specific one.
export function matchTemplate(message: string): MobilityTemplate | null {
  const m = message.toLowerCase();
  for (const t of TEMPLATES) {
    if (t.aliases.some((a) => m.includes(a))) return t;
  }
  return null;
}
