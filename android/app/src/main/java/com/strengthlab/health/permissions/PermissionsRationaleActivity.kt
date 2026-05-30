package com.strengthlab.health.permissions

import android.os.Bundle
import android.widget.TextView
import androidx.activity.ComponentActivity

/**
 * Shown when the user taps "privacy policy" inside the Health Connect
 * permission dialog. Health Connect refuses to grant permissions unless this
 * Activity is declared (see manifest). Keep it lightweight.
 */
class PermissionsRationaleActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(
            TextView(this).apply {
                setPadding(48, 96, 48, 48)
                text = buildString {
                    append("StrengthLab Health\n\n")
                    append("We read your heart-rate data from Health Connect ")
                    append("solely to sync workout and resting heart rate to your ")
                    append("StrengthLab account. Data is sent over HTTPS to your ")
                    append("account and is never sold or shared with third parties.\n\n")
                    append("You can revoke this access at any time in Health Connect.")
                }
            },
        )
    }
}
