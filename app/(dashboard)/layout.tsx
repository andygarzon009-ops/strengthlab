import BottomNav from "@/components/BottomNav";
import NotificationsBell from "@/components/NotificationsBell";
import AITrainer from "@/components/AITrainer";
import Celebrations from "@/components/Celebrations";
import Timer from "@/components/Timer";
import TutorialAutoOpen from "@/components/TutorialAutoOpen";
import TimezoneSync from "@/components/TimezoneSync";
import RestNotifications from "@/components/RestNotifications";
import PushAutoSubscribe from "@/components/PushAutoSubscribe";
import { Suspense } from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        // Reserve the full bottom-nav height (h-16 = 64px + 1px border) PLUS
        // the home-indicator safe area. The old pb-20 (80px) ignored the inset,
        // so on home-indicator iPhones the nav (~99px tall) clipped the last
        // ~19px of content — invisible now that the nav is opaque.
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 5rem)",
      }}
    >
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
    </div>
  );
}
