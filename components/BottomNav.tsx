"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Feed", icon: "🏠" },
  { href: "/history", label: "History", icon: "📋" },
  { href: "/log", label: "Log", icon: "➕", accent: true },
  { href: "/analytics", label: "Stats", icon: "📈" },
  { href: "/profile", label: "Profile", icon: "👤" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-900/95 backdrop-blur border-t border-zinc-800">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {navItems.map((item) => {
          const active = pathname === item.href;
          if (item.accent) {
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center justify-center w-14 h-14 -mt-4 rounded-full bg-orange-500 shadow-lg shadow-orange-500/30 active:scale-95 transition-transform"
              >
                <span className="text-xl">{item.icon}</span>
              </Link>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-xl transition-colors ${
                active ? "text-orange-400" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
