"use client";

import {
  createWorkout,
  updateWorkout,
  type CreateWorkoutInput,
} from "@/lib/actions/workouts";
import {
  saveWorkoutDraft,
  loadWorkoutDraft,
  clearWorkoutDraft,
} from "@/lib/actions/workoutDrafts";
import {
  STRENGTH_SPLITS,
  shapeForType,
  labelForType,
  detectSplit,
  isTimedExercise,
  type WorkoutShape,
} from "@/lib/exercises";
import ExerciseLogger from "@/components/ExerciseLogger";
import {
  activityCategory,
  CARDIO_SET_TYPE,
  cardioSpecFor,
  workoutTypeFor,
  defaultCardioInput,
  toCardioMetrics,
  type CardioInput,
} from "@/lib/cardio";
import SessionPartners from "@/components/SessionPartners";
import WorkoutTimerStrip from "@/components/WorkoutTimerStrip";
import LiveHRWidget from "@/components/LiveHRWidget";
import GuidedWarmup, { type WarmupProgress } from "@/components/GuidedWarmup";
import {
  COACH_ADJUST_EVENT,
  COACH_LOG_EVENT,
  applyLoggedSets,
  mergeCoachAdjust,
  type DraftExercise,
  type ReportedExercise,
} from "@/lib/workoutAdjust";
import { useTransition, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

const DRAFT_KEY = "sl:workoutDraft";
// Holds the most recent submit payload while we're offline or while the
// network call is failing. On reconnect we replay it automatically and,
// on success, clear the draft + this key together.
const PENDING_SUBMIT_KEY = "sl:pendingSubmit.v1";

type PendingSubmit = {
  mode: "create" | "edit";
  workoutId?: string;
  payload: CreateWorkoutInput;
  savedAt: number;
};

type SetData = {
  type: "WARMUP" | "WORKING" | "SUPERSET" | "DROP_SET" | "CARDIO";
  setNumber: number;
  weight: string;
  reps: string;
  rir: string;
  notes: string;
  completed?: boolean;
  loggedAt?: string;
  /// A CARDIO row's numbers, as typed. See lib/cardio.ts.
  cardio?: CardioInput;
};

type ExerciseData = {
  exerciseId: string;
  exerciseName: string;
  /// Carried so a custom exercise filed under Cardio gets a cardio card.
  muscleGroup?: string | null;
  notes: string;
  supersetGroup?: string | null;
  sets: SetData[];
};

export type WorkoutFormInitial = {
  id: string;
  title: string;
  type: string;
  split: string | null;
  date: string;
  notes: string;
  feeling: string;
  isDeload: boolean;
  exercises: ExerciseData[];
  duration: number | null;
  distance: number | null;
  pace: string | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  rounds: number | null;
  elevation: number | null;
  incline: number | null;
  speed: number | null;
  level: number | null;
  rpe: number | null;
  startedAt?: string | null;
  endedAt?: string | null;
  warmup?: {
    items: {
      kind?: "cardio" | "mobility" | "activation";
      name: string;
      durationSec?: number;
      reps?: number;
      instructions?: string;
    }[];
  } | null;
  fromCoachPlan?: boolean;
};

function toDateInput(iso: string) {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Indoor machines that log a generic resistance / intensity level instead of
// elevation (bike) or rounds (stair/other machine).
const MACHINE_LEVEL_TYPES = new Set([
  "SPIN",
  "ELLIPTICAL",
  "STAIR_CLIMBER",
  "CARDIO_MACHINE",
]);

function titleFor(type: string, split?: string) {
  if (type === "WEIGHT_TRAINING" || type === "CALISTHENICS") {
    const splitLabel = STRENGTH_SPLITS.find((s) => s.value === split)?.label;
    const base = type === "CALISTHENICS" ? "Calisthenics" : "Weight Training";
    return splitLabel ? `${splitLabel} Day` : base;
  }
  return labelForType(type);
}

export default function WorkoutForm({
  mode,
  initial,
  backHref = "/",
}: {
  mode: "create" | "edit";
  initial?: WorkoutFormInitial;
  backHref?: string;
}) {
  const router = useRouter();
  // Arriving from an invite push lands on /log?session=<id>. The strip reads
  // this to show the partner and to offer Join; the payload carries it so the
  // finished log is tagged to the session.
  const searchParams = useSearchParams();
  // Arriving from an invite push lands on /log?session=<id>, but the CALLER
  // never has it in their URL — they opened the session from the invite button.
  // So it lives in form state and rides along in the draft: without that, the
  // caller's own log saved untagged (every session in the database had one side
  // missing) and a mid-workout reload dropped them out of the session entirely.
  const [jointSessionId, setJointSessionId] = useState<string | null>(
    searchParams.get("session"),
  );
  // The id the page was OPENED with, captured once. Draft restore consults it,
  // and it must not change underneath that — leaving a session rewrites the
  // URL, and a restore racing that would read the id as absent.
  const urlSessionId = useRef<string | null>(searchParams.get("session"));
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<
    "idle" | "saving" | "saved"
  >("idle");
  // Reflects navigator.onLine. The autosave loop and submit handler both
  // adapt: offline saves stay local, submit queues the payload until the
  // browser reports it can reach the network again.
  const [online, setOnline] = useState(true);
  // Set when a submit failed (or was queued offline) so the form can
  // surface a "we'll retry" banner without losing the user's data.
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // There's no "pick a session type" step any more: the log opens straight
  // away and the type is read off what gets logged (see the auto-type effect).
  // Weight training until something says otherwise.
  const [workoutType, setWorkoutType] = useState(initial?.type || "WEIGHT_TRAINING");
  // The type is never picked by hand — it's read off the exercises. Editing a
  // saved workout leaves whatever it was saved as alone.
  const typeLocked = mode === "edit";
  const [split, setSplit] = useState(initial?.split ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [feeling, setFeeling] = useState(initial?.feeling ?? "");
  const [isDeload, setIsDeload] = useState(initial?.isDeload ?? false);
  const [date, setDate] = useState<string>(
    initial ? toDateInput(initial.date) : toDateInput(new Date().toISOString())
  );
  const [exercises, setExercises] = useState<ExerciseData[]>(
    initial?.exercises ?? []
  );

  // Live-workout timer. When startedAt is set the header shows a running clock
  // and the Save button becomes Finish. On save, endedAt is captured and the
  // [startedAt, endedAt] window is used to pull HR samples from Google Health.
  // A workout with endedAt is already finished — editing it must not resurrect
  // the live clock.
  const [startedAt, setStartedAt] = useState<Date | null>(
    initial?.startedAt && !initial?.endedAt
      ? new Date(initial.startedAt)
      : null,
  );

  // Coach-prescribed warmup (cardio + mobility + activation items). Carried
  // through to the workout row on save so the detail page can replay it.
  // State, not a derived constant: the plan arrives once through the
  // sessionStorage handoff, so it has to ride along in the draft or a reload
  // (or a trip to another tab) loses the warm-up entirely.
  const [warmup, setWarmup] = useState<WorkoutFormInitial["warmup"]>(
    initial?.warmup ?? null,
  );
  // How far into that warm-up the athlete has got. Lives here rather than
  // inside GuidedWarmup so it's persisted with everything else.
  const [warmupProgress, setWarmupProgress] = useState<WarmupProgress | null>(
    null,
  );

  // Tapping Start on a cardio card is beginning the workout: if the session
  // clock isn't running yet, it starts at that card's start time — same as
  // "Begin workout", so the header clock, Finish and the HR window all follow.
  useEffect(() => {
    if (mode !== "create" || startedAt) return;
    const starts = exercises
      .flatMap((e) => e.sets)
      .map((st) => (st.cardio?.startedAt ? Date.parse(st.cardio.startedAt) : NaN))
      .filter((t) => Number.isFinite(t));
    if (starts.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStartedAt(new Date(Math.min(...starts)));
  }, [mode, startedAt, exercises]);

  // Drives the elapsed clock in the pinned header. Only ticks while a session
  // is actually running.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  // Shape-specific metrics
  const [durationMin, setDurationMin] = useState(
    initial?.duration ? String(Math.floor(initial.duration / 60)) : ""
  );
  const [durationSec, setDurationSec] = useState(
    initial?.duration ? String(initial.duration % 60) : ""
  );
  const [distance, setDistance] = useState(
    initial?.distance?.toString() ?? ""
  );
  const [pace, setPace] = useState(initial?.pace ?? "");
  const [avgHR, setAvgHR] = useState(initial?.avgHeartRate?.toString() ?? "");
  const [maxHR, setMaxHR] = useState(initial?.maxHeartRate?.toString() ?? "");
  const [rounds, setRounds] = useState(initial?.rounds?.toString() ?? "");
  const [elevation, setElevation] = useState(
    initial?.elevation?.toString() ?? ""
  );
  // Indoor cardio machine settings: treadmill incline % + speed (km/h), and a
  // generic resistance/intensity level for bike / elliptical / stair.
  const [incline, setIncline] = useState(initial?.incline?.toString() ?? "");
  const [speed, setSpeed] = useState(initial?.speed?.toString() ?? "");
  const [level, setLevel] = useState(initial?.level?.toString() ?? "");
  const [rpe, setRpe] = useState(initial?.rpe?.toString() ?? "");

  // Draft persistence (create mode only). Hydrates whatever the user had in
  // progress so they don't lose work when navigating to the exercise library
  // to add a custom exercise, etc. Cleared on successful save.
  const hydratedRef = useRef(false);

  const applyDraft = (d: Record<string, unknown>) => {
    if (typeof d.workoutType === "string" && d.workoutType) {
      setWorkoutType(d.workoutType);
    }
    // The URL wins. Arriving at /log?session=<id> is the athlete saying which
    // session they're in right now; the draft is a memory of the last one. Let
    // the draft overwrite it and leaving one session to join another silently
    // re-attaches you to the one you left.
    if (typeof d.sessionId === "string" && !urlSessionId.current) {
      setJointSessionId(d.sessionId);
    }
    if (typeof d.split === "string") setSplit(d.split);
    if (typeof d.title === "string") setTitle(d.title);
    if (typeof d.notes === "string") setNotes(d.notes);
    if (typeof d.feeling === "string") setFeeling(d.feeling);
    if (typeof d.isDeload === "boolean") setIsDeload(d.isDeload);
    if (typeof d.date === "string") setDate(d.date);
    if (Array.isArray(d.exercises)) setExercises(d.exercises as ExerciseData[]);
    if (typeof d.durationMin === "string") setDurationMin(d.durationMin);
    if (typeof d.durationSec === "string") setDurationSec(d.durationSec);
    if (typeof d.distance === "string") setDistance(d.distance);
    if (typeof d.pace === "string") setPace(d.pace);
    if (typeof d.avgHR === "string") setAvgHR(d.avgHR);
    if (typeof d.maxHR === "string") setMaxHR(d.maxHR);
    if (typeof d.rounds === "string") setRounds(d.rounds);
    if (typeof d.elevation === "string") setElevation(d.elevation);
    if (typeof d.incline === "string") setIncline(d.incline);
    if (typeof d.speed === "string") setSpeed(d.speed);
    if (typeof d.level === "string") setLevel(d.level);
    if (typeof d.rpe === "string") setRpe(d.rpe);
    if (typeof d.startedAt === "string") setStartedAt(new Date(d.startedAt));
    // Restore the prescribed warm-up and the athlete's position in it. Both
    // are optional — drafts written before this existed simply have neither.
    if (d.warmup && typeof d.warmup === "object") {
      setWarmup(d.warmup as WorkoutFormInitial["warmup"]);
    }
    if (d.warmupProgress && typeof d.warmupProgress === "object") {
      setWarmupProgress(d.warmupProgress as WarmupProgress);
    }
  };

  useEffect(() => {
    if (mode !== "create" || hydratedRef.current) return;
    hydratedRef.current = true;
    // Skip rehydration if the form was seeded from an external source
    // (e.g. voice-logged draft); we don't want to clobber that.
    if (initial) return;

    // Instant restore from localStorage — works offline, zero latency.
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) applyDraft(JSON.parse(raw));
    } catch {
      // ignore malformed draft
    }

    // Server draft — authoritative across devices/browsers. Overlay if present.
    loadWorkoutDraft()
      .then((d) => {
        if (d) {
          applyDraft(d as unknown as Record<string, unknown>);
          // Reset baseline after the async overlay so an unedited restored
          // draft doesn't immediately trigger a redundant re-save.
          baselineRef.current = null;
        }
      })
      .catch(() => {
        // ignore — localStorage is the fallback
      });
  }, [mode, initial]);

  const serverSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const discardDraft = () => {
    if (
      !confirm(
        "Clear this workout? Your logged sets will be erased and you'll go back to the start."
      )
    )
      return;
    if (serverSaveTimer.current) clearTimeout(serverSaveTimer.current);
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
    clearWorkoutDraft().catch(() => {});
    setAutosaveStatus("idle");
    setSplit("");
    setNotes("");
    setFeeling("");
    setIsDeload(false);
    setExercises([]);
    setDurationMin("");
    setDurationSec("");
    setDistance("");
    setPace("");
    setAvgHR("");
    setMaxHR("");
    setRounds("");
    setElevation("");
    setIncline("");
    setSpeed("");
    setLevel("");
    setRpe("");
    setWarmup(null);
    setWarmupProgress(null);
    setWorkoutType("WEIGHT_TRAINING");
    setTitle("");
    baselineRef.current = null;
  };

  // Snapshot of the state at the moment the form first settled (whether
  // from a clone template, voice draft, or restored server draft). We
  // only autosave once the user has actually *changed* something — this
  // stops a cloned "Do this workout" from persisting as the user's draft
  // forever just because they opened the page.
  const baselineRef = useRef<string | null>(null);
  useEffect(() => {
    if (mode !== "create" || !hydratedRef.current) return;
    const draft = {
      workoutType,
      sessionId: jointSessionId,
      split,
      title,
      notes,
      feeling,
      isDeload,
      date,
      exercises,
      durationMin,
      durationSec,
      distance,
      pace,
      avgHR,
      maxHR,
      rounds,
      elevation,
      incline,
      speed,
      level,
      rpe,
      startedAt: startedAt ? startedAt.toISOString() : null,
      warmup,
      warmupProgress,
    };
    const serialized = JSON.stringify(draft);

    // First pass after hydration: capture baseline, save nothing yet.
    if (baselineRef.current === null) {
      baselineRef.current = serialized;
      return;
    }
    // No real change since baseline — user is just browsing the template.
    if (serialized === baselineRef.current) return;

    // The type and title fill themselves in now, so they don't make a draft
    // worth keeping — only a title the athlete typed does.
    const empty =
      !split &&
      (!title || title === titleFor(workoutType)) &&
      !notes &&
      exercises.length === 0 &&
      !startedAt &&
      !warmup &&
      !durationMin &&
      !durationSec &&
      !distance;
    try {
      if (empty) localStorage.removeItem(DRAFT_KEY);
      else localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // storage may be unavailable (private mode, quota); ignore
    }

    // Debounced server autosave — survives storage eviction + device switch.
    if (serverSaveTimer.current) clearTimeout(serverSaveTimer.current);
    if (empty) {
      setAutosaveStatus("idle");
      clearWorkoutDraft().catch(() => {});
      return;
    }
    if (!navigator.onLine) {
      // Local mirror is enough while offline — flag as saved so the user
      // doesn't see a permanent "Saving…" spinner. Once we're back online
      // the next change triggers a real server save.
      setAutosaveStatus("saved");
      return;
    }
    setAutosaveStatus("saving");
    serverSaveTimer.current = setTimeout(() => {
      saveWorkoutDraft(draft)
        .then(() => setAutosaveStatus("saved"))
        .catch(() => setAutosaveStatus("idle"));
    }, 800);
  }, [
    mode,
    workoutType,
    // The session id has to re-save the draft on its own: an athlete who
    // invites someone and then logs nothing else would otherwise have a draft
    // that doesn't know about the session, and a reload would drop them out.
    jointSessionId,
    split,
    title,
    notes,
    feeling,
    isDeload,
    date,
    exercises,
    durationMin,
    durationSec,
    distance,
    pace,
    avgHR,
    maxHR,
    rounds,
    elevation,
    incline,
    speed,
    level,
    rpe,
    startedAt,
    warmup,
    warmupProgress,
  ]);

  // The coach rewriting THIS session, live. When the athlete tells the coach
  // mid-workout that a set didn't go to plan ("only got 6 of the 8"), it
  // replies with an adjustment rather than a whole new prescription — and
  // this is where that lands. The event is dispatched synchronously, so
  // flipping `handled` tells the coach a form was mounted to receive it and
  // it doesn't need to fall back to rewriting the stored draft.
  //
  // Edit mode and an untouched form are deliberately excluded: an
  // adjustment needs a session in progress to adjust, and a form still on
  // the type picker isn't one.
  useEffect(() => {
    if (mode !== "create" || !workoutType) return;
    const onAdjust = (e: Event) => {
      const detail = (e as CustomEvent<{
        exercises?: DraftExercise[];
        handled?: boolean;
      }>).detail;
      if (!detail || !Array.isArray(detail.exercises)) return;
      const incoming = detail.exercises;
      setExercises(
        (cur) => mergeCoachAdjust(cur as DraftExercise[], incoming) as ExerciseData[],
      );
      detail.handled = true;
    };
    window.addEventListener(COACH_ADJUST_EVENT, onAdjust);
    return () => window.removeEventListener(COACH_ADJUST_EVENT, onAdjust);
  }, [mode, workoutType]);

  // Sets the athlete reported to the coach in chat and confirmed. They land
  // on this form's sets rather than in a standalone workout of their own —
  // each one filling the next unticked slot for that lift, with the numbers
  // actually achieved.
  useEffect(() => {
    if (mode !== "create" || !workoutType) return;
    const onLog = (e: Event) => {
      const detail = (e as CustomEvent<{
        parsed?: ReportedExercise[];
        handled?: boolean;
      }>).detail;
      if (!detail || !Array.isArray(detail.parsed) || detail.parsed.length === 0)
        return;
      const reported = detail.parsed;
      setExercises(
        (cur) => applyLoggedSets(cur as DraftExercise[], reported) as ExerciseData[],
      );
      detail.handled = true;
    };
    window.addEventListener(COACH_LOG_EVENT, onLog);
    return () => window.removeEventListener(COACH_LOG_EVENT, onLog);
  }, [mode, workoutType]);

  // Everything is logged as exercise cards now — a hike is a Hike card, not a
  // distance form — so the type is only a label. The one exception is editing
  // an old run/hike/class saved before cards existed: those have no exercises,
  // only workout-level distance/duration, and keep their original form.
  const legacyShape: WorkoutShape | null =
    mode === "edit" && (initial?.exercises?.length ?? 0) === 0 && initial?.type
      ? shapeForType(initial.type)
      : null;
  const shape: WorkoutShape =
    legacyShape && legacyShape !== "STRENGTH" ? legacyShape : "STRENGTH";

  /// A lift taken from someone else's plan: their loads are theirs, so it
  /// starts with one empty working set and the logger fills in this athlete's
  /// own last-session hints per lift.
  const blankExerciseFor = (it: {
    exerciseId: string;
    exerciseName: string;
  }): ExerciseData => {
    const spec = cardioSpecFor(it.exerciseName);
    return {
      exerciseId: it.exerciseId,
      exerciseName: it.exerciseName,
      notes: "",
      sets: [
        {
          type: spec ? CARDIO_SET_TYPE : ("WORKING" as const),
          setNumber: 1,
          weight: "",
          reps: "",
          rir: "",
          notes: "",
          cardio: spec ? defaultCardioInput(spec) : undefined,
        },
      ],
    };
  };

  // Walking out of a session has to take ?session= with it, or a refresh drops
  // the athlete straight back into the invite they just left. history.replaceState
  // rather than router.replace: this is a URL tidy-up, and a real navigation
  // would remount the form and take the half-logged session with it.
  const clearSessionParam = () => {
    setJointSessionId(null);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("session")) return;
    url.searchParams.delete("session");
    window.history.replaceState(null, "", url.pathname + url.search);
  };

  // Accepting an invite from the type picker should open the log, not leave
  // the athlete staring at a list of session types — they were invited to a
  // specific workout and already said yes. The caller's own type is the best
  // guess; weight training is the fallback when their draft hasn't got one yet.
  /// Has anything real been logged yet? A restored draft can carry a full list
  /// of lifts with not a single number in it — that's a leftover, not work.
  /// Telling the two apart is what decides whether accepting an invite may
  /// replace what's on screen.
  const hasLoggedWork = exercises.some((e) =>
    e.sets.some(
      (st) =>
        st.completed ||
        st.loggedAt ||
        st.weight.trim() !== "" ||
        st.reps.trim() !== "",
    ),
  );

  /// Sessions whose plan has already been handed over, so it happens once and
  /// never again. The plan arrives on a five-second poll; re-applying it would
  /// bulldoze every edit the athlete makes for as long as they're in the
  /// session.
  const planApplied = useRef<Set<string>>(new Set());

  /// Take on the session's workout. Called however the athlete got here —
  /// tapping Join in the logger, accepting on the feed, or simply being a
  /// member already when the page loaded. That last route is how Morgan ended
  /// up in her own leftover push day while attached to a lower day: joining on
  /// the feed fires no join event in the logger, so nothing ever handed her
  /// the plan.
  const applySessionPlan = (
    sessionKey: string | null,
    planType: string | null,
    planSplit: string | null,
    plan: { exerciseId: string; exerciseName: string }[],
  ) => {
    if (sessionKey) {
      if (planApplied.current.has(sessionKey)) return;
      planApplied.current.add(sessionKey);
    }
    handleJoinedSession(planType, planSplit, plan);
  };

  const handleJoinedSession = (
    planType: string | null,
    planSplit: string | null,
    plan: { exerciseId: string; exerciseName: string }[],
  ) => {
    // Accepting has to work mid-log too. An invitee with a leftover draft
    // opens straight into it — and that is
    // exactly the athlete who ends up in the wrong workout: they accepted a
    // lower day and sat in yesterday's unsaved push day, with no way across.
    const type = planType || "WEIGHT_TRAINING";
    if (!hasLoggedWork) {
      if (planSplit) setSplit(planSplit);
      setWorkoutType(type);
      setTitle(titleFor(type, planSplit || split));
      if (plan.length > 0) setExercises(plan.map(blankExerciseFor));
    }
    // Mid-session with real sets down, the invite doesn't get to rewrite the
    // log — "add their lifts" in the strip is how that athlete crosses over.
  };

  const splitDrivesTitle =
    workoutType === "WEIGHT_TRAINING" || workoutType === "CALISTHENICS";

  // The session type, read off what's logged: any lift makes it weight
  // training; otherwise it's the first activity's type (a lone Hike files as
  // Hiking). A one-activity session is titled after the activity ("Tennis"),
  // unless the athlete has typed a title of their own.
  useEffect(() => {
    if (typeLocked) return;
    // Nothing logged yet: no title. Clearing the last exercise clears an
    // auto title too, so an empty session reads as empty.
    if (exercises.length === 0) {
      const auto =
        title === titleFor(workoutType, split) ||
        title === titleFor(workoutType) ||
        title === titleFor(workoutType, "");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (title && auto) setTitle("");
      if (workoutType !== "WEIGHT_TRAINING") setWorkoutType("WEIGHT_TRAINING");
      if (split) setSplit("");
      return;
    }
    const lifting = exercises.some(
      (e) => activityCategory(e.exerciseName, e.muscleGroup) === "lifting",
    );
    const next = lifting
      ? "WEIGHT_TRAINING"
      : workoutTypeFor(exercises[0].exerciseName, exercises[0].muscleGroup);
    const names = [...new Set(exercises.map((e) => e.exerciseName))];
    const autoTitle = lifting ? titleFor(next, split) : names.length === 1 ? names[0] : titleFor(next);
    const titleIsAuto =
      title === "" ||
      title === titleFor(workoutType, split) ||
      title === titleFor(workoutType) ||
      exercises.some((e) => e.exerciseName === title);
    if (next !== workoutType) setWorkoutType(next);
    if (titleIsAuto && title !== autoTitle) setTitle(autoTitle);
  }, [exercises, typeLocked, workoutType, split, title]);

  // Auto-detect split from the exercises the user added — runs in both
  // create and edit so swapping or removing an exercise re-derives the
  // session split (and the title) on the fly.
  useEffect(() => {
    if (shape !== "STRENGTH") return;
    const detected = detectSplit(exercises.map((e) => e.exerciseName));
    if (!detected || detected === split) return;
    setSplit(detected);
    // Only overwrite the title if it still matches an auto-generated label
    // for the current split or type — never clobber a name the user typed.
    if (splitDrivesTitle) {
      const isAutoTitle =
        title === "" ||
        title === titleFor(workoutType, split) ||
        title === titleFor(workoutType);
      if (isAutoTitle) setTitle(titleFor(workoutType, detected));
    }
  }, [exercises, shape, workoutType, split, splitDrivesTitle, title]);

  // Strength sets with weight but missing reps block save
  const missingRepsCount =
    shape === "STRENGTH"
      ? exercises.reduce((count, ex) => {
          // Timed holds (plank, hang) use the "reps" field as seconds and have
          // no red-highlighted reps input, so gating save on missing reps here
          // would strand the user with a disabled Save and nothing to fix.
          if (isTimedExercise(ex.exerciseName)) return count;
          return (
            count +
            ex.sets.filter(
              (s) =>
                s.type === "WORKING" &&
                s.weight.trim() !== "" &&
                parseFloat(s.weight) > 0 &&
                s.reps.trim() === ""
            ).length
          );
        }, 0)
      : 0;

  // Live totals for the pinned header. Strength only: a run has no set count,
  // and "lb moved" is meaningless on a bike. Warm-ups are excluded from the
  // count for the same reason they carry no tick — they aren't the work.
  const sessionStats = (() => {
    if (shape !== "STRENGTH") return null;
    let done = 0;
    let total = 0;
    let tonnage = 0;
    for (const ex of exercises) {
      // A hold stores SECONDS in `reps`, so weight x reps on a 45-second
      // farmer carry with 100 lb would book 4,500 lb that was never lifted.
      // Its sets still count toward progress — only the tonnage is skipped.
      const timed = isTimedExercise(ex.exerciseName);
      for (const s of ex.sets) {
        // A treadmill bout isn't a set; the header counts sets.
        if (s.type === "WARMUP" || s.type === CARDIO_SET_TYPE) continue;
        total++;
        if (!s.completed) continue;
        done++;
        if (timed) continue;
        const w = parseFloat(s.weight);
        const r = parseInt(s.reps, 10);
        if (Number.isFinite(w) && Number.isFinite(r)) tonnage += w * r;
      }
    }
    return { done, total, tonnage };
  })();

  const elapsedLabel = (() => {
    if (!startedAt) return null;
    const secs = Math.max(
      0,
      Math.floor((nowTick - startedAt.getTime()) / 1000)
    );
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
  })();

  const canSave = (() => {
    if (!title) return false;
    if (shape === "STRENGTH") {
      return exercises.length > 0 && missingRepsCount === 0;
    }
    if (shape === "DISTANCE") {
      return (
        (distance && parseFloat(distance) > 0) ||
        (durationMin && parseInt(durationMin) > 0)
      );
    }
    if (shape === "DURATION") {
      return (
        (durationMin && parseInt(durationMin) > 0) ||
        (durationSec && parseInt(durationSec) > 0)
      );
    }
    return false;
  })();

  const handleSave = () => {
    if (!canSave) return;
    setPending(true);

    const durationSeconds =
      (parseInt(durationMin || "0") || 0) * 60 +
      (parseInt(durationSec || "0") || 0);

    const payload: CreateWorkoutInput = {
      title,
      // Tags this log as half of a joint session. The server re-checks
      // membership before trusting it.
      sessionId: jointSessionId,
      type: workoutType,
      split: shape === "STRENGTH" ? split || null : null,
      date: new Date(`${date}T12:00:00`).toISOString(),
      notes: notes || undefined,
      feeling: feeling || undefined,
      isDeload,
      duration: durationSeconds > 0 ? durationSeconds : null,
      distance:
        shape === "DISTANCE" && distance ? parseFloat(distance) : null,
      pace: shape === "DISTANCE" && pace ? pace : null,
      avgHeartRate: avgHR ? parseInt(avgHR) : null,
      maxHeartRate: maxHR ? parseInt(maxHR) : null,
      rounds: shape === "DURATION" && rounds ? parseInt(rounds) : null,
      elevation:
        shape === "DISTANCE" && elevation ? parseInt(elevation) : null,
      // Treadmill-only settings; resistance level applies to the indoor
      // machines. Gated by type so values don't linger when switching types.
      incline:
        workoutType === "TREADMILL" && incline ? parseFloat(incline) : null,
      speed: workoutType === "TREADMILL" && speed ? parseFloat(speed) : null,
      level: MACHINE_LEVEL_TYPES.has(workoutType) && level ? parseInt(level) : null,
      rpe: rpe ? parseInt(rpe) : null,
      startedAt: startedAt ? startedAt.toISOString() : null,
      endedAt: startedAt ? new Date().toISOString() : null,
      warmup: warmup ?? null,
      exercises:
        shape === "STRENGTH"
          ? exercises.map((ex, i) => ({
              exerciseId: ex.exerciseId,
              order: i,
              notes: ex.notes || undefined,
              supersetGroup: ex.supersetGroup ?? null,
              sets: ex.sets.map((s) => {
                const spec = cardioSpecFor(ex.exerciseName, ex.muscleGroup);
                // A cardio card's rows save as cardio however they arrived —
                // the coach, voice or a partner's plan can hand one over as a
                // plain WORKING set. Only a row that already holds lift
                // numbers (an old Battle Ropes log being edited) keeps them.
                const asCardio =
                  s.type === CARDIO_SET_TYPE ||
                  (!!spec && (!!s.cardio || (!s.weight && !s.reps)));
                if (asCardio) {
                  return {
                    type: CARDIO_SET_TYPE,
                    setNumber: s.setNumber,
                    metrics: spec ? toCardioMetrics(spec, s.cardio ?? {}) : null,
                    notes: s.notes || undefined,
                    loggedAt: s.loggedAt ?? null,
                  };
                }
                return {
                  type: s.type,
                  setNumber: s.setNumber,
                  weight: s.weight ? parseFloat(s.weight) : undefined,
                  reps: s.reps ? parseInt(s.reps) : undefined,
                  rir: s.rir ? parseInt(s.rir) : undefined,
                  notes: s.notes || undefined,
                  loggedAt: s.loggedAt ?? null,
                };
              }),
            }))
          : [],
    };

    submitPayload(payload);
  };

  // Persist the in-flight submit so we can replay it on reconnect, then
  // call the server action. On success we clear all drafts and route the
  // user to the new/updated workout. On failure we leave drafts intact
  // and surface a banner — no data loss when wifi drops mid-set.
  const submitPayload = (payload: CreateWorkoutInput) => {
    setSubmitError(null);
    setPending(true);

    const pending: PendingSubmit = {
      mode,
      workoutId: mode === "edit" ? initial?.id : undefined,
      payload,
      savedAt: Date.now(),
    };
    try {
      localStorage.setItem(PENDING_SUBMIT_KEY, JSON.stringify(pending));
    } catch {
      // ignore quota errors — best effort
    }

    if (!navigator.onLine) {
      setPending(false);
      setSubmitError("offline");
      setAutosaveStatus("saved");
      return;
    }

    startTransition(async () => {
      try {
        const result =
          mode === "edit" && initial
            ? await updateWorkout(initial.id, payload)
            : await createWorkout(payload);

        // Server confirmed the write — safe to clear every draft surface.
        try {
          localStorage.removeItem(DRAFT_KEY);
          localStorage.removeItem(PENDING_SUBMIT_KEY);
        } catch {
          // ignore
        }
        if (serverSaveTimer.current) clearTimeout(serverSaveTimer.current);
        if (mode === "create") {
          await clearWorkoutDraft().catch(() => {});
        }

        const id = result?.workoutId ?? (mode === "edit" ? initial?.id : null);

        // If this workout came from a coach-prescribed plan, kick off
        // the auto-analysis in the background so the next time the
        // athlete opens the coach chat, the review is already there.
        // Fire-and-forget — never block navigation on it.
        if (mode === "create" && id && initial?.fromCoachPlan) {
          fetch("/api/trainer/analyze-workout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workoutId: id }),
            keepalive: true,
          }).catch(() => {});
        }

        // Live-timed workout — sync Fitbit HR for [startedAt, endedAt] in the
        // background. Endpoint is a no-op if the user hasn't connected Fitbit,
        // so it's safe to always call. Fire-and-forget; never blocks navigation.
        if (id && startedAt) {
          fetch(`/api/workouts/${id}/sync-hr`, {
            method: "POST",
            keepalive: true,
          }).catch(() => {});
        }

        if (id) router.push(`/workout/${id}`);
      } catch (err) {
        // Drafts stay intact — the user can edit and re-submit, or we'll
        // auto-replay when navigator goes back online.
        // An expired session makes the action come back as the /login page
        // ("unexpected response"), which no retry can fix. /login redirects
        // only when signed in, so a plain 200 there means we're signed out.
        const signedOut = await fetch("/login", { redirect: "manual" })
          .then((r) => r.type !== "opaqueredirect" && r.ok)
          .catch(() => false);
        setSubmitError(
          signedOut
            ? "signed-out"
            : err instanceof Error && err.message
              ? err.message
              : "Couldn't reach the server"
        );
      } finally {
        setPending(false);
      }
    });
  };

  // Auto-replay a queued submit as soon as we go back online. The
  // PENDING_SUBMIT_KEY is written before each network attempt, so this
  // also recovers from a crashed/closed tab — opening the form on any
  // device with the same logged-in user picks the queued submit back up.
  useEffect(() => {
    if (!online) return;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(PENDING_SUBMIT_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    let parsed: PendingSubmit | null = null;
    try {
      parsed = JSON.parse(raw) as PendingSubmit;
    } catch {
      try {
        localStorage.removeItem(PENDING_SUBMIT_KEY);
      } catch {
        // ignore
      }
      return;
    }
    // Only replay submits that originated in this same form instance —
    // a queued create from another tab shouldn't fire on an edit page.
    if (parsed.mode !== mode) return;
    if (mode === "edit" && parsed.workoutId !== initial?.id) return;
    if (pending) return;
    submitPayload(parsed.payload);
    // We intentionally don't depend on submitPayload to avoid resubmit
    // loops when its identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  // STEP 1: Pick type
  return (
    <div className="max-w-lg mx-auto px-4 pt-8">
      {/* Pinned so the clock, the session's progress and Finish stay reachable
          from anywhere in a long log, instead of scrolling off after the first
          exercise. Negative margins let it span the page gutter. */}
      <div
        className="sticky z-30 -mx-4 px-4 pb-3 mb-5"
        style={{
          top: 0,
          // Installed to the home screen the viewport starts behind the status
          // bar, so a header stuck to top:0 paints under the clock and
          // battery. Pad by the inset so the background fills that strip and
          // the content clears it — then pull the same amount back off the top
          // margin, because the dashboard layout has already offset the page
          // by the inset and we'd otherwise leave a second gap at rest.
          marginTop: "calc(-1 * env(safe-area-inset-top, 0px))",
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.5rem)",
          background: "var(--bg)",
          borderBottom: "1px solid var(--border)",
        }}
      >
      <div className="flex items-center gap-2">
        {mode === "create" ? (
          <Link
            href={backHref}
            aria-label="Back"
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--fg-muted)",
            }}
          >
            <BackIcon />
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--fg-muted)",
            }}
          >
            <BackIcon />
          </button>
        )}
        <div className="flex-1 min-w-0">
          {exercises.length === 0 && !title ? (
            // Nothing logged yet, so nothing to name: the title appears (and
            // fills itself in) with the first exercise.
            <p className="label" style={{ color: "var(--fg-dim)" }}>New session</p>
          ) : (
          <>
          <p className="label">{labelForType(workoutType)}</p>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Session"
            aria-label="Workout title"
            className="text-[18px] font-bold tracking-tight leading-none mt-0.5 w-full bg-transparent border-0 outline-none p-0 truncate"
            style={{ color: "var(--fg)" }}
          />
          </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {mode === "create" && autosaveStatus !== "idle" && (
            <span
              className="text-[10px] label"
              style={{
                color:
                  autosaveStatus === "saved"
                    ? "var(--accent)"
                    : "var(--fg-dim)",
              }}
            >
              {autosaveStatus === "saving" ? "Saving…" : "Auto-saved"}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={!canSave || pending}
            className="btn-accent px-4 py-2 rounded-xl text-[13px]"
          >
            {pending ? "Saving…" : startedAt ? "Finish" : "Save"}
          </button>
        </div>
      </div>

      {/* Live session line. Only while the clock runs, and only where the
          numbers mean something — a run has no sets to count. */}
      {startedAt && (
        <div className="mt-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <div className="flex items-baseline gap-2.5 min-w-0">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0 self-center pulse-accent"
                style={{ background: "var(--accent)" }}
              />
              <span
                className="nums text-[20px] font-semibold tracking-tight leading-none"
                style={{ fontFamily: "var(--font-geist-mono)" }}
              >
                {elapsedLabel}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (
                    confirm("Discard the workout timer? Set/rep entries stay.")
                  )
                    setStartedAt(null);
                }}
                className="label text-[9px] underline underline-offset-2 shrink-0"
                style={{ color: "var(--fg-dim)" }}
              >
                Cancel
              </button>
            </div>
            {sessionStats && sessionStats.total > 0 && (
              <span
                className="nums text-[11px] shrink-0"
                style={{
                  color: "var(--fg-dim)",
                  fontFamily: "var(--font-geist-mono)",
                }}
              >
                <span style={{ color: "var(--fg-muted)" }}>
                  {sessionStats.done}/{sessionStats.total}
                </span>{" "}
                sets
                {sessionStats.tonnage > 0 && (
                  <>
                    {" · "}
                    <span style={{ color: "var(--fg-muted)" }}>
                      {Math.round(sessionStats.tonnage).toLocaleString("en-US")}
                    </span>{" "}
                    lb
                  </>
                )}
              </span>
            )}
          </div>
          {sessionStats && sessionStats.total > 0 && (
            <div
              className="mt-2 rounded-full overflow-hidden"
              style={{ height: 2, background: "var(--border)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(sessionStats.done / sessionStats.total) * 100}%`,
                  background: "var(--accent)",
                }}
              />
            </div>
          )}
        </div>
      )}
      </div>

      {warmup && warmup.items.length > 0 && (
        <GuidedWarmup
          items={warmup.items}
          // Beginning the warm-up starts the session clock — no separate
          // "Begin workout" tap. Guard so replaying the warm-up doesn't
          // reset an already-running timer.
          onStart={() => setStartedAt((cur) => cur ?? new Date())}
          progress={warmupProgress}
          onProgressChange={setWarmupProgress}
        />
      )}

      {/* Only the "Begin workout" state now, and only when there's no warm-up
          to start the clock for us. Once running, the pinned header carries
          the clock and its Cancel, so the strip would just repeat itself. */}
      {!startedAt && !(warmup && warmup.items.length > 0) && (
        <WorkoutTimerStrip
          startedAt={null}
          onBegin={() => setStartedAt(new Date())}
          onCancel={() => setStartedAt(null)}
        />
      )}

      {startedAt && <LiveHRWidget />}

      {(submitError || !online) && (
        <div
          className="mb-3 px-4 py-2.5 rounded-xl flex items-center gap-2.5"
          style={{
            background: "rgba(234,179,8,0.08)",
            border: "1px solid rgba(234,179,8,0.25)",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#facc15"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
          >
            <path d="M2 8.5A11 11 0 0 1 22 8.5" />
            <path d="M5 12.5A7 7 0 0 1 19 12.5" />
            <path d="M8.5 16.5a3 3 0 0 1 7 0" />
            <path d="m4 4 16 16" />
          </svg>
          <p className="text-[12px]" style={{ color: "#facc15" }}>
            {!online ? (
              "Offline — your sets are saved locally and will sync as soon as you're back online."
            ) : submitError === "signed-out" ? (
              <>
                You were signed out, so this didn&rsquo;t save. It&rsquo;s kept
                on this phone —{" "}
                <a href="/login" className="underline">
                  sign in
                </a>{" "}
                and tap + to finish saving it.
              </>
            ) : (
              `Save didn't go through (${submitError}). We'll retry automatically.`
            )}
          </p>
        </div>
      )}

      {missingRepsCount > 0 && (
        <div
          className="mb-3 px-4 py-2.5 rounded-xl flex items-center gap-2.5"
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#f87171"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <p className="text-[12px] leading-snug" style={{ color: "#fca5a5" }}>
            <span className="font-semibold">
              {missingRepsCount} set{missingRepsCount === 1 ? "" : "s"} missing
              reps.
            </span>{" "}
            Fill them in to save.
          </p>
        </div>
      )}

      {/* A coach-prescribed session is for right now — it was built from
          today's plan and the athlete is standing in the gym holding it. The
          date picker and its Today/Yesterday shortcuts are only noise there,
          so they're left out. The date still saves as today, set by
          /api/coach-plan. Same once the clock is running: a live session is
          happening today, so there's no date to pick. */}
      {!initial?.fromCoachPlan && !startedAt && (
        <DateSelector date={date} setDate={setDate} />
      )}

      <div className="space-y-2.5 mb-6">
        {shape === "STRENGTH" && split && (
          <div className="flex items-center gap-2">
            <span
              className="label"
              style={{ color: "var(--fg-dim)" }}
            >
              Split
            </span>
            <span
              className="px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide uppercase"
              style={{
                background: "var(--accent-dim)",
                border: "1px solid rgba(34,197,94,0.35)",
                color: "var(--accent)",
              }}
            >
              {STRENGTH_SPLITS.find((s) => s.value === split)?.label ?? split}
            </span>
            <span
              className="text-[10px]"
              style={{ color: "var(--fg-dim)" }}
            >
              auto
            </span>
          </div>
        )}

        {/* Shape-specific metrics */}
        {shape === "DISTANCE" && (
          <DistanceMetrics
            workoutType={workoutType}
            distance={distance}
            setDistance={setDistance}
            durationMin={durationMin}
            setDurationMin={setDurationMin}
            durationSec={durationSec}
            setDurationSec={setDurationSec}
            pace={pace}
            setPace={setPace}
            elevation={elevation}
            setElevation={setElevation}
            incline={incline}
            setIncline={setIncline}
            speed={speed}
            setSpeed={setSpeed}
            level={level}
            setLevel={setLevel}
            avgHR={avgHR}
            setAvgHR={setAvgHR}
            maxHR={maxHR}
            setMaxHR={setMaxHR}
          />
        )}

        {shape === "DURATION" && (
          <DurationMetrics
            durationMin={durationMin}
            setDurationMin={setDurationMin}
            durationSec={durationSec}
            setDurationSec={setDurationSec}
            rounds={rounds}
            setRounds={setRounds}
            rpe={rpe}
            setRpe={setRpe}
            level={level}
            setLevel={setLevel}
            avgHR={avgHR}
            setAvgHR={setAvgHR}
            maxHR={maxHR}
            setMaxHR={setMaxHR}
            showRounds={
              workoutType === "HIIT" || workoutType === "COMBAT"
            }
            showLevel={MACHINE_LEVEL_TYPES.has(workoutType)}
          />
        )}

        {shape === "STRENGTH" && (
          <label className="flex items-center justify-between cursor-pointer py-1">
            <span
              className="text-[13px]"
              style={{ color: "var(--fg-muted)" }}
            >
              Deload week
            </span>
            <button
              type="button"
              onClick={() => setIsDeload(!isDeload)}
              className="w-10 h-6 rounded-full relative transition-colors"
              style={{
                background: isDeload
                  ? "var(--accent)"
                  : "var(--border-strong)",
              }}
            >
              <div
                className="w-4 h-4 rounded-full absolute top-1 transition-transform"
                style={{
                  background: "#fff",
                  transform: isDeload
                    ? "translateX(22px)"
                    : "translateX(4px)",
                }}
              />
            </button>
          </label>
        )}
      </div>

      {/* Who you're lifting with. Only on a live strength session — there's
          nobody to sync with when you're back-filling last Tuesday. */}
      {shape === "STRENGTH" && mode === "create" && (
        <SessionPartners
          sessionId={jointSessionId}
          plan={exercises.map((e) => ({
            exerciseId: e.exerciseId,
            exerciseName: e.exerciseName,
          }))}
          onAdoptPlan={(items) => {
            // Append what isn't already there rather than replacing. Replacing
            // is only safe on an untouched log, and this button exists for the
            // case that isn't — someone mid-session who wants their partner's
            // lifts alongside their own.
            const have = new Set(exercises.map((e) => e.exerciseId));
            const missing = items.filter((it) => !have.has(it.exerciseId));
            if (missing.length > 0) {
              setExercises([...exercises, ...missing.map(blankExerciseFor)]);
            }
          }}
          onJoined={handleJoinedSession}
          onPlanAvailable={applySessionPlan}
          onSession={setJointSessionId}
          onLeft={clearSessionParam}
        />
      )}

      {shape === "STRENGTH" && (
        <ExerciseLogger
          exercises={exercises}
          setExercises={setExercises}
        />
      )}

      {/* Whole-session voice logging, offered quietly under the empty log —
          Add exercise is the main way in. */}
      {mode === "create" && shape === "STRENGTH" && exercises.length === 0 && (
        <Link
          href="/log/voice"
          className="mt-3 flex items-center justify-center gap-1.5 min-h-[44px] text-[13px] font-semibold"
          style={{ color: "var(--fg-muted)" }}
        >
          Or speak the whole session
          <span style={{ color: "var(--accent)" }}>›</span>
        </Link>
      )}

      <div className="mt-6 space-y-2.5">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Session notes…"
          rows={2}
          className="w-full rounded-xl px-4 py-3 text-[13px] focus:outline-none resize-none"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--fg)",
          }}
        />
      </div>

      <div className="mt-6 flex items-center gap-2.5">
        <button
          onClick={handleSave}
          disabled={!canSave || pending}
          className="btn-accent flex-1 py-3.5 rounded-xl text-[15px] font-semibold tracking-tight"
        >
          {pending ? "Saving…" : mode === "edit" ? "Save changes" : "Log workout"}
        </button>
        {mode === "create" && (
          <button
            type="button"
            onClick={discardDraft}
            className="py-3.5 px-5 rounded-xl text-[13px] font-medium"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--fg-muted)",
            }}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------- Shape: Distance ---------------- */

