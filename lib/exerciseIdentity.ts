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

// Levenshtein distance (iterative, O(a·b) time, O(b) space).
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array(b.length + 1)
    .fill(0)
    .map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let curr = i;
    let prevDiag = i - 1;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      curr =
        a[i - 1] === b[j - 1]
          ? prevDiag
          : 1 + Math.min(prev[j], prev[j - 1], prevDiag);
      prevDiag = temp;
      prev[j - 1] = curr;
    }
    prev[b.length] = curr;
  }
  return prev[b.length];
}

// Whether two raw exercise names probably refer to the same lift.
export function exerciseNamesMatch(a: string, b: string): boolean {
  const na = normalizeExerciseName(a);
  const nb = normalizeExerciseName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  // Allow edit distance 2 but only when strings are long enough that
  // 2 edits don't collapse two different short lifts (e.g. "row" vs "raw").
  const minLen = Math.min(na.length, nb.length);
  if (minLen < 5) return false;
  return editDistance(na, nb) <= 2;
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
    normalized: string;
  }[] = [];
  for (const ex of exercises) {
    const norm = normalizeExerciseName(ex.name);
    if (!norm) continue;
    const existing = clusters.find(
      (c) =>
        c.normalized === norm ||
        (Math.min(c.normalized.length, norm.length) >= 5 &&
          editDistance(c.normalized, norm) <= 2) ||
        c.normalized.includes(norm) ||
        norm.includes(c.normalized)
    );
    if (existing) {
      existing.ids.add(ex.id);
      existing.all.push(ex);
    } else {
      clusters.push({
        canonicalId: ex.id,
        name: ex.name,
        ids: new Set([ex.id]),
        all: [ex],
        normalized: norm,
      });
    }
  }
  return clusters.map(({ normalized: _n, ...rest }) => rest);
}

// Find an existing exercise row that would be treated as the same lift
// as the given spoken/typed name. Returns null if none match.
export function findExistingExerciseByName<
  T extends { id: string; name: string },
>(name: string, pool: T[]): T | null {
  const norm = normalizeExerciseName(name);
  if (!norm) return null;
  // Prefer exact normalized match
  const exact = pool.find((ex) => normalizeExerciseName(ex.name) === norm);
  if (exact) return exact;
  for (const ex of pool) {
    if (exerciseNamesMatch(ex.name, name)) return ex;
  }
  return null;
}
