# Google Health API Setup — StrengthLab

One-time setup to wire `/health` to your Fitbit data via Google's Health API.

## 1. Google Cloud project

1. https://console.cloud.google.com → **Select a project** → **New Project**
2. Name: `strengthlab-health` → **Create** → select it
3. ☰ menu → **APIs & Services → Library**
4. Search **Google Health API** → **Enable**

## 2. OAuth consent screen

1. ☰ menu → **APIs & Services → OAuth consent screen**
2. **Get Started**
3. Section 1 — App name: `StrengthLab`, support email: your gmail → **Next**
4. Section 2 — User type: **External** → **Next**
5. Section 3 — Contact email: your gmail → **Next**
6. Section 4 — agree to policy → **Create**

## 3. OAuth client

1. **APIs & Services → Credentials → + Create Credentials → OAuth client ID**
2. Application type: **Web application**, name: `strengthlab-web`
3. **Authorized redirect URIs** → **+ Add URI** — add **both**:
   - `http://localhost:3000/api/health/google/callback`
   - `https://strengthlab.vercel.app/api/health/google/callback`
4. **Create** → download the JSON or copy:
   - `client_id`  → goes in env as `GOOGLE_HEALTH_CLIENT_ID`
   - `client_secret` → goes in env as `GOOGLE_HEALTH_CLIENT_SECRET`

## 4. Data Access (scopes)

1. **OAuth consent screen → Data Access → Add or remove scopes**
2. Filter by **Google Health API**, check:
   - `…/auth/googlehealth.activity_and_fitness.readonly`
   - `…/auth/googlehealth.heart_rate.readonly`
3. **Update → Save**

## 5. Test users

1. **OAuth consent screen → Audience → + Add users**
2. Add your gmail (the one linked to your Fitbit)
3. Anyone else who wants to connect must be added here while the app is in Testing mode

## 6. Fitbit app

Open the Fitbit mobile app on your phone → **Sign in with Google** → use the same Google account you added as a test user.

## 7. Env vars

Add three vars in **both** local `.env` and Vercel project settings:

| Key | Value |
|---|---|
| `GOOGLE_HEALTH_CLIENT_ID` | from step 3 |
| `GOOGLE_HEALTH_CLIENT_SECRET` | from step 3 |
| `GOOGLE_HEALTH_REDIRECT_URI` | local: `http://localhost:3000/api/health/google/callback`<br>prod: `https://strengthlab.vercel.app/api/health/google/callback` |

In Vercel set the redirect URI to the **prod** value. Locally use the **local** value.

## 8. Apply the DB migration

The Supabase rule: migrations are applied to prod **before** pushing code that depends on them.

```sql
-- prisma/migrations/0009_health_account.sql — paste into Supabase SQL editor
```

Run it via Supabase dashboard → **SQL Editor** → paste the file contents → **Run**.

## 9. Use it

1. `npm run dev`
2. Log in → **Profile → Health & Fitbit**
3. Click **Connect Fitbit via Google** → Google consent → land back at `/health?connected=1`
4. Click **Pull last 7 days** to see exercise sessions and average heart rate

## Notes

- Tokens are stored in `HealthAccount` (one per user). Access tokens are refreshed automatically when within 60s of expiry.
- All data is fetched live on demand. No background sync yet — add a cron later if needed.
- To add more scopes (sleep, weight): add them to `HEALTH_SCOPES` in `lib/googleHealth.ts`, update the consent screen's Data Access, and have users reconnect.
