import { notFound } from "next/navigation";
import BackButton from "@/components/BackButton";
import BodyMeasureDetail from "@/components/BodyMeasureDetail";
import { CHECK_IN_KEYS, type MeasurementKey } from "@/lib/bodyMeasurements";
import { loadBodyHistory } from "@/lib/bodyHistory";
import { requireAuth } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function BodyFieldPage({
  params,
}: {
  params: Promise<{ field: string }>;
}) {
  const { field } = await params;
  if (!(CHECK_IN_KEYS as string[]).includes(field)) notFound();
  const userId = await requireAuth();
  const { sex, phase, history } = await loadBodyHistory(userId);

  return (
    <div className="max-w-lg mx-auto px-4 pt-8">
      <div className="mb-5">
        <BackButton href="/body" ariaLabel="Back to body" />
      </div>
      <BodyMeasureDetail
        field={field as MeasurementKey}
        sex={sex}
        phase={phase}
        history={history}
      />
    </div>
  );
}
