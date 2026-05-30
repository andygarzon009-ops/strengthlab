package com.strengthlab.health.sync

import android.content.Context
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.strengthlab.health.auth.TokenStore
import com.strengthlab.health.permissions.HealthConnectManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.Duration
import java.time.Instant

/**
 * Passive fallback sync: runs periodically even when the app is closed. Reads
 * recent HR from Health Connect (requires the background-read grant) and ships
 * it to the StrengthLab backend.
 *
 * NOTE: this time-window read is the simple fallback. For production-grade
 * incremental sync, persist a Health Connect *changes token* and call
 * getChanges(token) instead — see the project README.
 */
class HealthConnectSyncWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    private val healthConnect = HealthConnectManager(appContext)
    private val tokenStore = TokenStore(appContext)

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val client = healthConnect.clientOrNull()
            ?: return@withContext Result.success() // HC gone — nothing to do

        // Background read is mandatory here. If revoked, stop scheduling churn.
        if (!healthConnect.hasBackgroundRead()) return@withContext Result.success()

        val token = tokenStore.token()
            ?: return@withContext Result.success() // not signed in yet

        // Slightly-overlapping recent window; the server de-dupes by (user,
        // timestamp), so overlap safely guards against gaps between runs.
        val end = Instant.now()
        val start = end.minus(Duration.ofMinutes(120))

        val request = ReadRecordsRequest(
            recordType = HeartRateRecord::class,
            timeRangeFilter = TimeRangeFilter.between(start, end),
            ascendingOrder = true,
        )

        val payload: List<HrSampleDto> = try {
            client.readRecords(request).records.flatMap { record ->
                record.samples.map { s ->
                    HrSampleDto(
                        bpm = s.beatsPerMinute,
                        recordedAt = s.time.toString(),
                        sourceApp = record.metadata.dataOrigin.packageName,
                    )
                }
            }
        } catch (e: SecurityException) {
            // Permission revoked between the check and the read — fail soft.
            return@withContext Result.success()
        } catch (e: Exception) {
            // Transient HC/IPC failure — let WorkManager back off and retry.
            return@withContext Result.retry()
        }

        if (payload.isEmpty()) return@withContext Result.success()

        when (BackendUploader.upload(token, payload)) {
            BackendUploader.Outcome.SUCCESS -> Result.success()
            BackendUploader.Outcome.RETRY -> Result.retry()
            BackendUploader.Outcome.UNAUTHORIZED -> {
                // Token expired/invalid — drop it so the UI prompts a re-login.
                tokenStore.clear()
                Result.success()
            }
        }
    }
}
