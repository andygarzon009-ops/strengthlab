import type { Metadata } from "next";
import LegalPage from "../LegalPage";

export const metadata: Metadata = { title: "Privacy Policy · StrengthLab" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="November 10, 2026">
      <p>
        StrengthLab is a workout tracker for a small group of friends and
        family. This page explains what data the app collects, how it is used,
        and the choices you have.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details:</strong> your name, email address and a
          hashed password.
        </li>
        <li>
          <strong>What you log:</strong> workouts, sets, reps and weights,
          body measurements, food entries and photos, comments, reactions and
          the people you follow.
        </li>
        <li>
          <strong>Google Health data (only if you connect it):</strong>{" "}
          exercise sessions, heart rate, resting heart rate, heart-rate
          variability, blood oxygen, breathing rate, sleep, skin temperature,
          active energy and body weight from your Fitbit or other device, read
          through the Google Health API with read-only access.
        </li>
      </ul>

      <h2>How we use it</h2>
      <p>
        Your data is used only to run StrengthLab&apos;s features for you:
        showing your history and charts, detecting personal records, working
        out your recovery, sleep and fuel scores, and generating coaching
        suggestions. Workouts you log are visible to people you let follow
        you; health data from Google is shown only to you.
      </p>
      <p>
        To produce coaching suggestions and estimate calories from food photos,
        the relevant data is sent to AI model providers (Google Gemini and
        Anthropic Claude) to process your request. They receive only what that
        feature needs.
      </p>

      <h2>Google user data</h2>
      <p>
        StrengthLab&apos;s use and transfer of information received from
        Google APIs adheres to the{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noreferrer"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. In particular, we:
      </p>
      <ul>
        <li>use Google Health data only to provide features you can see in the app;</li>
        <li>never sell it, or use or transfer it for advertising;</li>
        <li>
          never use it to determine creditworthiness or for lending purposes;
        </li>
        <li>
          do not let people read it, except with your permission, for
          security, to comply with the law, or when it is aggregated and
          anonymised for running the app.
        </li>
      </ul>

      <h2>Storage and security</h2>
      <p>
        Data is stored in a hosted Postgres database (Supabase) and photos in
        Vercel Blob storage, both encrypted in transit. Google access tokens
        are kept server-side and are never exposed to the browser.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>
          Disconnect Google Health at any time from Profile → Health &amp;
          Fitbit, or revoke access at{" "}
          <a
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noreferrer"
          >
            myaccount.google.com/permissions
          </a>
          .
        </li>
        <li>
          Ask the StrengthLab admin to delete your account and all associated
          data, including stored Google Health data, and it will be removed.
        </li>
      </ul>

      <h2>Changes</h2>
      <p>
        If this policy changes, the date at the top will be updated.
      </p>
    </LegalPage>
  );
}
