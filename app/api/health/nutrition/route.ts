import { requireAuth } from "@/lib/session";
import { getTodayFuel } from "@/lib/nutritionToday";

export const maxDuration = 30;

/// Today's nutrition + a goal-aware Fuel Score for the Health page card. Intake
/// is pulled live from Google Health `nutrition-log` (logged via its AI-image /
/// barcode tools); expenditure ≈ estimated BMR + the day's active energy.
/// Targets follow the athlete's profile trainingPhase. Live read — no schema,
/// no migration. Shares getTodayFuel with the AI coach so they agree.
export async function GET() {
  const userId = await requireAuth();
  const fuel = await getTodayFuel(userId);

  switch (fuel.state) {
    case "no-account":
      return Response.json({ connected: false });
    case "reconnect":
      return Response.json({ connected: true, needsReconnect: true });
    case "no-profile":
      return Response.json({ connected: true, needsProfile: true });
    default:
      return Response.json({
        connected: true,
        date: fuel.date,
        loggedToday: fuel.loggedToday,
        intake: fuel.intake,
        activeEnergyKcal: fuel.activeEnergyKcal,
        targets: fuel.targets,
        score: fuel.score,
      });
  }
}
