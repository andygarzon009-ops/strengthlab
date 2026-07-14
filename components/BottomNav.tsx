"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Feed" },
  { href: "/history", label: "Log" },
  { href: "/log", label: "Train", accent: true },
  { href: "/group", label: "Crew" },
  { href: "/profile", label: "You" },
];

function Icon({ name, active }: { name: string; active: boolean }) {
  const stroke = active ? "#22c55e" : "#71717a";
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke,
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "/":
      return (
        <svg {...common}>
          <path d="M3 12 12 3l9 9" />
          <path d="M5 10v10h14V10" />
        </svg>
      );
    case "/history":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M4 10h16" />
        </svg>
      );
    case "/group":
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "/profile":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
        </svg>
      );
    default:
      return null;
  }
}

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        // Solid (not backdrop-blur) + own compositor layer. On iOS Safari a
        // fixed bar with backdrop-filter visually detaches and drifts up with
        // the content during momentum scroll, then snaps back. Over this
        // near-black app the blur was imperceptible anyway.
        background: "var(--bg)",
        borderTop: "1px solid var(--border)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        transform: "translateZ(0)",
        willChange: "transform",
      }}
    >
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {navItems.map((item) => {
          const active = pathname === item.href;
          if (item.accent) {
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center justify-center w-14 h-14 -mt-6 rounded-full active:scale-95 transition-transform"
                style={{
                  background: "var(--accent)",
                  boxShadow:
                    "0 8px 24px -6px rgba(34, 197, 94, 0.5), 0 0 0 4px var(--bg)",
                }}
                aria-label={item.label}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#0a0a0a"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </Link>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center justify-center gap-1 px-3 py-2 transition-colors"
              style={{
                color: active ? "var(--accent)" : "var(--fg-dim)",
              }}
            >
              <Icon name={item.href} active={active} />
              <span
                className="text-[10px] font-medium tracking-wider uppercase"
                style={{ letterSpacing: "0.1em" }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
