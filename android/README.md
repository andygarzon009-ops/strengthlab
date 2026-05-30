# StrengthLab Health (Android companion)

Native Android companion that tracks heart rate via **Health Connect** and syncs
it to StrengthLab. This is **separate** from the web app's legacy Google Health
API / Fitbit cloud flow (which still serves iOS users) — this module pushes
samples to a dedicated endpoint, `POST /api/health/hr-ingest`.

## Architecture

| Layer | File | Role |
|---|---|---|
| App init | `StrengthLabApp.kt` | Schedules the periodic sync worker (`ExistingPeriodicWorkPolicy.KEEP`). |
| Permissions | `permissions/HealthConnectManager.kt` | SDK status, permission set (incl. `READ_HEALTH_DATA_IN_BACKGROUND`), request contract. |
| Rationale | `permissions/PermissionsRationaleActivity.kt` | Required HC privacy screen (manifest intent-filter). |
| Live capture | `service/HeartRateTrackingService.kt` | Sticky `health`-typed foreground service; batches BLE samples → writes `HeartRateRecord`. |
| Sensor | `service/HeartRateSource.kt`, `FakeHeartRateSource.kt` | BLE abstraction + a simulator. Swap in a GATT client (HR Service `0x180D`). |
| Background sync | `sync/HealthConnectSyncWorker.kt` | `CoroutineWorker`; reads recent HR, uploads, handles revoked perms / 401 / retry. |
| Upload | `sync/BackendUploader.kt` | `POST /api/health/hr-ingest` with bearer token. |
| Auth | `auth/AuthApi.kt`, `auth/TokenStore.kt` | `POST /api/auth/token` → JWT persisted in DataStore. |
| Battery | `util/BatteryOptimization.kt` | Doze exemption prompt. |
| UI | `MainActivity.kt` | Minimal control surface showing the correct permission order. |

## Build

```bash
cd android
./gradlew :app:assembleDebug      # add a Gradle wrapper first (gradle wrapper)
```

`API_BASE_URL` is set in `app/build.gradle.kts` (`BuildConfig.API_BASE_URL`,
defaults to `https://strengthlab-henna.vercel.app`).

> No Gradle wrapper is committed. Run `gradle wrapper --gradle-version 8.11.1`
> once (with a local Gradle) to generate `gradlew` + `gradle/wrapper/`.

## Permission order (matters)

1. Sign in → bearer token.
2. `POST_NOTIFICATIONS` (Android 13+) — needed for the FGS notification.
3. Health Connect **foreground** read/write, **then** `READ_HEALTH_DATA_IN_BACKGROUND`.
   Android only grants background *after* foreground exists, so a fresh install
   may need the dialog twice.
4. Battery-optimisation exemption.
5. Start the foreground service.

## Payload contract

```json
POST /api/health/hr-ingest
Authorization: Bearer <jwt>
{ "samples": [ { "bpm": 72, "recordedAt": "2026-05-29T18:00:00Z", "sourceApp": "com.strengthlab.health" } ] }
```

The server validates, de-dupes by `(userId, timestamp)`, and bulk-inserts into
the `AmbientHeartRateSample` table (separate from the Fitbit
`WorkoutHeartRateSample` table — the two pipelines never collide).

## Production upgrade: Changes API

The worker currently does a 2-hour overlapping time-window read (simple, relies
on server-side de-dupe). For efficient incremental sync, switch to a persisted
**changes token**:

1. First run: `client.getChangesToken(ChangesTokenRequest(setOf(HeartRateRecord::class)))` → store it.
2. Each run: `client.getChanges(token)`, process `UpsertionChange` / `DeletionChange`,
   then store `response.nextChangesToken`.
3. If `response.changesTokenExpired`, fall back to the time-window read and mint a fresh token.

## Notes / gotchas

- `connect-client` is pinned to `1.1.0-rc02` (background read + new
  `Metadata.activelyRecorded` factories). Bump to the latest **stable** before release.
- Background health read is a **sensitive scope** — Google requires a Health
  Connect declaration form + demo video before public Play Store release.
- The bearer JWT is the same 7-day token the web session uses; on `401` the
  worker clears it and the UI should re-prompt sign-in.
