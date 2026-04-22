import BottomNav from "@/components/BottomNav";
import AITrainer from "@/components/AITrainer";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen pb-20">
      {children}
      <BottomNav />
      <AITrainer />
    </div>
  );
}
