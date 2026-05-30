package com.strengthlab.health.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.metadata.Device
import androidx.health.connect.client.records.metadata.Metadata
import com.strengthlab.health.permissions.HealthConnectManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId

/**
 * Sticky, typed (health) foreground service. While alive it:
 *   1. holds an ongoing notification (required for FGS),
 *   2. collects live HR from a [HeartRateSource] as a Flow,
 *   3. batches samples and writes HeartRateRecords to Health Connect.
 *
 * Runs with the screen off because it is a foreground service of type "health".
 */
class HeartRateTrackingService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var collectJob: Job? = null

    private val healthConnect by lazy { HealthConnectManager(applicationContext) }

    // Replace with your injected BLE implementation.
    private val source: HeartRateSource by lazy { FakeHeartRateSource() }

    override fun onCreate() {
        super.onCreate()
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        promoteToForeground()
        startCollecting()
        // START_STICKY: the OS re-creates the service after killing us under
        // memory pressure, so tracking resumes automatically.
        return START_STICKY
    }

    private fun startCollecting() {
        if (collectJob?.isActive == true) return
        collectJob = scope.launch {
            val client = healthConnect.clientOrNull() ?: run { stopSelf(); return@launch }
            val rules = ZoneId.systemDefault().rules

            val buffer = ArrayList<HeartRateRecord.Sample>(16)
            var windowStart: Instant? = null

            source.stream()
                .catch { /* sensor dropped — idle, don't crash the service */ }
                .collect { sample ->
                    if (windowStart == null) windowStart = sample.timestamp
                    buffer += HeartRateRecord.Sample(
                        time = sample.timestamp,
                        beatsPerMinute = sample.bpm.toLong(),
                    )
                    updateNotification(sample.bpm)

                    if (buffer.size >= 12) {
                        flush(client, buffer.toList(), windowStart!!, sample.timestamp, rules)
                        buffer.clear()
                        windowStart = null
                    }
                }
        }
    }

    private suspend fun flush(
        client: HealthConnectClient,
        samples: List<HeartRateRecord.Sample>,
        start: Instant,
        end: Instant,
        rules: java.time.zone.ZoneRules,
    ) {
        // Re-check the grant every flush: the user can revoke mid-session.
        if (!healthConnect.hasForegroundPermissions()) { stopSelf(); return }

        val record = HeartRateRecord(
            startTime = start,
            startZoneOffset = rules.getOffset(start),
            endTime = end,
            endZoneOffset = rules.getOffset(end),
            samples = samples,
            // Actively recorded from a live sensor (vs manual/auto).
            metadata = Metadata.activelyRecorded(
                device = Device(type = Device.TYPE_CHEST_STRAP),
            ),
        )
        runCatching { client.insertRecords(listOf(record)) }
            // SecurityException here == permission revoked → fail soft.
            .onFailure { stopSelf() }
    }

    // ── Foreground / notification plumbing ──────────────────────────────

    private fun promoteToForeground() {
        val notification = buildNotification(bpm = null)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                NOTIF_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH,
            )
        } else {
            startForeground(NOTIF_ID, notification)
        }
    }

    private fun updateNotification(bpm: Int) {
        notificationManager().notify(NOTIF_ID, buildNotification(bpm))
    }

    private fun buildNotification(bpm: Int?): Notification =
        NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("StrengthLab — tracking heart rate")
            .setContentText(bpm?.let { "$it bpm" } ?: "Waiting for sensor…")
            .setSmallIcon(android.R.drawable.ic_menu_compass) // replace with app icon
            .setOngoing(true)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()

    private fun createChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Heart rate tracking",
            NotificationManager.IMPORTANCE_LOW,
        ).apply { description = "Ongoing while StrengthLab records your heart rate" }
        notificationManager().createNotificationChannel(channel)
    }

    private fun notificationManager() =
        getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    override fun onDestroy() {
        collectJob?.cancel()
        scope.coroutineContext[Job]?.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val CHANNEL_ID = "hr_tracking"
        private const val NOTIF_ID = 4201

        fun start(context: Context) {
            context.startForegroundService(
                Intent(context, HeartRateTrackingService::class.java),
            )
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, HeartRateTrackingService::class.java))
        }
    }
}
