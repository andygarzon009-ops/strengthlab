import "server-only";
import { prisma } from "@/lib/db";

let vapidConfigured = false;

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

/// Fire a Web Push to every device a user has subscribed. FULLY defensive:
/// any failure (missing config, bad env value, web-push import/bundle issue,
/// dead subscription) is swallowed so it can NEVER break the calling action
/// (e.g. sending a friend request). Push is best-effort by definition.
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  try {
    const pub = process.env.VAPID_PUBLIC_KEY?.trim();
    const priv = process.env.VAPID_PRIVATE_KEY?.trim();
    if (!pub || !priv) return; // not configured → no-op

    const subs = await prisma.pushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) return; // nobody to notify; skip importing web-push

    const webpush = (await import("web-push")).default;
    if (!vapidConfigured) {
      const subject = (process.env.VAPID_SUBJECT || "mailto:hello@strengthlab.app").trim();
      webpush.setVapidDetails(subject, pub, priv);
      vapidConfigured = true;
    }

    const body = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body,
          );
        } catch (err: unknown) {
          // 404/410 = subscription expired/unsubscribed → remove it.
          const code = (err as { statusCode?: number })?.statusCode;
          if (code === 404 || code === 410) {
            await prisma.pushSubscription
              .delete({ where: { id: s.id } })
              .catch(() => {});
          }
        }
      }),
    );
  } catch {
    // Swallow everything — a push failure must not surface to the user.
  }
}
