import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

// Whether this account can actually be reached, and if not, which link in the
// chain is broken.
//
// Push has four independent points of failure — the key the browser gets, the
// key pair the server signs with, a subscription on the device, a row on the
// server — and every one of them fails silently. Reporting them plainly is the
// difference between a five-minute fix and another round of guessing.

export const dynamic = "force-dynamic";

const b64u = (s: string) =>
  Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/// Shape of a VAPID key as stored, without revealing it. A public key is 65
/// bytes starting 0x04; a private key is 32.
function describe(raw: string | undefined, expectBytes: number) {
  if (!raw) return { set: false as const, problem: "missing" };
  const clean = raw.trim().replace(/^["']|["']$/g, "");
  if (clean !== raw) {
    // The exact failure seen in the field: quotes or whitespace survive into
    // the value and atob() throws InvalidCharacterError in the browser.
    return { set: true as const, problem: "has quotes or whitespace", chars: raw.length };
  }
  const bad = clean.replace(/[A-Za-z0-9_-]/g, "");
  if (bad) return { set: true as const, problem: `${bad.length} non-base64url chars`, chars: raw.length };
  const bytes = b64u(clean).length;
  if (bytes !== expectBytes) {
    return { set: true as const, problem: `${bytes} bytes, expected ${expectBytes}`, chars: raw.length };
  }
  return { set: true as const, problem: null, chars: raw.length };
}

/// Does the private key actually belong to the public point? A mismatched pair
/// signs pushes that every browser vendor then rejects.
function pairValid(pub: string, priv: string): boolean {
  try {
    const P = b64u(pub.trim());
    const D = b64u(priv.trim());
    if (P.length !== 65 || D.length !== 32) return false;
    crypto.createPrivateKey({
      key: {
        kty: "EC",
        crv: "P-256",
        x: P.subarray(1, 33).toString("base64url"),
        y: P.subarray(33, 65).toString("base64url"),
        d: D.toString("base64url"),
      },
      format: "jwk",
    });
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const session = await getSession();
  if (!session?.userId) return Response.json({ devices: 0 });

  const devices = await prisma.pushSubscription.count({
    where: { userId: session.userId },
  });

  const pub = process.env.VAPID_PUBLIC_KEY;
  const npub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;

  return Response.json({
    devices,
    configured: !!(pub && priv),
    keys: {
      serverPublic: describe(pub, 65),
      browserPublic: describe(npub, 65),
      privateKey: describe(priv, 32),
      // The browser subscribes against one key and the server signs with the
      // other; different values mean every push is rejected on delivery.
      publicKeysMatch: !!pub && !!npub && pub.trim() === npub.trim(),
      pairValid: !!pub && !!priv && pairValid(pub, priv),
    },
  });
}
