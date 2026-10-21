// Hand-off from the "New" chooser to the meal logger on /fuel. The chooser
// opens the camera itself (a file picker needs the tap that opened it), then
// navigates client-side; module state survives that navigation, so the logger
// picks the photo up on mount and goes straight to the estimate. When the
// athlete is already on /fuel nothing remounts, so a mounted logger also
// listens for new hand-offs.
export type PendingMeal = { file: File } | { describe: true };

let pending: PendingMeal | null = null;
const listeners = new Set<() => void>();

export function setPendingMeal(p: PendingMeal) {
  pending = p;
  for (const l of listeners) l();
}

export function takePendingMeal(): PendingMeal | null {
  const p = pending;
  pending = null;
  return p;
}

/// Called whenever a new hand-off is set; returns the unsubscribe.
export function onPendingMeal(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
