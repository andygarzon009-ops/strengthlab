import { CardSkeleton } from "@/components/FeedSkeletons";

// Instant feedback for EVERY dashboard navigation. Without this, Next keeps the
// previous page frozen on screen until the next (server-rendered) page is
// ready — which on slow/dynamic pages reads as a dead tap and makes users tap
// again. The bottom nav lives in the layout, so it stays interactive here.
export default function DashboardLoading() {
  return (
    <div className="max-w-lg mx-auto px-4 pt-8" aria-busy="true">
      <div className="flex items-end justify-between mb-8">
        <div>
          <div
            className="h-3 w-16 rounded mb-2 animate-pulse"
            style={{ background: "var(--bg-elevated)" }}
          />
          <div
            className="h-6 w-40 rounded animate-pulse"
            style={{ background: "var(--bg-elevated)" }}
          />
        </div>
        <div
          className="h-10 w-16 rounded-xl animate-pulse"
          style={{ background: "var(--bg-elevated)" }}
        />
      </div>
      <CardSkeleton height={132} />
      <CardSkeleton height={168} />
      <CardSkeleton height={120} />
    </div>
  );
}
