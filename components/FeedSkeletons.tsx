// Lightweight shimmer placeholders shown while feed sections stream in.
// Server components (no "use client") — just static markup + a CSS pulse.

export function CardSkeleton({ height = 132 }: { height?: number }) {
  return (
    <div
      className="rounded-2xl mb-3 animate-pulse"
      style={{
        height,
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
    />
  );
}

function WorkoutCardSkeleton() {
  return (
    <div
      className="rounded-2xl p-4 animate-pulse"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-9 h-9 rounded-full"
          style={{ background: "var(--bg-elevated)" }}
        />
        <div className="flex-1">
          <div
            className="h-3 w-24 rounded mb-1.5"
            style={{ background: "var(--bg-elevated)" }}
          />
          <div
            className="h-2.5 w-16 rounded"
            style={{ background: "var(--bg-elevated)" }}
          />
        </div>
      </div>
      <div
        className="h-3 w-40 rounded mb-2"
        style={{ background: "var(--bg-elevated)" }}
      />
      <div
        className="h-3 w-28 rounded"
        style={{ background: "var(--bg-elevated)" }}
      />
    </div>
  );
}

export function FeedListSkeleton() {
  return (
    <div className="space-y-3">
      <WorkoutCardSkeleton />
      <WorkoutCardSkeleton />
      <WorkoutCardSkeleton />
    </div>
  );
}
