import BottomNav from "@/components/BottomNav";
import NotificationsBell from "@/components/NotificationsBell";
import AITrainer from "@/components/AITrainer";
import Celebrations from "@/components/Celebrations";
import ForegroundNotice from "@/components/ForegroundNotice";
import Timer from "@/components/Timer";
import TutorialAutoOpen from "@/components/TutorialAutoOpen";
import TimezoneSync from "@/components/TimezoneSync";
import RestNotifications from "@/components/RestNotifications";
import NotificationWatcher from "@/components/NotificationWatcher";
import PushAutoSubscribe from "@/components/PushAutoSubscribe";
import { Suspense } from "react";
import { AppGlow } from "@/components/FeedGlow";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative isolate min-h-screen"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        // Reserve the full bottom-nav height (h-16 = 64px + 1px border) PLUS
        // the home-indicator safe area. The old pb-20 (80px) ignored the inset,
        // so on home-indicator iPhones the nav (~99px tall) clipped the last
        // ~19px of content — invisible now that the nav is opaque.
        // Plus room for the fade above the nav (BottomNav), so the end of a
        // page scrolls clear of it instead of ending half-dimmed.
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8.5rem)",
      }}
    >
      {/* The day's colour behind the top of every page. */}
      <Suspense fallback={null}>
        <AppGlow />
      </Suspense>
      {children}
      <NotificationsBell />
      <BottomNav />
      <Suspense fallback={null}>
        <AITrainer />
      </Suspense>
      <Celebrations />
      <Timer />
      <TutorialAutoOpen />
      <TimezoneSync />
      <RestNotifications />
      <PushAutoSubscribe />
      <NotificationWatcher />
      <ForegroundNotice />
    </div>
  );
}
