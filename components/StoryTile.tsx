import Link from "next/link";
import type { ReactNode } from "react";

/// Snapchat-Discover-style promo card: a tall tile with an image or gradient
/// background, a dark scrim, a badge, bottom-aligned title/subtitle, an
/// optional CTA pill, and an optional interactive action (e.g. a Cheer
/// button) in the top-right. The whole tile is a link; the action sits above
/// it so its taps don't navigate.
export default function StoryTile({
  href,
  title,
  subtitle,
  badge,
  cta,
  bgImage,
  gradient,
  action,
}: {
  href: string;
  title: string;
  subtitle?: string;
  badge?: string;
  cta?: string;
  bgImage?: string | null;
  gradient?: string;
  action?: ReactNode;
}) {
  const bg = bgImage
    ? `center/cover no-repeat url(${bgImage})`
    : (gradient ?? "linear-gradient(135deg, var(--bg-elevated), var(--bg-card))");

  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{ aspectRatio: "3 / 4", background: bg, border: "1px solid var(--border)" }}
    >
      {/* scrim */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.15) 55%, rgba(0,0,0,0.05) 100%)",
        }}
      />

      {/* full-card link */}
      <Link href={href} className="absolute inset-0 z-10" aria-label={title} />

      {badge && (
        <span
          className="absolute top-2 left-2 z-20 text-[10px] font-bold px-2 py-1 rounded-full pointer-events-none"
          style={{ background: "rgba(0,0,0,0.5)", color: "#fff" }}
        >
          {badge}
        </span>
      )}

      {action && <div className="absolute top-2 right-2 z-30">{action}</div>}

      <div className="absolute bottom-0 left-0 right-0 p-3 z-20 pointer-events-none">
        <p className="text-[15px] font-bold leading-tight text-white drop-shadow">
          {title}
        </p>
        {subtitle && (
          <p className="text-[12px] mt-0.5 text-white/80 leading-snug">
            {subtitle}
          </p>
        )}
        {cta && (
          <span
            className="inline-block mt-2 text-[12px] font-bold px-4 py-1.5 rounded-full"
            style={{ background: "#fff", color: "#0a0a0a" }}
          >
            {cta}
          </span>
        )}
      </div>
    </div>
  );
}
