// Hand-off from the "New" chooser to the meal logger on /fuel. The chooser
// opens the camera itself (a file picker needs the tap that opened it), then
// navigates client-side; module state survives that navigation, so the logger
// picks the photo up on mount and goes straight to the estimate.
export type PendingMeal = { file: File } | { describe: true };

let pending: PendingMeal | null = null;

export function setPendingMeal(p: PendingMeal) {
  pending = p;
}

export function takePendingMeal(): PendingMeal | null {
  const p = pending;
  pending = null;
  return p;
}
