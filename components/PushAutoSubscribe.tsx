"use client";

import { useEffect } from "react";
import { pushSupported, subscribeToPush } from "@/lib/pushClient";

/// Silent: if the user has already granted notification permission (e.g. via
/// the rest-timer prompt), make sure this device has a live push subscription
/// stored server-side. No UI, runs once per load.
export default function PushAutoSubscribe() {
  useEffect(() => {
    if (!pushSupported()) return;
    if (Notification.permission !== "granted") return;
    void subscribeToPush();
  }, []);
  return null;
}
