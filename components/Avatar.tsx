/// Round avatar: shows the uploaded photo, or deterministic colored initials
/// as a fallback. Plain <img> (not next/image) so Blob URLs need no remote
/// config. Works in both server and client components.

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

export default function Avatar({
  name,
  image,
  size = 48,
  ring,
}: {
  name: string;
  image?: string | null;
  size?: number;
  ring?: string; // optional ring color (e.g. activity state)
}) {
  const dim = { width: size, height: size };
  const ringStyle = ring
    ? { padding: 2, background: ring, borderRadius: "9999px" }
    : undefined;

  const inner = image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image}
      alt={name}
      style={{ ...dim, objectFit: "cover" }}
      className="rounded-full"
    />
  ) : (
    <div
      style={{
        ...dim,
        background: `hsl(${hueOf(name)} 45% 32%)`,
        fontSize: size * 0.4,
      }}
      className="rounded-full flex items-center justify-center font-bold text-white"
    >
      {initialsOf(name)}
    </div>
  );

  if (!ring) return inner;
  return (
    <div style={ringStyle} className="inline-flex">
      <div
        style={{ padding: 2, background: "var(--bg)", borderRadius: "9999px" }}
      >
        {inner}
      </div>
    </div>
  );
}
