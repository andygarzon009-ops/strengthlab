// Tools for treating near-duplicate Exercise rows as the same lift.
// Users will inevitably create "Weighted Pull-Up" / "weighed pull ups" /
// "Weighted Pullup" etc. — all of these should count toward the same
// target, PR, progression history, and so on.

export function normalizeExerciseName(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "") // drop whitespace + punctuation
    .replace(/s$/, ""); // strip trailing plural 's'
}

// Implied-equipment & common-synonym aliases.
//
// The canonical library names carry an explicit equipment qualifier
// ("Flat Barbell Bench Press"), but coaches and athletes habitually speak the
// bare default form ("flat bench press", "bench press", "deadlift", "squat").
// exerciseNamesMatch() deliberately treats a qualifier word like "barbell" as
// a DISTINCT lift — that's what keeps "Flat Dumbbell Bench Press" and "Smith
// Machine Flat Bench Press" from collapsing into the same row. The side effect
// is that the bare barbell-default form no longer matches its canonical, so a
// coach prescription ("Flat Bench Press") spawns a duplicate Exercise row and
// splits the athlete's history, PRs, and progression.
//
// This table pins each well-known bare/synonym form to the one canonical
// library name it should resolve to. Authored canonical → synonyms for
// readability; flattened into a normalized lookup at module load. ONLY the
// listed forms are remapped — anything carrying a real distinguishing
// qualifier (dumbbell, smith, machine, close-grip, incline-vs-flat, etc.)
// falls through untouched and stays its own lift.
const ALIAS_GROUPS: { canonical: string; synonyms: string[] }[] = [
  {
    canonical: "Flat Barbell Bench Press",
    synonyms: [
      "bench press",
      "flat bench press",
      "barbell bench press",
      "bb bench press",
      "flat bb bench press",
    ],
  },
  {
    canonical: "Incline Barbell Bench Press",
    synonyms: ["incline bench press", "incline barbell bench", "incline bb bench press"],
  },
  {
    canonical: "Decline Barbell Bench Press",
    synonyms: ["decline bench press", "decline barbell bench"],
  },
  {
    canonical: "Overhead Press (Barbell)",
    synonyms: [
      "overhead press",
      "barbell overhead press",
      "ohp",
      "military press",
      "shoulder press",
      "barbell shoulder press",
      "standing overhead press",
      "standing barbell overhead press",
      "standing barbell shoulder press",
    ],
  },
  {
    canonical: "Conventional Deadlift",
    synonyms: ["deadlift", "barbell deadlift", "conventional barbell deadlift"],
  },
  {
    canonical: "Romanian Deadlift (Barbell)",
    synonyms: ["romanian deadlift", "rdl", "barbell rdl", "barbell romanian deadlift"],
  },
  {
    canonical: "Barbell Row",
    synonyms: [
      "bent over row",
      "bent-over row",
      "barbell bent over row",
      "barbell bent-over row",
      "bent over barbell row",
      "bent-over barbell row",
      "bb row",
    ],
  },
  {
    // Bare "squat"/"back squat" → the high-bar back squat, the conventional
    // default when no bar position is named. Low-bar lifters who log the
    // explicit "(Low Bar)" entry stay separate, as intended.
    canonical: "Back Squat (High Bar)",
    synonyms: ["squat", "back squat", "barbell squat", "barbell back squat", "high bar squat"],
  },
];

// normalized synonym (and canonical) → canonical normalized name
const ALIAS_LOOKUP: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const { canonical, synonyms } of ALIAS_GROUPS) {
    const canonNorm = normalizeExerciseName(canonical);
    m.set(canonNorm, canonNorm); // canonical resolves to itself
    for (const syn of synonyms) m.set(normalizeExerciseName(syn), canonNorm);
  }
  return m;
})();

// Resolve a name to its canonical *normalized* identity. Known bare/synonym
// forms map to their qualified canonical; everything else falls back to its
// own normalized form, so non-aliased names behave exactly as before.
export function canonicalExerciseKey(raw: string): string {
  const norm = normalizeExerciseName(raw);
  return ALIAS_LOOKUP.get(norm) ?? norm;
}

// Split a name into normalized word tokens (lowercased, accent-stripped,
// per-word de-pluralized). Used for word-set comparison so that a name
// carrying an extra meaningful qualifier — "Smith machine hip thrust" vs
// "Machine hip thrust", "Incline barbell bench" vs "Barbell bench" — is
// NOT collapsed into the shorter lift. Equipment, angle, and grip
// modifiers each add a token, so the word sets simply won't match.
function tokenizeExerciseName(raw: string): string[] {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((t) => t.replace(/s$/, "")); // de-pluralize each word
}

// Levenshtein distance (iterative, O(a·b) time, O(b) space).
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prevDiag = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      row[j] =
        a[i - 1] === b[j - 1]
          ? prevDiag
          : 1 + Math.min(row[j], row[j - 1], prevDiag);
      prevDiag = temp;
    }
  }
  return row[b.length];
}

