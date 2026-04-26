import BottomNav from "@/components/BottomNav";
import AITrainer from "@/components/AITrainer";
import Celebrations from "@/components/Celebrations";
import IntervalTimer from "@/components/IntervalTimer";
import TutorialAutoOpen from "@/components/TutorialAutoOpen";
import { Suspense } from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen pb-20"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {children}
      <BottomNav />
      <Suspense fallback={null}>
        <AITrainer />
      </Suspense>
      <Celebrations />
      <IntervalTimer />
      <TutorialAutoOpen />
    </div>
  );
}
