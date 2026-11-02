// The StrengthLab wordmark. It lives in one place because it appears on both
// the login screen and the home header, and when it was inline markup in each
// the two drifted apart.
//
// The slant is skewX rather than font-style: italic: Geist ships no italic in
// the build the app loads, so asking for italic hands the browser a synthetic
// slant at whatever angle it chooses — steeper on iOS than on Android. A skew
// is one chosen angle everywhere.
//
// LAB carries the same lime as the trained-day rings on the profile calendar,
// so the mark is built from a colour the app already owns.

export default function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <h1
      className="font-extrabold uppercase tracking-[-0.03em] leading-none"
      style={{
        fontSize: size,
        transform: "skewX(-9deg)",
        transformOrigin: "0 100%",
      }}
    >
      Strength<span style={{ color: "#a3e635" }}>Lab</span>
    </h1>
  );
}
