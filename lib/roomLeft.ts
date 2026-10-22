// What's actually left to eat today, as one budget rather than three.
// Per-macro distances to target don't reconcile once a macro has gone over —
// the overage isn't deducted from the others — so protein comes first, then
// fat, then carbs take whatever calories remain.
export type RoomLeft = { kcal: number; proteinG: number; carbsG: number; fatG: number };

export function roomLeft(
  intake: { kcal: number; proteinG: number; fatG: number },
  targets: { calorieTargetKcal: number; proteinTargetG: number; fatTargetG: number },
): RoomLeft {
  const left = (have: number, target: number) => Math.max(0, target - have);
  const kcal = left(intake.kcal, targets.calorieTargetKcal);
  const proteinG = Math.min(left(intake.proteinG, targets.proteinTargetG), Math.floor(kcal / 4));
  const fatG = Math.min(
    left(intake.fatG, targets.fatTargetG),
    Math.floor(Math.max(0, kcal - proteinG * 4) / 9),
  );
  const carbsG = Math.floor(Math.max(0, kcal - proteinG * 4 - fatG * 9) / 4);
  return { kcal, proteinG, carbsG, fatG };
}