// Whether two raw exercise names probably refer to the same lift.
//
// The hard constraint: a name with an extra meaningful qualifier is a
// DIFFERENT lift. "Smith machine hip thrust" must never resolve to
// "Machine hip thrust", nor "Incline bench" to "Bench", nor "Close-grip
// bench press" to "Bench press" — logging the wrong variant corrupts the
// athlete's history. Substring containment used to do exactly that, so it's
// gone. We match only on: identical normalized form, identical word set
// (order / spacing / per-word plurals differ), a single one-edit typo in
// one word, or a length-changing typo across the whole string (spacing /
// compound / plural glitches like "weighted pullup" vs "weighed pull ups").
export function exerciseNamesMatch(a: string, b: string): boolean {
  const na = normalizeExerciseName(a);
  const nb = normalizeExerciseName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  // Implied-equipment aliases: a bare barbell-default form ("flat bench
  // press") and its qualified canonical ("Flat Barbell Bench Press") share a
  // canonical key and are the same lift. Only names listed in ALIAS_GROUPS
  // are remapped, so this never collapses genuinely distinct variants.
  if (canonicalExerciseKey(a) === canonicalExerciseKey(b)) return true;

  const ta = tokenizeExerciseName(a);
  const tb = tokenizeExerciseName(b);
  if (ta.length && tb.length) {
    const sa = new Set(ta);
    const sb = new Set(tb);
    // Identical word set — handles reordering, spacing, and per-word plurals.
    if (sa.size === sb.size && [...sa].every((t) => sb.has(t))) return true;
    // Same word count differing in exactly one word that is a 1-edit typo of
    // its counterpart. One edit only — opposite qualifiers like
    // incline/decline are 2 edits apart and must stay distinct lifts.
    if (ta.length === tb.length) {
      const aOnly = ta.filter((t) => !sb.has(t));
      const bOnly = tb.filter((t) => !sa.has(t));
      if (
        aOnly.length === 1 &&
        bOnly.length === 1 &&
        Math.min(aOnly[0].length, bOnly[0].length) >= 4 &&
        editDistance(aOnly[0], bOnly[0]) <= 1
      ) {
        return true;
      }
    }
  }

  // Whole-string typo tolerance for spacing/compound/plural glitches that
  // change length (e.g. "weightedpullup" vs "weighedpullup"). Only when the
  // lengths actually differ — a same-length 2-edit gap is usually two
  // different lifts (incline vs decline) and must not collapse.
  if (
    Math.min(na.length, nb.length) >= 6 &&
    na.length !== nb.length &&
    editDistance(na, nb) <= 2
  ) {
    return true;
  }
  return false;
}

// For a given exercise id + name, return every exercise id in the
// provided list that probably refers to the same lift.
export function similarExerciseIds(
  targetId: string | null,
  targetName: string | null,
  allExercises: { id: string; name: string }[]
): Set<string> {
  const matches = new Set<string>();
  if (targetId) matches.add(targetId);
  if (!targetName) return matches;
  for (const ex of allExercises) {
    if (ex.id === targetId) continue;
    if (exerciseNamesMatch(ex.name, targetName)) matches.add(ex.id);
  }
  return matches;
}

// Group a set of exercises by their normalized name. Each cluster gets
// a single "canonical id" (the first one encountered) plus the list of
// all ids that fall inside it. Useful for deduping top-lifts, coach
// progression, etc.
export function clusterExercises<
  T extends { id: string; name: string },
>(
  exercises: T[]
): { canonicalId: string; name: string; ids: Set<string>; all: T[] }[] {
  const clusters: {
    canonicalId: string;
    name: string;
    ids: Set<string>;
    all: T[];
  }[] = [];
  for (const ex of exercises) {
    if (!normalizeExerciseName(ex.name)) continue;
    // Use the shared matcher so analytics grouping stays consistent with
    // how the rest of the app resolves duplicate lifts — and so qualifier
    // variants (Smith machine vs machine, incline vs flat) stay separate.
    const existing = clusters.find((c) => exerciseNamesMatch(c.name, ex.name));
    if (existing) {
      existing.ids.add(ex.id);
      existing.all.push(ex);
    } else {
      clusters.push({
        canonicalId: ex.id,
        name: ex.name,
        ids: new Set([ex.id]),
        all: [ex],
      });
    }
  }
  return clusters;
}

// Find an existing exercise row that would be treated as the same lift
// as the given spoken/typed name. Returns null if none match.
export function findExistingExerciseByName<
  T extends { id: string; name: string },
>(name: string, pool: T[]): T | null {
  const norm = normalizeExerciseName(name);
  if (!norm) return null;
  // Prefer an exact canonical match — this resolves alias forms (e.g. the
  // coach's "Flat Bench Press") onto their qualified library row ("Flat
  // Barbell Bench Press") and still covers plain identical-normalized names.
  const canon = canonicalExerciseKey(name);
  const exact = pool.find((ex) => canonicalExerciseKey(ex.name) === canon);
  if (exact) return exact;
  for (const ex of pool) {
    if (exerciseNamesMatch(ex.name, name)) return ex;
  }
  return null;
}
