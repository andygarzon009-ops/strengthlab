import BackButton from "@/components/BackButton";
import BodyMapView from "@/components/BodyMapView";
import { loadBodyHistory } from "@/lib/bodyHistory";
import { requireAuth } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function BodyPage() {
  const userId = await requireAuth();
  const { sex, phase, history } = await loadBodyHistory(userId);

  return (
    <div className="max-w-lg mx-auto px-4 pt-8">
      <div className="flex items-center gap-3 mb-5">
        <BackButton fallbackHref="/profile" ariaLabel="Back" />
        <h1 className="text-[22px] font-bold tracking-tight">Body</h1>
      </div>
      <BodyMapView sex={sex} phase={phase} history={history} />
    </div>
  );
}
