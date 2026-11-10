import type { Metadata } from "next";
import LegalPage from "../LegalPage";

export const metadata: Metadata = { title: "Terms of Service · StrengthLab" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="November 10, 2026">
      <p>
        StrengthLab is a free, invite-only workout tracker for friends and
        family. By using it you agree to these terms.
      </p>

      <h2>Not medical advice</h2>
      <p>
        Recovery, sleep and fuel scores, coaching suggestions and AI calorie
        estimates are for general fitness information only. They are not
        medical advice. Check with a doctor before starting a new training or
        nutrition program, and stop if something hurts.
      </p>

      <h2>Your account</h2>
      <p>
        Keep your login to yourself and only log your own data. Be respectful
        in comments and reactions. Accounts used to harass others may be
        removed.
      </p>

      <h2>Your content</h2>
      <p>
        What you log stays yours. You let StrengthLab store and display it so
        the app works, including showing workouts to people who follow you.
        How data is handled is described in the{" "}
        <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>Connected services</h2>
      <p>
        Connecting Google Health is optional and read-only. Your use of
        Google and Fitbit is also governed by their own terms.
      </p>

      <h2>No warranty</h2>
      <p>
        StrengthLab is provided as is, without warranties of any kind. It may
        change, be unavailable, or lose data, and to the extent the law
        allows, its developer is not liable for any damages arising from its
        use.
      </p>

      <h2>Changes</h2>
      <p>
        These terms may be updated; the date at the top shows the latest
        version. Continuing to use the app means you accept the changes.
      </p>
    </LegalPage>
  );
}
