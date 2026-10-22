import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import BackButton from "@/components/BackButton";
import FuelSettingsForm from "@/components/FuelSettingsForm";
import { cleanMealPrefs } from "@/lib/mealPrefs";

/// Fuel settings: dietary restrictions plus how the athlete cooks, so recipe
/// suggestions on Fuel fit their kitchen, schedule and taste.
export default async function FuelSettingsPage() {
  const userId = await requireAuth();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { dietRestrictions: true, dietNotes: true, mealPrefs: true },
  });

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-10">
      <div className="flex items-center gap-3 mb-6">
        <BackButton href="/profile" alsoFrom={["/fuel"]} ariaLabel="Back" />
        <div>
          <h1 className="text-[22px] font-bold tracking-tight leading-none">Fuel settings</h1>
          <p className="text-[12px] mt-1" style={{ color: "var(--fg-dim)" }}>
            Recipe suggestions and your coach follow these.
          </p>
        </div>
      </div>
      <FuelSettingsForm
        initial={{
          dietRestrictions: user?.dietRestrictions ?? [],
          dietNotes: user?.dietNotes ?? "",
          mealPrefs: cleanMealPrefs(user?.mealPrefs),
        }}
      />
    </div>
  );
}
