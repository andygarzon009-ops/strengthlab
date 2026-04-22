import BottomNav from "@/components/BottomNav";
import AITrainer from "@/components/AITrainer";
import Celebrations from "@/components/Celebrations";

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
      <AITrainer />
      <Celebrations />
    </div>
  );
}
