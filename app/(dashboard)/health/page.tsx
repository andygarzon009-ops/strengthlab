import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import HealthDashboard from "@/components/HealthDashboard";
import HealthReconnectBanner from "@/components/HealthReconnectBanner";
import BackButton from "@/components/BackButton";

export default async function HealthPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const userId = await requireAuth();
  const account = await prisma.healthAccount.findUnique({
    where: { userId },
    select: { createdAt: true, scope: true },
  });
  const { connected, error } = await searchParams;

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-24">
      <div className="flex items-center gap-3 mb-3">
        <BackButton href="/profile" ariaLabel="Back to profile" />
        <h1 className="text-[22px] font-bold tracking-tight">Health</h1>
      </div>
      <p
        className="text-[12px] mb-6"
        style={{ color: "var(--fg-dim)" }}
      >
        Sync activity and heart rate from your Fitbit via Google Health.
      </p>

      {connected && (
        <div
          className="rounded-lg p-3 mb-4 text-[13px]"
          style={{ background: "var(--accent-dim)", color: "var(--accent)" }}
        >
          Connected — pull your latest data below.
        </div>
      )}
      {error && (
        <div
          className="rounded-lg p-3 mb-4 text-[13px]"
          style={{ background: "rgba(239,68,68,0.15)", color: "rgb(252,165,165)" }}
        >
          {error.replace(/_/g, " ")}
        </div>
      )}

      <HealthReconnectBanner />

      <HealthDashboard connected={!!account} connectedAt={account?.createdAt ?? null} />
    </div>
  );
}
