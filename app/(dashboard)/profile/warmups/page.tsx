import { loadPreferredWarmups } from "@/lib/actions/warmupPreferences";
import PreferredWarmupsEditor from "@/components/PreferredWarmupsEditor";
import BackButton from "@/components/BackButton";

export default async function PreferredWarmupsPage() {
  const initial = await loadPreferredWarmups();

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <BackButton href="/profile" ariaLabel="Back to profile" />
        <div>
          <h1 className="text-[22px] font-bold tracking-tight leading-none">
            Preferred warm-ups
          </h1>
          <p
            className="text-[12px] mt-1"
            style={{ color: "var(--fg-dim)" }}
          >
            Your AI coach uses these when prescribing matching sessions.
          </p>
        </div>
      </div>

      <PreferredWarmupsEditor initial={initial} />
    </div>
  );
}
