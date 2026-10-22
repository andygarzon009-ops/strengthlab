import { redirect } from "next/navigation";

/// Preferred warm-ups left the settings (the saved ones still reach the
/// coach); old links land on Fuel settings, which took its place.
export default function PreferredWarmupsPage() {
  redirect("/profile/fuel");
}
