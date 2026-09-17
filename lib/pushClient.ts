// Client-side Web Push subscription helper.

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export type SubscribeResult = { ok: boolean; reason: string };

/// Subscribe this device to Web Push and persist it server-side. Assumes
/// notification permission is already granted (caller handles the prompt).
///
/// Every failure path reports WHY. It used to return a bare false and swallow
/// the error, which is how every user in the database ended up with zero
/// subscriptions and no way to find out what was wrong — on iOS alone this can
/// be an un-installed PWA, a missing service worker, or a rejected subscribe,
/// and they need different fixes.
export async function subscribeToPush(): Promise<SubscribeResult> {
  if (typeof window === "undefined") return { ok: false, reason: "no-window" };
  if (!("serviceWorker" in navigator)) {
    return { ok: false, reason: "no-service-worker" };
  }
  if (!("PushManager" in window)) {
    // iOS only exposes PushManager to an installed PWA — in a Safari tab this
    // is the answer, and the fix is Add to Home Screen.
    return { ok: false, reason: "no-pushmanager (install the app?)" };
  }
  if (!("Notification" in window)) {
    return { ok: false, reason: "no-notification-api" };
  }
  if (Notification.permission !== "granted") {
    return { ok: false, reason: `permission-${Notification.permission}` };
  }
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) return { ok: false, reason: "no-vapid-key" };

  try {
    const reg =
      (await navigator.serviceWorker.getRegistration()) ??
      (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
    await navigator.serviceWorker.ready;

    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast: the DOM lib types BufferSource against ArrayBuffer, but our
        // Uint8Array is typed ArrayBufferLike — runtime is identical.
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      }));

    const json = sub.toJSON();
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    });
    if (!res.ok) return { ok: false, reason: `server-${res.status}` };
    return { ok: true, reason: "subscribed" };
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return { ok: false, reason: msg.slice(0, 120) };
  }
}
