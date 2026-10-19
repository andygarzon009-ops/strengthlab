// Gradient flame for the favourite lift. Plain (no "use client") so server
// and client components can both render it.
export default function Flame({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <defs>
        <linearGradient id="fl-flame" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#d9f99d" />
        </linearGradient>
      </defs>
      <path
        fill="url(#fl-flame)"
        d="M12 2c.5 3.2-1.2 5-2.7 6.7C7.8 10.4 6.5 12 6.5 14.6 6.5 18.2 9 21 12 21s5.5-2.6 5.5-6.2c0-2.3-1-3.9-2.1-5.2-.3 1.4-1 2.5-2.1 3 .3-2.9-.4-6.4-1.3-10.6Z"
      />
    </svg>
  );
}
