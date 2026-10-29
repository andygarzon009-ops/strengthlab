import BodyCheckIn from "@/components/BodyCheckIn";
import { loadBodyHistory } from "@/lib/bodyHistory";
import { requireAuth } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function BodyCheckInPage() {
  const userId = await requireAuth();
  const { sex, phase, history } = await loadBodyHistory(userId);

  return (
    <div className="max-w-lg mx-auto px-4 pt-6">
      <BodyCheckIn sex={sex} phase={phase} history={history} />
    </div>
  );
}
