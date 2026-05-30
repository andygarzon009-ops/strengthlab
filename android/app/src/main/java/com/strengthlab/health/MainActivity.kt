package com.strengthlab.health

import android.Manifest
import android.os.Build
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.lifecycleScope
import com.strengthlab.health.auth.AuthApi
import com.strengthlab.health.auth.TokenStore
import com.strengthlab.health.permissions.HealthConnectManager
import com.strengthlab.health.service.HeartRateTrackingService
import com.strengthlab.health.util.BatteryOptimization
import kotlinx.coroutines.launch

/**
 * Minimal control surface for the companion app. A real build would replace
 * this with your branded onboarding, but the wiring here shows the correct
 * order of operations:
 *
 *   1. sign in (bearer token),
 *   2. POST_NOTIFICATIONS (Android 13+),
 *   3. Health Connect foreground permissions, THEN background read,
 *   4. battery-optimisation exemption,
 *   5. start the foreground tracking service.
 */
class MainActivity : ComponentActivity() {

    private val healthConnect by lazy { HealthConnectManager(this) }
    private val tokenStore by lazy { TokenStore(this) }
    private lateinit var status: TextView

    private val requestHealthPermissions =
        registerForActivityResult(healthConnect.requestPermissionsContract()) { granted ->
            if (granted.containsAll(healthConnect.permissions)) {
                setStatus("Health Connect: all permissions granted ✓")
            } else if (granted.containsAll(healthConnect.foregroundPermissions)) {
                setStatus("Foreground granted — re-request to add Background read")
            } else {
                setStatus("Health Connect permissions incomplete")
            }
        }

    private val requestNotifications =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* best-effort */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        status = TextView(this)

        setContentView(
            LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(48, 96, 48, 48)
                addView(status)
                addView(button("Sign in") { signIn() })
                addView(button("Grant Health Connect access") { grantHealthConnect() })
                addView(button("Allow background / battery") { allowBackground() })
                addView(button("Start tracking") { startTracking() })
                addView(button("Stop tracking") { HeartRateTrackingService.stop(this@MainActivity) })
            },
        )

        when (healthConnect.availability()) {
            HealthConnectManager.Availability.Available -> setStatus("Ready.")
            HealthConnectManager.Availability.UpdateRequired ->
                setStatus("Update Health Connect from the Play Store to continue.")
            HealthConnectManager.Availability.Unavailable ->
                setStatus("Health Connect isn't available on this device.")
        }
    }

    // ── Step 1: sign in ────────────────────────────────────────────────
    private fun signIn() = lifecycleScope.launch {
        // Replace these with a real credential form.
        val ok = AuthApi.signIn(
            tokenStore = tokenStore,
            email = "you@example.com",
            password = "replace-me",
        )
        setStatus(if (ok) "Signed in ✓" else "Sign-in failed — check credentials")
    }

    // ── Step 2 + 3: notifications, then HC foreground + background ──────
    private fun grantHealthConnect() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        // The HC dialog handles foreground + background in one set; Android
        // only actually grants background AFTER foreground exists, so on a
        // fresh install the user may need to tap this twice.
        requestHealthPermissions.launch(healthConnect.permissions)
    }

    // ── Step 4: battery exemption ──────────────────────────────────────
    private fun allowBackground() = BatteryOptimization.requestExemption(this)

    // ── Step 5: start the typed foreground service ─────────────────────
    private fun startTracking() = lifecycleScope.launch {
        if (!healthConnect.hasForegroundPermissions()) {
            Toast.makeText(this@MainActivity, "Grant Health Connect access first", Toast.LENGTH_SHORT).show()
            return@launch
        }
        HeartRateTrackingService.start(this@MainActivity)
        setStatus("Tracking started — runs with the screen off.")
    }

    private fun setStatus(text: String) { status.text = text }

    private fun button(label: String, onClick: () -> Unit) =
        Button(this).apply {
            text = label
            setOnClickListener { onClick() }
        }
}
