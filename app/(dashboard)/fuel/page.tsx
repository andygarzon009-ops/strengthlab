import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { getFuelWeek } from "@/lib/nutritionToday";
import BackButton from "@/components/BackButton";
import FuelWeek from "@/components/FuelWeek";
import HealthReconnectBanner from "@/components/HealthReconnectBanner";

export const dynamic = "force-dynamic";

/// The Fuel page — seven days of intake from MyFitnessPal via Google Health,
/// with every logged food and its macros. Live read: getFuelWeek pulls the
/// window in one nutrition-log call, so there's no history table behind this.
export default async function FuelPage() {
  const userId = await requireAuth();
  const week = await getFuelWeek(userId);

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <BackButton href="/" ariaLabel="Back to feed" />
        <h1 className="text-[22px] font-bold tracking-tight">Fuel</h1>
      </div>

      <HealthReconnectBanner />

      {week.state === "ok" ? (
        <FuelWeek
          days={week.days}
          today={week.today}
          calibration={week.calibration}
        />
      ) : (
        <EmptyState state={week.state} />
      )}
    </div>
  );
}

function EmptyState({
  state,
}: {
  state: "no-account" | "reconnect" | "no-nutrition-scope" | "no-profile";
}) {
  const copy = {
    "no-account": {
      icon: "🍳",
      title: "Health isn't connected",
      body: "Connect Google Health to pull the meals you log in MyFitnessPal — calories, protein, carbs and fat, food by food.",
      cta: { href: "/health", label: "Connect Google Health" },
    },
    reconnect: {
      icon: "🔌",
      title: "Reconnect Google Health",
      body: "Your connection expired, so no food is coming through. Reconnecting takes a few seconds and restores the last week of intake.",
      cta: { href: "/health", label: "Reconnect" },
    },
    // Connected before nutrition access existed. Google only grants the scope
    // on re-consent, so no amount of logging will ever reach us until they do.
    "no-nutrition-scope": {
      icon: "🍽️",
      title: "Grant access to your food log",
      body: "Google Health is connected, but you linked it before StrengthLab could read nutrition. Disconnect and reconnect to grant food access — your meals will appear here straight after, including the past month.",
      cta: { href: "/health", label: "Reconnect Google Health" },
    },
    "no-profile": {
      icon: "⚖️",
      title: "Add your bodyweight",
      body: "Fuel targets are built from your bodyweight and training phase. Add both to your profile and this page fills in.",
      cta: { href: "/profile", label: "Go to profile" },
    },
  }[state];

  return (
    <div
      className="rounded-2xl px-6 py-12 text-center"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <div className="text-[32px] mb-3">{copy.icon}</div>
      <p className="text-[15px] font-semibold">{copy.title}</p>
      <p
        className="text-[13px] mt-1.5 leading-snug max-w-[20rem] mx-auto"
        style={{ color: "var(--fg-dim)" }}
      >
        {copy.body}
      </p>
      <Link
        href={copy.cta.href}
        className="inline-block mt-5 px-5 py-2.5 rounded-xl text-[13px] font-semibold"
        style={{ background: "var(--accent)", color: "#0a0a0a" }}
      >
        {copy.cta.label}
      </Link>
    </div>
  );
}
