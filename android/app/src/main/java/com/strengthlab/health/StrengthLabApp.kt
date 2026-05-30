package com.strengthlab.health

import android.app.Application
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.strengthlab.health.sync.HealthConnectSyncWorker
import java.time.Duration
import java.util.concurrent.TimeUnit

class StrengthLabApp : Application() {

    override fun onCreate() {
        super.onCreate()
        schedulePeriodicSync()
    }

    /** Passive fallback sync that runs even when the app/service is closed. */
    private fun schedulePeriodicSync() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        // 15 min is WorkManager's minimum periodic interval; 30 is gentler on battery.
        val request = PeriodicWorkRequestBuilder<HealthConnectSyncWorker>(
            repeatInterval = 30,
            repeatIntervalTimeUnit = TimeUnit.MINUTES,
        )
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, Duration.ofMinutes(5))
            .build()

        // KEEP: don't replace an already-enqueued job → no double scheduling when
        // the process is recreated.
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            UNIQUE_SYNC_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            request,
        )
    }

    companion object {
        private const val UNIQUE_SYNC_NAME = "hc_hr_periodic_sync"
    }
}