function DistanceMetrics(props: {
  workoutType: string;
  distance: string;
  setDistance: (v: string) => void;
  durationMin: string;
  setDurationMin: (v: string) => void;
  durationSec: string;
  setDurationSec: (v: string) => void;
  pace: string;
  setPace: (v: string) => void;
  elevation: string;
  setElevation: (v: string) => void;
  incline: string;
  setIncline: (v: string) => void;
  speed: string;
  setSpeed: (v: string) => void;
  level: string;
  setLevel: (v: string) => void;
  avgHR: string;
  setAvgHR: (v: string) => void;
  maxHR: string;
  setMaxHR: (v: string) => void;
}) {
  const isTreadmill = props.workoutType === "TREADMILL";
  const isLevelMachine =
    props.workoutType === "SPIN" || props.workoutType === "ELLIPTICAL";
  return (
    <div className="card p-4 space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        <LabeledInput
          label="Distance"
          suffix="km"
          type="number"
          inputMode="decimal"
          value={props.distance}
          onChange={props.setDistance}
          placeholder="5.0"
        />
        <DurationInput
          min={props.durationMin}
          setMin={props.setDurationMin}
          sec={props.durationSec}
          setSec={props.setDurationSec}
        />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {/* Treadmill logs speed + incline; outdoor logs pace; bike/elliptical
            log a resistance level. */}
        {isTreadmill ? (
          <>
            <LabeledInput
              label="Speed"
              suffix="km/h"
              type="number"
              inputMode="decimal"
              value={props.speed}
              onChange={props.setSpeed}
              placeholder="9.5"
            />
            <LabeledInput
              label="Incline"
              suffix="%"
              type="number"
              inputMode="decimal"
              value={props.incline}
              onChange={props.setIncline}
              placeholder="3.0"
            />
          </>
        ) : (
          <>
            <LabeledInput
              label="Pace"
              suffix="/km"
              value={props.pace}
              onChange={props.setPace}
              placeholder="5:30"
            />
            {isLevelMachine ? (
              <LabeledInput
                label="Level"
                type="number"
                value={props.level}
                onChange={props.setLevel}
                placeholder="8"
              />
            ) : (
              <LabeledInput
                label="Elevation"
                suffix="m"
                type="number"
                value={props.elevation}
                onChange={props.setElevation}
                placeholder="120"
              />
            )}
          </>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <LabeledInput
          label="Avg HR"
          suffix="bpm"
          type="number"
          value={props.avgHR}
          onChange={props.setAvgHR}
          placeholder="155"
        />
        <LabeledInput
          label="Max HR"
          suffix="bpm"
          type="number"
          value={props.maxHR}
          onChange={props.setMaxHR}
          placeholder="178"
        />
      </div>
    </div>
  );
}

/* ---------------- Shape: Duration ---------------- */

function DurationMetrics(props: {
  durationMin: string;
  setDurationMin: (v: string) => void;
  durationSec: string;
  setDurationSec: (v: string) => void;
  rounds: string;
  setRounds: (v: string) => void;
  rpe: string;
  setRpe: (v: string) => void;
  level: string;
  setLevel: (v: string) => void;
  avgHR: string;
  setAvgHR: (v: string) => void;
  maxHR: string;
  setMaxHR: (v: string) => void;
  showRounds: boolean;
  showLevel: boolean;
}) {
  return (
    <div className="card p-4 space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        <DurationInput
          min={props.durationMin}
          setMin={props.setDurationMin}
          sec={props.durationSec}
          setSec={props.setDurationSec}
        />
        {props.showRounds ? (
          <LabeledInput
            label="Rounds"
            type="number"
            value={props.rounds}
            onChange={props.setRounds}
            placeholder="8"
          />
        ) : props.showLevel ? (
          <LabeledInput
            label="Level"
            type="number"
            value={props.level}
            onChange={props.setLevel}
            placeholder="10"
          />
        ) : (
          <LabeledInput
            label="RPE"
            suffix="/10"
            type="number"
            value={props.rpe}
            onChange={props.setRpe}
            placeholder="7"
          />
        )}
      </div>
      {(props.showRounds || props.showLevel) && (
        <LabeledInput
          label="RPE"
          suffix="/10"
          type="number"
          value={props.rpe}
          onChange={props.setRpe}
          placeholder="7"
        />
      )}
      <div className="grid grid-cols-2 gap-2.5">
        <LabeledInput
          label="Avg HR"
          suffix="bpm"
          type="number"
          value={props.avgHR}
          onChange={props.setAvgHR}
          placeholder="155"
        />
        <LabeledInput
          label="Max HR"
          suffix="bpm"
          type="number"
          value={props.maxHR}
          onChange={props.setMaxHR}
          placeholder="178"
        />
      </div>
    </div>
  );
}

/* ---------------- Shared primitives ---------------- */

function LabeledInput({
  label,
  suffix,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
}: {
  label: string;
  suffix?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: "decimal" | "numeric" | "text";
}) {
  return (
    <div>
      <p className="label mb-1.5">{label}</p>
      <div className="relative">
        <input
          type={type}
          inputMode={inputMode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl px-4 py-3 text-[14px] focus:outline-none nums"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            color: "var(--fg)",
            fontFamily: "var(--font-geist-mono)",
            paddingRight: suffix ? "3rem" : undefined,
          }}
        />
        {suffix && (
          <span
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] label"
            style={{ color: "var(--fg-dim)" }}
          >
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function DurationInput({
  min,
  setMin,
  sec,
  setSec,
}: {
  min: string;
  setMin: (v: string) => void;
  sec: string;
  setSec: (v: string) => void;
}) {
  return (
    <div>
      <p className="label mb-1.5">Duration</p>
      <div className="flex gap-1.5 items-center">
        <input
          type="number"
          inputMode="numeric"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          placeholder="45"
          className="flex-1 w-full rounded-xl px-3 py-3 text-[14px] text-center focus:outline-none nums"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            color: "var(--fg)",
            fontFamily: "var(--font-geist-mono)",
          }}
        />
        <span
          className="text-[11px] label"
          style={{ color: "var(--fg-dim)" }}
        >
          m
        </span>
        <input
          type="number"
          inputMode="numeric"
          value={sec}
          onChange={(e) => setSec(e.target.value)}
          placeholder="00"
          className="flex-1 w-full rounded-xl px-3 py-3 text-[14px] text-center focus:outline-none nums"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            color: "var(--fg)",
            fontFamily: "var(--font-geist-mono)",
          }}
        />
        <span
          className="text-[11px] label"
          style={{ color: "var(--fg-dim)" }}
        >
          s
        </span>
      </div>
    </div>
  );
}

