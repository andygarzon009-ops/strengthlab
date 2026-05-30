package com.strengthlab.health.util

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings

/**
 * Doze / battery-optimisation helper. Foreground services and WorkManager are
 * both throttled under Doze; exempting the app materially improves reliability
 * of background HR sync. Always *ask* — never assume the exemption is granted.
 */
object BatteryOptimization {

    fun isIgnored(context: Context): Boolean =
        (context.getSystemService(Context.POWER_SERVICE) as PowerManager)
            .isIgnoringBatteryOptimizations(context.packageName)

    /** Launch the system prompt to exempt the app. No-op if already exempt. */
    fun requestExemption(context: Context) {
        if (isIgnored(context)) return
        context.startActivity(
            Intent(
                Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:${context.packageName}"),
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}
