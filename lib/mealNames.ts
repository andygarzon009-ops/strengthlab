// Meal names changed this visit, shared by every place on Fuel that shows a
// meal (Log a past meal, Next meal's pills, today's log). A rename lands here
// first, so all of them update the moment Save is tapped; the server write
// runs behind it. Waiting on router.refresh meant waiting on the whole Fuel
// render — Google Health included — before the new name appeared.
import { useSyncExternalStore } from "react";

/// sig → name; null means "back to the automatic name".
type Overrides = Record<string, string | null>;

let overrides: Overrides = {};
const EMPTY: Overrides = {};
const listeners = new Set<() => void>();

/// `undefined` drops this visit's rename and goes back to the server's name.
export function setMealNameLocal(sig: string, name: string | null | undefined) {
  const next = { ...overrides };
  if (name === undefined) delete next[sig];
  else next[sig] = name;
  overrides = next;
  for (const l of listeners) l();
}

/// Rename now, save behind it, and put the old name back if the save fails.
export function renameMealOptimistic(
  sig: string,
  name: string,
  save: (sig: string, name: string) => Promise<{ ok: boolean }>,
) {
  const before = overrides[sig];
  setMealNameLocal(sig, name || null);
  save(sig, name)
    .then((res) => {
      if (!res.ok) setMealNameLocal(sig, before);
    })
    .catch(() => setMealNameLocal(sig, before));
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useMealNameOverrides(): Overrides {
  return useSyncExternalStore(subscribe, () => overrides, () => EMPTY);
}

/// The automatic name for a meal: its biggest food, "+N" for the rest.
export function autoMealTitle(items: { name: string; kcal: number }[]): string {
  const lead = [...items].sort((a, b) => b.kcal - a.kcal)[0];
  if (!lead) return "";
  return items.length > 1 ? `${lead.name} +${items.length - 1}` : lead.name;
}

/// A meal's name now: this visit's rename if there is one, else what the
/// server had (`server`), else the automatic one.
export function resolveMealName(
  o: Overrides,
  sig: string,
  server: string | null | undefined,
  items: { name: string; kcal: number }[],
): { title: string; named: boolean } {
  const local = o[sig];
  if (local !== undefined) return local ? { title: local, named: true } : { title: autoMealTitle(items), named: false };
  return server ? { title: server, named: true } : { title: autoMealTitle(items), named: false };
}
