import "server-only";

/// Delayed HTTP callbacks via QStash.
///
/// A rest timer that survives a locked screen can't live in the page: iOS
/// suspends the tab and freezes every JS timer, so setTimeout fires late or
/// not at all. And a Vercel function can't hold a 90-second timer open — it
/// would be billed for sitting idle and would break for rests longer than the
/// function's max duration.
///
/// So the schedule lives off-box: publish "call me back in N seconds" and let
/// QStash make the request. By then the work is server-side and a Web Push
/// reaches a locked phone the same way any notification does.

const QSTASH_PUBLISH = "https://qstash.upstash.io/v2/publish";

/** The stable public origin QStash should call back. */
export function publicOrigin(): string | null {
  const explicit = process.env.PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return null;
}

export function qstashConfigured(): boolean {
  return Boolean(
    process.env.QSTASH_TOKEN?.trim() &&
      process.env.REST_PUSH_SECRET?.trim() &&
      publicOrigin()
  );
}

/**
 * Ask QStash to POST `body` to `path` after `delaySeconds`.
 *
 * Best-effort by design: a scheduling failure must never break logging a set,
 * and the in-app cue already covers the case where the athlete is looking at
 * the screen. Returns true only when QStash accepted the message.
 */
export async function publishDelayed(
  path: string,
  body: unknown,
  delaySeconds: number
): Promise<boolean> {
  try {
    const token = process.env.QSTASH_TOKEN?.trim();
    const secret = process.env.REST_PUSH_SECRET?.trim();
    const origin = publicOrigin();
    if (!token || !secret || !origin) return false;

    const destination = `${origin}${path}`;
    const res = await fetch(`${QSTASH_PUBLISH}/${destination}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        // QStash holds the message and delivers it this far in the future.
        "Upstash-Delay": `${Math.max(1, Math.round(delaySeconds))}s`,
        // Anything prefixed Upstash-Forward- is passed through to the
        // destination with the prefix stripped. This is how the callback
        // proves the request came from our own scheduling call and not from
        // someone who guessed the URL.
        "Upstash-Forward-X-Rest-Secret": secret,
        // Don't retry a missed rest notification. A push that arrives minutes
        // late is worse than none — the athlete is mid-set by then.
        "Upstash-Retries": "0",
      },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}