/* ---------------- Icons ---------------- */

function BackIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

/* ---------------- Date selector ---------------- */

function DateSelector({
  date,
  setDate,
}: {
  date: string;
  setDate: (d: string) => void;
}) {
  const [showCalendar, setShowCalendar] = useState(false);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(today.getDate() - 2);

  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const shortcuts = [
    { label: "Today", value: fmt(today) },
    { label: "Yesterday", value: fmt(yesterday) },
    { label: "2 days ago", value: fmt(twoDaysAgo) },
  ];

  const display = new Date(`${date}T12:00:00`);
  const niceDate = display.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year:
      display.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
  const isToday = date === fmt(today);

  return (
    <div className="card p-4 mb-3">
      <div className="flex items-baseline justify-between mb-3">
        <p className="label">Logging for</p>
        {!isToday && (
          <p
            className="label text-[9px]"
            style={{ color: "var(--accent)" }}
          >
            Backdated
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 mb-3">
        <div
          className="flex-1 nums text-[18px] font-semibold tracking-tight"
          style={{ fontFamily: "var(--font-geist-mono)" }}
        >
          {niceDate}
        </div>
        <button
          type="button"
          onClick={() => setShowCalendar((v) => !v)}
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            padding: "0.4rem 0.7rem",
            borderRadius: "0.5rem",
          }}
        >
          <span
            className="label text-[10px]"
            style={{ color: "var(--fg-muted)" }}
          >
            {showCalendar ? "Close" : "Pick date"}
          </span>
        </button>
      </div>

      {showCalendar && (
        <CalendarPopup
          value={date}
          max={fmt(today)}
          onPick={(d) => {
            setDate(d);
            setShowCalendar(false);
          }}
        />
      )}

      <div className="flex gap-1.5">
        {shortcuts.map((s) => {
          const active = date === s.value;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => setDate(s.value)}
              className="flex-1 text-[11px] py-2 rounded-lg transition-colors label"
              style={
                active
                  ? {
                      background: "var(--accent-dim)",
                      color: "var(--accent)",
                      border: "1px solid rgba(34,197,94,0.35)",
                    }
                  : {
                      background: "var(--bg-elevated)",
                      color: "var(--fg-muted)",
                      border: "1px solid var(--border)",
                    }
              }
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CalendarPopup({
  value,
  max,
  onPick,
}: {
  value: string;
  max: string;
  onPick: (d: string) => void;
}) {
  const fmtYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const initial = new Date(`${value}T12:00:00`);
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  const maxDate = new Date(`${max}T12:00:00`);
  const maxYear = maxDate.getFullYear();

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const monthLabel = firstOfMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const shiftMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  const weekDays = ["S", "M", "T", "W", "T", "F", "S"];
  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const years: number[] = [];
  for (let y = maxYear; y >= 1970; y--) years.push(y);

  return (
    <div
      className="mt-2 p-3 rounded-xl"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="px-2 py-1 rounded-md text-[14px]"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
        >
          ‹
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold">{monthLabel}</span>
          <select
            value={viewYear}
            onChange={(e) => setViewYear(parseInt(e.target.value))}
            className="text-[11px] rounded-md px-1.5 py-1 nums"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--fg)",
              fontFamily: "var(--font-geist-mono)",
            }}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          disabled={
            viewYear > maxYear ||
            (viewYear === maxYear && viewMonth >= maxDate.getMonth())
          }
          className="px-2 py-1 rounded-md text-[14px] disabled:opacity-30"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekDays.map((d, i) => (
          <div
            key={i}
            className="text-center text-[10px] label"
            style={{ color: "var(--fg-dim)" }}
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const cellDate = new Date(viewYear, viewMonth, d);
          const cellStr = fmtYMD(cellDate);
          const disabled = cellStr > max;
          const selected = cellStr === value;
          return (
            <button
              key={i}
              type="button"
              onClick={() => !disabled && onPick(cellStr)}
              disabled={disabled}
              className="h-8 rounded-md text-[12px] nums disabled:opacity-20"
              style={{
                fontFamily: "var(--font-geist-mono)",
                background: selected
                  ? "var(--accent-dim)"
                  : "transparent",
                color: selected ? "var(--accent)" : "var(--fg)",
                border: selected
                  ? "1px solid rgba(34,197,94,0.35)"
                  : "1px solid transparent",
              }}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}
