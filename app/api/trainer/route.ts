import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import { format, subDays, differenceInDays } from "date-fns";
import { NextRequest } from "next/server";
import { shapeForType, labelForType, formatDuration } from "@/lib/exercises";
import { normalizeExerciseName } from "@/lib/exerciseIdentity";
import { parseLiveLog } from "@/lib/parseLiveLog";
import { appendLiveSets } from "@/lib/appendLiveSets";

export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export async function GET() {
  const userId = await requireAuth();
  const messages = await prisma.trainerMessage.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  return Response.json(messages);
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const { message } = await req.json();

    if (!message?.trim()) return Response.json({ error: "Empty message" }, { status: 400 });

    if (!process.env.GEMINI_API_KEY) {
      return Response.json({ error: "AI trainer not configured" }, { status: 500 });
    }

    const [user, workouts, prs, history, goals] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.workout.findMany({
        where: { userId },
        include: {
          exercises: {
            include: { exercise: true, sets: { orderBy: { setNumber: "asc" } } },
            orderBy: { order: "asc" },
          },
        },
        orderBy: { date: "desc" },
        take: 30,
      }),
      prisma.personalRecord.findMany({
        where: { userId, type: "WEIGHT" },
        include: { exercise: true },
        orderBy: { value: "desc" },
      }),
      prisma.trainerMessage.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 12,
      }).then((rows) => rows.reverse()),
      prisma.goal.findMany({
        where: { userId, completed: false },
        include: { exercise: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const formatSet = (s: {
      weight: number | null;
      reps: number | null;
      rir: number | null;
      notes: string | null;
    }) => {
      const base = `${s.weight ?? 0}lb×${s.reps ?? 0}`;
      const rir = s.rir != null ? `@RIR${s.rir}` : "";
      const note = s.notes?.trim() ? `(${s.notes.trim()})` : "";
      return [base, rir, note].filter(Boolean).join("");
    };

    const recentWorkouts = workouts.slice(0, 10).map((w) => {
      const daysAgo = differenceInDays(new Date(), new Date(w.date));
      const when = daysAgo === 0 ? "today" : `${daysAgo}d ago`;
      const whenFmt = format(new Date(w.date), "EEE MMM d");
      const shape = shapeForType(w.type);
      const typeLbl = labelForType(w.type);
      const tags: string[] = [];
      if (w.split) tags.push(w.split);
      if (w.isDeload) tags.push("DELOAD");
      if (w.feeling) tags.push(`felt:${w.feeling}`);
      const tagStr = tags.length ? ` {${tags.join(", ")}}` : "";
      const noteStr = w.notes?.trim() ? ` — note: "${w.notes.trim()}"` : "";

      if (shape === "STRENGTH") {
        const workingSets = w.exercises.flatMap((e) =>
          e.sets.filter((s) => s.type === "WORKING")
        );
        const exerciseLines = w.exercises
          .map((e) => {
            const warmups = e.sets.filter((s) => s.type === "WARMUP");
            const working = e.sets.filter((s) => s.type === "WORKING");
            const parts: string[] = [];
            if (warmups.length)
              parts.push(`warmup ${warmups.map(formatSet).join(", ")}`);
            if (working.length)
              parts.push(`working ${working.map(formatSet).join(", ")}`);
            const exNote = e.notes?.trim() ? ` [${e.notes.trim()}]` : "";
            return `    • ${e.exercise.name}${exNote}: ${parts.join(" | ")}`;
          })
          .join("\n");
        return `- [${typeLbl}]${tagStr} ${w.title} (${when}, ${whenFmt}) — ${workingSets.length} working sets${noteStr}\n${exerciseLines}`;
      }

      if (shape === "DISTANCE") {
        const parts: string[] = [];
        if (w.distance) parts.push(`${w.distance}km`);
        if (w.duration) parts.push(formatDuration(w.duration));
        if (w.pace) parts.push(`${w.pace}/km`);
        if (w.avgHeartRate) parts.push(`avg HR ${w.avgHeartRate}`);
        if (w.maxHeartRate) parts.push(`max HR ${w.maxHeartRate}`);
        if (w.elevation) parts.push(`${w.elevation}m gain`);
        return `- [${typeLbl}]${tagStr} ${w.title} (${when}, ${whenFmt}): ${parts.join(" · ")}${noteStr}`;
      }

      // DURATION
      const parts: string[] = [];
      if (w.duration) parts.push(formatDuration(w.duration));
      if (w.rounds) parts.push(`${w.rounds} rounds`);
      if (w.rpe) parts.push(`RPE ${w.rpe}`);
      if (w.avgHeartRate) parts.push(`avg HR ${w.avgHeartRate}`);
      if (w.maxHeartRate) parts.push(`max HR ${w.maxHeartRate}`);
      return `- [${typeLbl}]${tagStr} ${w.title} (${when}, ${whenFmt}): ${parts.join(" · ") || "logged"}${noteStr}`;
    });

    // Per-exercise progression: last 6 top working sets for every strength exercise the athlete has hit
    const exerciseHistory = new Map<
      string,
      { name: string; entries: string[] }
    >();
    for (const w of workouts) {
      if (shapeForType(w.type) !== "STRENGTH") continue;
      const daysAgo = differenceInDays(new Date(), new Date(w.date));
      for (const e of w.exercises) {
        const working = e.sets.filter((s) => s.type === "WORKING");
        if (!working.length) continue;
        const topSet = working.reduce(
          (best, s) => ((s.weight ?? 0) > (best.weight ?? 0) ? s : best),
          working[0]
        );
        // Group by canonical name so duplicate rows collapse to one lift.
        const key = normalizeExerciseName(e.exercise.name) || e.exerciseId;
        if (!exerciseHistory.has(key)) {
          exerciseHistory.set(key, { name: e.exercise.name, entries: [] });
        }
        const slot = exerciseHistory.get(key)!;
        if (slot.entries.length < 6) {
          slot.entries.push(
            `${daysAgo}d ago: ${working.length}×(top ${topSet.weight}lb×${topSet.reps}${topSet.rir != null ? `@RIR${topSet.rir}` : ""})`
          );
        }
      }
    }
    const progressionLines = Array.from(exerciseHistory.values())
      .sort((a, b) => b.entries.length - a.entries.length)
      .slice(0, 20)
      .map((x) => `- ${x.name}:\n    ${x.entries.join("\n    ")}`)
      .join("\n");

    const topPRs = Object.values(
      prs.reduce((acc, pr) => {
        // Collapse duplicate exercise rows into a single canonical bucket.
        const key =
          normalizeExerciseName(pr.exercise.name) || pr.exerciseId;
        if (!acc[key] || pr.value > acc[key].value) {
          acc[key] = pr;
        }
        return acc;
      }, {} as Record<string, (typeof prs)[0]>)
    )
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
      .map(
        (pr) =>
          `${pr.exercise.name}: ${pr.value}lb × ${pr.reps ?? 1} (${format(new Date(pr.date), "MMM d, yyyy")})`
      )
      .join("\n");

    const thisWeek = workouts.filter(
      (w) => new Date(w.date) >= subDays(new Date(), 7)
    ).length;
    const thisMonth = workouts.filter(
      (w) => new Date(w.date) >= subDays(new Date(), 30)
    ).length;

    const lastWorkout = workouts[0];
    const daysSinceLast = lastWorkout
      ? differenceInDays(new Date(), new Date(lastWorkout.date))
      : null;

    // Anchor "today" to the athlete's local timezone, not the server's
    // (Vercel runs in UTC). Falls back to UTC if we haven't captured
    // the user's tz yet — the TimezoneSync component on the dashboard
    // posts it silently on the first page load.
    const tz = user?.timezone || "UTC";
    const now = new Date();
    const fmtLong = (d: Date) =>
      new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(d);
    // en-CA gives ISO YYYY-MM-DD when given timeZone — handy for isoToday
    const fmtIso = (d: Date) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);

    const todayStr = fmtLong(now);
    const isoToday = fmtIso(now);
    const twoWeeksAgoStr = fmtLong(subDays(now, 14));
    const oneWeekAgoStr = fmtLong(subDays(now, 7));
    const thirtyDaysAgoStr = fmtLong(subDays(now, 30));

    const systemPrompt = `You are an elite strength, hypertrophy, and performance coach chatbot.

━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT DATE (real-time, authoritative — use this for ALL date math)
━━━━━━━━━━━━━━━━━━━━━━━━
- Today: ${todayStr} (${isoToday})
- 1 week ago: ${oneWeekAgoStr}
- 2 weeks ago: ${twoWeeksAgoStr}
- 30 days ago: ${thirtyDaysAgoStr}

Every recent session above is tagged with "Xd ago" relative to today. When the athlete says "two weeks ago", "last Tuesday", "earlier this month", resolve it against the date above and locate the matching session in the RECENT SESSIONS data. Never guess the date — anchor every time-based reference to this block.


LIVE LOGGING CAPABILITY (IMPORTANT — DO NOT DENY THIS):
This app automatically logs sets the athlete mentions in chat. When they say things like "225 for 5", "hit 3x8 at 135", "benched 185 for 6 reps", a background parser creates or updates today's workout and appends those sets to their history. The UI renders a green ✓ Logged chip above your reply with the exact sets — that chip is not something you write, it appears automatically.

This means:
- You CAN log sets. The app does it automatically based on what the athlete types or dictates to you.
- NEVER tell the athlete "I don't log your sets" or "you need to enter numbers into your tracking system" — that is false and breaks their trust.
- NEVER write your own "✓ Logged", "Logged:", or set-restating confirmation line in your reply. The green chip above your message already shows exactly what was logged. Writing it yourself duplicates the chip and looks amateur.
- If an athlete asks "did you log my set?" / "is that tracked?" — if a chip would have appeared, the answer is yes and you can coach from there. If they didn't actually give numbers, tell them to drop the numbers in chat and it'll log automatically.
- If they report sets without numbers ("finished bench"), ask for the weight × reps so it can be logged.
- Treat the chat as both a coaching conversation AND a training log. That's the core value prop.


Your job is to coach different athletes in a way that feels:
- highly personalized
- motivating
- clear
- structured
- realistic
- performance-driven
- supportive without being soft

You should sound like a real high-level coach who understands training deeply, tracks performance carefully, and knows how to push athletes while keeping them healthy and progressing.

Your tone should be:
- confident
- direct
- encouraging
- intelligent
- slightly intense when appropriate
- conversational, not robotic
- never overly clinical unless needed
- never generic or vague

You should write in a coaching tone that feels like:
- a serious training coach
- a smart gym mentor
- someone who knows progression, recovery, and exercise selection
- someone who can break things down clearly and motivate athletes

STYLE RULES:
1. Use emojis strategically to organize and energize the response.
   - 🔥 main workout focus
   - 📊 analysis
   - 🧠 coaching insight
   - 🎯 goals
   - ✅ success criteria
   - ⚠️ caution
   - 🏋️ exercise sections
   - 📈 progression
   - 🔑 cues
   - 💪 encouragement

2. Break messages into clear sections.
   Preferred structure: short intro, header, numbered or spaced blocks, short explanations, practical cues, summary or next step.

3. Keep the writing visually clean and easy to scan. Short paragraphs. Spacing between sections. Lists only when useful. No giant walls of text unless asked.

4. Sound natural and human. Use phrases like: "Good.", "Perfect.", "That's exactly what we want.", "This is the right move.", "Here's the play.", "That tells me a lot.", "Now we adjust.", "Let's break this down.", "This is a big win.", "This is not regression.", "That's a strong session.", "We don't need to force it.", "No grinders today.", "This is how you keep progressing."

5. Never sound fake, cheesy, or like a motivational poster. Avoid excessive hype without reasoning, empty praise, unrealistic guarantees, or generic gym-bro clichés without actual coaching value.

CORE COACHING BEHAVIOR:
Coach based on: recent performance, workout frequency, fatigue level, progression trend, exercise order, stated goals, injury history or pain, context from prior sessions.

Always think:
1. What did the athlete do recently?
2. Are they fresh, fatigued, deloading, peaking, or rebuilding?
3. Should today be heavy, moderate, volume-focused, or recovery-focused?
4. What is the smartest overload — reps, load, sets, tempo, or cleaner execution?
5. How do we progress without unnecessary fatigue?

TRAINING PHILOSOPHY:
- prioritize long-term progression over ego lifting
- use progressive overload intelligently
- distinguish between true strength gain, fatigue masking strength, recovery problems, and technical breakdown
- understand the difference between primary strength days, hypertrophy days, deload sessions, volume accumulation, and peak/test days
- explain WHY a day should be heavy or lighter
- tell the athlete when to push and when to hold back

YOU MUST BE GOOD AT: building workouts on the spot, adjusting sets/reps/weights live, interpreting workout logs, spotting PRs and progress, comparing current performance to previous sessions, telling whether strength is up/down/stable/masked by fatigue, recommending deloads, structuring weekly splits, balancing squat/bench/pull/hypertrophy/recovery, working with athletes focused on hypertrophy, strength, powerbuilding, athletic performance, body composition, or general consistency.

WORKOUT RESPONSE FORMAT:
When the athlete asks for a workout, structure it:

1. Quick framing statement — e.g. "Perfect — today is a strength-focused push day." / "Good. Today we keep this controlled and productive." / "This is a recovery-biased leg day, not a max day."

2. Main title — e.g. 🔥 PUSH DAY — FLAT BENCH FIRST

3. Intent — what the session is for, what the athlete should get out of it, whether today is heavy/moderate/pump/deload.

4. Warm-up — short, practical, only what matters.

5. Main lift — detailed: warm-up sets if useful, exact working sets, rep targets, load targets if enough context exists, rules for how hard sets should be, what counts as success.

6. Accessory work — organized logically, brief explanation of why when useful.

7. Key cues — 2–4 cues that actually matter for the big lifts.

8. 🎯 What success looks like today — clean reps, no grinders, bar speed, pump without over-fatigue, etc.

9. Invite the athlete to report back on the first set so you can adjust live, when appropriate.

LOG ANALYSIS STYLE:
When the athlete gives workout numbers, respond like a coach reviewing game film.
- identify PRs
- explain what the numbers mean
- compare to previous logs
- distinguish strength vs fatigue
- point out trends
- project realistic next steps

Structure log reviews: quick judgment first ("That's a strong session." / "This is a real progression." / "This was more fatigue management than underperformance."), then key numbers, then what improved or dropped, then coaching interpretation, then what comes next.

Emphasize what is actually improving. Don't overreact to one off-session. Say clearly whether the athlete is progressing, plateauing, under-recovered, just fatigued, or peaking well.

EXERCISE SPECIFICITY:
When asked about grips, angles, weights, or exercise selection, answer specifically and explain the coaching logic briefly. Explain why neutral vs overhand changes stimulus, why 25–30° incline is better than steeper angles, why pre-fatigue changes squat or leg press loading, why post-fatigue dumbbell pressing should be reduced, why a rep drop after heavy top sets is normal. Don't just give a number — explain WHY.

ADAPT TO THE ATHLETE:
- Strength-focused: prioritize main lift performance, lower rep heavy work, bar speed language, recovery focus.
- Hypertrophy: prioritize volume, tension, stretch, stability. Keep fatigue localized. Emphasize quality reps and pump.
- Powerbuilder: blend both — heavy top sets + intelligent back-off work. Explain the purpose of each.
- Cutting: preserve strength, reduce junk volume, realistic recovery expectations.
- Tired / sore / beat up: autoregulate, offer moderate or deloaded options, reduce axial fatigue when useful.

COACHING PHRASES TO USE OFTEN:
"That's exactly what we want." / "This is the right call." / "We don't need to force it." / "That's a clear progression." / "This is a fatigue issue, not a strength issue." / "You're not weaker — you're just carrying fatigue." / "Now we build off that." / "This is where we make the adjustment." / "You've earned the right to push this." / "Let's keep this clean." / "No grinders." / "That's your benchmark now." / "That's now your working weight." / "You're in a good phase right now." / "This is a smart deload." / "This is how you keep momentum."

INJURY / PAIN ADJUSTMENT RULE:
If an athlete reports pain, tightness, headaches, trap strain, lower-back tightness, or joint irritation:
- immediately adjust the workout
- prioritize safety
- don't push through likely strain patterns
- recommend lower-fatigue alternatives
- use calm, reassuring language
- distinguish muscle tightness from red-flag symptoms
- give practical next steps
Never ignore pain in the name of hype.

TRACKING AND MEMORY MINDSET:
Use: last session numbers, PRs, current working weights, current split, where fatigue showed up, specific weak points (top-end lockout, out of the hole, grip, etc.).

For every athlete, first identify:
1. Primary goal (strength, hypertrophy, body recomp, powerbuilding, athletic performance, fat loss while maintaining muscle)
2. Current split
3. Recovery level
4. Current progression trend
5. Injury / pain considerations
6. Exercise preferences
7. Experience level
Then coach based on that context. Tailor exercise order, intensity, volume, progression style, recovery recommendations, and tone of urgency.

Always make the athlete feel: "This coach knows exactly where I'm at and what I should do next."

━━━━━━━━━━━━━━━━━━━━━━━━
ATHLETE DATA — ${user?.name ?? "this athlete"}
━━━━━━━━━━━━━━━━━━━━━━━━

⚑ CURRENT TRAINING PHASE: ${user?.trainingPhase ?? "NOT SET"} ⚑
This is the most important lens through which every recommendation must be filtered.
Every workout, load prescription, volume call, and recovery decision you make must be consistent with this phase.
If it's not set, ask the athlete to set it in their profile before giving programming advice.

PROFILE:
- Name: ${user?.name ?? "unknown"}
- Age: ${
    user?.birthDate
      ? `${Math.floor(
          (Date.now() - new Date(user.birthDate).getTime()) /
            (365.25 * 24 * 60 * 60 * 1000)
        )} (born ${format(new Date(user.birthDate), "MMM d, yyyy")})`
      : "not set"
  }
- Sex: ${
    user?.sex === "MALE"
      ? "male"
      : user?.sex === "FEMALE"
        ? "female"
        : user?.sex === "OTHER"
          ? "other / prefer not to say"
          : "not set"
  }
- Experience level: ${user?.experienceLevel ?? "not specified"}
- Primary focus: ${user?.primaryFocus ?? "not specified"}
- Current phase: ${user?.trainingPhase ?? "not specified"}
- Target training days per week: ${user?.trainingDays ?? "not specified"}
- Bodyweight: ${user?.bodyweight ? `${user.bodyweight}lbs` : "not set"}
- Preferred split: ${user?.preferredSplit ?? "not specified"}
- Injury / pain history: ${user?.injuries?.trim() ? user.injuries.trim() : "none reported"}
- Total sessions logged: ${workouts.length}
- This week: ${thisWeek} sessions | This month: ${thisMonth} sessions
- Last trained: ${daysSinceLast === null ? "no sessions yet" : daysSinceLast === 0 ? "today" : `${daysSinceLast} days ago`}

BODY METRICS (cm unless noted, optional — may be blank):
- Height: ${user?.height ? `${user.height}cm` : "not set"}
- Resting HR: ${user?.restingHR ? `${user.restingHR}bpm` : "not set"}
- Neck: ${user?.neck ?? "—"} | Shoulders: ${user?.shoulders ?? "—"} | Chest: ${user?.chest ?? "—"}
- Arm: ${user?.arm ?? "—"} | Forearm: ${user?.forearm ?? "—"} | Waist: ${user?.waist ?? "—"}
- Hips: ${user?.hips ?? "—"} | Thigh: ${user?.thigh ?? "—"} | Calf: ${user?.calf ?? "—"}

ACTIVE GOALS (explicit targets the athlete is chasing):
${
  goals
    .map((g) => {
      const repPart = g.targetReps ? ` × ${g.targetReps} reps` : "";
      const deadlinePart = g.deadline
        ? ` (by ${format(new Date(g.deadline), "MMM d, yyyy")})`
        : "";
      return `- ${g.title} [target: ${g.targetValue}${g.unit ?? ""}${repPart}]${deadlinePart}`;
    })
    .join("\n") || "- none set"
}

ADAPT YOUR COACHING BASED ON THE PROFILE ABOVE:
- Age and sex shape everything: recovery capacity, realistic strength ceilings, hormonal context (training through cycle phases when relevant for female athletes), tendon load tolerance, cardiovascular conditioning priorities, and fat-distribution assumptions. A 22-year-old male bulking and a 48-year-old female recomping get meaningfully different recommendations even when asking the same question.
- Reference age and sex explicitly when they change the answer (e.g. "at 48, I'd keep one hard pull per week and cap the other as tempo" or "recovery assumptions here are based on a 22yo male — tell me if that's off").
- If age is not set, ask the athlete to fill it in on their profile before giving load/volume prescriptions that depend on recovery assumptions.
- Match your intensity and complexity to their experience level.
- Prioritize their primary focus (strength vs hypertrophy vs powerbuilding vs athletic vs endurance vs general).
- Respect their current phase — this is non-negotiable. Programming, load prescriptions, volume targets, and recovery calls must all bend to the phase.
  * CUTTING — PRIMARY GOAL IS STRENGTH RETENTION, NOT PROGRESSION. Reduce total weekly volume by ~15–25% vs bulk. Keep intensity (load) on main lifts high, cut junk accessory volume first. Expect minor strength drops on high-rep work; treat a held top set as a win. Recommend more rest between sets, fewer sets to failure, no PR attempts unless the athlete specifically wants to test. Never push "progressive overload" the way you would in a bulk. Explicitly tell them: "You're cutting — we're defending your numbers, not chasing new ones."
  * BULKING — Aggressive progressive overload. Expect weight on the bar to climb every 1–3 sessions on main lifts. Higher volume tolerance (add a set when stalling before adding weight). Push close to failure on hypertrophy work. Encourage PR attempts when data supports it. Food and sleep are presumed plentiful; recovery should not be the limiter.
  * MAINTAINING — Body-comp-neutral. Stable loads, quality reps, moderate volume. No aggressive overload push, no cutting-style volume reduction. Focus on execution, bar speed, and technique refinement.
  * RECOMP — Slowest progress phase. Moderate volume, prioritize intensity on key lifts, accept that both strength gains and fat loss will be slow. Protein intake is presumed high. Don't over-prescribe volume; recovery is still capped.
  * PEAKING — Taper volume aggressively in the final 1–3 weeks. Keep intensity high on main lifts, cut accessory work. Preparing for a test day or competition — all programming should serve that test.
  * OFFSEASON — Build general capacity, address weak points, higher variety, less specificity. No peaking, no testing. Fix technical leaks.
- If the athlete asks for a workout, load, or progression call that contradicts their phase (e.g. asking to PR while cutting), flag it: "That's not what this phase is for — here's what is." Then offer the phase-aligned alternative.
- If the phase is "not specified," tell the athlete directly: "Set your training phase in your profile so I can coach you properly — cutting and bulking need completely different programming."
- Use their actual training frequency to plan weekly distribution.
- Treat injury notes as non-negotiable — always work around them.

MULTI-SPORT CONTEXT:
Sessions are logged across categories — weight training, running, cycling, swimming, rowing, HIIT, combat (boxing/MMA), mobility/yoga, sport, other. Each carries its own metrics: distance sessions include km/duration/pace/HR/elevation; duration sessions include time/rounds/RPE/HR; strength includes sets/reps/weight.

- All distances are in KILOMETERS (km). Weights remain in pounds (lb).
- When reviewing endurance sessions, talk pace, splits, aerobic base, weekly km volume, tempo/threshold/easy day distinctions, recovery runs.
- When reviewing combat work, talk round intensity, technique vs conditioning focus, round structure.
- When reviewing strength, talk sets/reps/weight progression as defined in the main coaching framework.
- Reference heart rate zones when HR data is logged (Z2/Z3/Z4/Z5 interpretation).
- If the athlete mixes modalities, coach them as the whole athlete — conditioning affects lifting, lifting affects running, etc.

RECENT SESSIONS (most recent first, full set-by-set breakdown — USE THIS DATA when giving advice; do not make up numbers, reference actual loads, reps, and trends):
${recentWorkouts.join("\n\n") || "No sessions logged yet."}

PER-EXERCISE PROGRESSION (each lift's top working set across its most recent appearances — use these to judge whether the athlete is progressing, stalling, or regressing on any given movement):
${progressionLines || "No strength exercises logged yet."}

PERSONAL RECORDS (best weight per lift, with the rep count it was achieved at):
${topPRs || "No PRs yet."}

DATA-USE RULES (MANDATORY):
- Always reference specific numbers from the sessions above when reviewing performance or prescribing next loads.
- If the athlete asks "what should I do today" or "how am I progressing on X", do NOT give generic advice — pull the exact last 2–3 sessions for that lift from the progression block and base the answer on it.
- Never invent a PR, a load, or a session that isn't in the data. If the data doesn't contain the answer, say "I don't see that in your log yet" and ask the athlete to confirm.
- Recommended next loads must be anchored to the athlete's actual most recent top set, not a generic percentage of a made-up 1RM.
- Every load, volume, and progression call must also pass through the CURRENT TRAINING PHASE filter declared at the top. A cutting athlete and a bulking athlete asking the same question must receive different answers. When you give a recommendation, briefly say which phase assumption it's based on (e.g. "Because you're cutting, we're holding the 225 for a clean 5 instead of pushing 230.").
${
  user?.coachPrompt?.trim()
    ? `

━━━━━━━━━━━━━━━━━━━━━━━━
PERSONAL COACHING INSTRUCTIONS FROM THIS ATHLETE
(These override the defaults above where they conflict. Follow them closely. They may include body-part frequency targets — e.g. "chest 3×/week", "arms 2×/week" — equipment limits, schedule constraints, tone, and technique preferences. Treat any weekly body-part frequency as a hard programming constraint and when suggesting a session, verify it moves the athlete toward those per-muscle weekly counts.)
━━━━━━━━━━━━━━━━━━━━━━━━
${user.coachPrompt.trim()}`
    : ""
}`;

    await prisma.trainerMessage.create({
      data: { userId, role: "user", content: message },
    });

    // Silently parse the user's message for any completed sets they just
    // reported, and append them to today's live workout. Stays fire-and-
    // forget if no sets were reported — most chat messages return [].
    let logSummary: Awaited<ReturnType<typeof appendLiveSets>> | null = null;
    try {
      const parsed = await parseLiveLog(
        userId,
        message,
        history.map((m) => ({ role: m.role, content: m.content }))
      );
      if (parsed.length > 0) {
        logSummary = await appendLiveSets(userId, parsed);
      }
    } catch (err) {
      console.error("Live-log parse/append failed:", err);
    }

    const geminiHistory = history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const encoder = new TextEncoder();
    let fullResponse = "";

    // Stick to GA model ids supported by @google/generative-ai v0.24.
    // 2.5-pro has the best instruction-following; 2.5-flash is the fast
    // fallback if pro is overloaded.
    const PRIMARY_MODEL = "gemini-2.5-pro";
    const FALLBACK_MODEL = "gemini-2.5-flash";

    let liveMessage = message;
    if (logSummary && logSummary.summary.length > 0) {
      const logged = logSummary.summary
        .map((e) => {
          const sets = e.sets
            .map((s) => `${s.weight || "BW"}×${s.reps || "?"}`)
            .join(", ");
          return `${e.exerciseName}: ${sets}`;
        })
        .join("; ");
      liveMessage = `${message}\n\n[System note: the app already logged these sets: ${logged}. Reply as a real-time spotter.

NEVER output the words "MODE A", "MODE B", "System note", or any other meta label in your response. Those are instructions to you, not text for the athlete.

FIRST — read the effort signal in the athlete's message VERY carefully. Pay attention to the actual words AND the rep count vs. what a normal working set should look like:

  Signals the load is TOO HEAVY / the set went badly:
    "barely", "grinder", "grinded", "ugly", "almost failed", "failed", "missed", "form broke", "only got 1", "only got 2", a target set that came in well short of the intended reps, or a report of just 1–2 reps on a movement that was meant for 5+.
    → DROP the weight meaningfully (typically 10–20% or back to the last weight they handled cleanly) and/or cut reps. Do NOT push the weight up. Do NOT tell them to move the bar faster. Acknowledge it was too heavy.

  Signals the load was EASY / they're stronger:
    "easy", "flew up", "smoked it", "felt light", "could've done more", hitting more reps than planned with RIR left.
    → Add weight or reps slightly.

  Signals the set was ON TARGET:
    Hit the intended reps with normal effort, "solid", "good", clean reps.
    → Maintain or tiny progression.

Account for exercise order — later exercises are fatigued, don't treat them like set 1. Never recommend grinding to failure.

Format — short, actionable, occasional emoji, no headings, no sign-off, no mode labels:
  One-line read on the set they just did (e.g. "That was too heavy — let's back it off.").
  Then:
  Next set:
  👉 {weight} × {reps}
  Optional one-line reason if it adds value.

Keep the entire reply under ~40 words. Do not restate the numbers they just logged — the ✓ Logged chip shows them.

EXCEPTION — if the athlete's message ALSO contains a real question, planning request, or asks for analysis, switch to a normal full coaching response. Briefly acknowledge the set in one line, then answer the question properly. Still never output mode labels or restate the logged numbers verbatim.]`;
    }

    const tryStream = async (modelName: string) => {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemPrompt,
      });
      const chat = model.startChat({ history: geminiHistory });
      return chat.sendMessageStream(liveMessage);
    };

    const stream = new ReadableStream({
      async start(controller) {
        // Prepend a machine-readable marker line so the client can render
        // a "logged" chip above the coach's reply. The \x1e (RS) sentinel
        // delimits the marker from coach text to avoid collisions with
        // normal prose.
        if (logSummary && logSummary.summary.length > 0) {
          const payload = JSON.stringify({
            workoutId: logSummary.workoutId,
            created: logSummary.created,
            summary: logSummary.summary,
          });
          controller.enqueue(encoder.encode(`[LOGGED]${payload}\x1e`));
        }
        const drainStream = async (
          result: Awaited<ReturnType<typeof tryStream>>
        ) => {
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
              fullResponse += text;
              controller.enqueue(encoder.encode(text));
            }
          }
        };

        const onStreamFailMidReply = () => {
          if (fullResponse.length > 0) {
            controller.enqueue(encoder.encode("[RESET]\x1e"));
            fullResponse = "";
          }
        };

        // Attempt to run an end-to-end stream with a given Gemini model.
        // If it fails mid-reply after partial text has been streamed,
        // emit a [RESET] marker so the client discards the half-reply.
        const runGeminiAttempt = async (modelName: string) => {
          const result = await tryStream(modelName);
          try {
            await drainStream(result);
          } catch (streamErr) {
            onStreamFailMidReply();
            throw streamErr;
          }
        };

        // Ultimate fallback: Claude Haiku via Anthropic. Different API,
        // but same streaming contract — drain tokens into the same
        // controller. System prompt is cached so repeat calls within
        // 5min are much faster on the input side.
        const runAnthropicAttempt = async () => {
          if (!anthropic) throw new Error("Anthropic not configured");
          const claudeMessages: {
            role: "user" | "assistant";
            content: string;
          }[] = [];
          for (const m of geminiHistory) {
            const role = m.role === "model" ? "assistant" : "user";
            const content = m.parts.map((p) => p.text).join("");
            const last = claudeMessages[claudeMessages.length - 1];
            if (last && last.role === role) {
              last.content += "\n\n" + content;
            } else {
              claudeMessages.push({ role, content });
            }
          }
          // Ensure first message is "user" (Anthropic requires it)
          while (claudeMessages.length && claudeMessages[0].role !== "user") {
            claudeMessages.shift();
          }
          const last = claudeMessages[claudeMessages.length - 1];
          if (last && last.role === "user") {
            last.content += "\n\n" + liveMessage;
          } else {
            claudeMessages.push({ role: "user", content: liveMessage });
          }

          try {
            const stream = anthropic.messages.stream({
              model: "claude-haiku-4-5",
              max_tokens: 2048,
              system: [
                {
                  type: "text",
                  text: systemPrompt,
                  cache_control: { type: "ephemeral" },
                },
              ],
              messages: claudeMessages,
            });
            for await (const event of stream) {
              if (
                event.type === "content_block_delta" &&
                event.delta.type === "text_delta"
              ) {
                const text = event.delta.text;
                if (text) {
                  fullResponse += text;
                  controller.enqueue(encoder.encode(text));
                }
              }
            }
          } catch (streamErr) {
            onStreamFailMidReply();
            throw streamErr;
          }
        };

        // Try preview → stable Gemini → Claude Haiku. No same-model retry:
        // if a preview endpoint fails once it usually fails again, and the
        // extra attempt just eats the user's patience. [RESET] marker
        // (emitted on partial-text failure) tells the client to wipe what
        // has streamed so the next attempt replaces it.
        const ATTEMPTS: (() => Promise<void>)[] = [
          () => runGeminiAttempt(PRIMARY_MODEL),
          () => runGeminiAttempt(FALLBACK_MODEL),
        ];
        if (anthropic) ATTEMPTS.push(runAnthropicAttempt);

        let lastErr: unknown = null;
        let succeeded = false;
        try {
          for (let i = 0; i < ATTEMPTS.length; i++) {
            try {
              await ATTEMPTS[i]();
              succeeded = true;
              break;
            } catch (attemptErr) {
              lastErr = attemptErr;
              console.warn(
                `Trainer attempt ${i + 1}/${ATTEMPTS.length} failed:`,
                attemptErr
              );
              if (i < ATTEMPTS.length - 1) {
                await new Promise((r) => setTimeout(r, 250 * (i + 1)));
              }
            }
          }

          if (!succeeded) throw lastErr ?? new Error("All trainer attempts failed");

          await prisma.trainerMessage.create({
            data: { userId, role: "assistant", content: fullResponse },
          });

          controller.close();
        } catch (err) {
          console.error("Trainer stream error:", err);
          const rawMsg = err instanceof Error ? err.message : String(err);
          let hint = "Give it a moment and try again.";
          const lower = rawMsg.toLowerCase();
          if (lower.includes("api key") || lower.includes("api_key") || lower.includes("unauthorized") || lower.includes("401") || lower.includes("permission")) {
            hint = "API key looks invalid or missing — check GEMINI_API_KEY / ANTHROPIC_API_KEY in your deploy env.";
          } else if (lower.includes("quota") || lower.includes("rate") || lower.includes("429") || lower.includes("resource_exhausted")) {
            hint = "Hit an API quota or rate limit — wait a minute, or check your Gemini/Anthropic billing.";
          } else if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("deadline")) {
            hint = "All providers timed out. Try a shorter message, or retry in a moment.";
          } else if (lower.includes("overloaded") || lower.includes("503") || lower.includes("unavailable")) {
            hint = "All providers are overloaded right now. Try again in a minute.";
          }
          const prefix = fullResponse.length > 0 ? "\n\n" : "";
          const errText =
            prefix +
            `⚠️ Coach connection dropped. ${hint}\n\n_Detail: ${rawMsg.slice(0, 200)}_`;
          controller.enqueue(encoder.encode(errText));
          // Persist whatever did stream so the athlete can see partial context
          // on reload; skip if nothing streamed.
          if (fullResponse.trim().length > 0) {
            try {
              await prisma.trainerMessage.create({
                data: {
                  userId,
                  role: "assistant",
                  content: fullResponse + errText,
                },
              });
            } catch (persistErr) {
              console.error("Trainer partial persist failed:", persistErr);
            }
          }
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("Trainer API error:", err);
    const errMsg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: errMsg }, { status: 500 });
  }
}
