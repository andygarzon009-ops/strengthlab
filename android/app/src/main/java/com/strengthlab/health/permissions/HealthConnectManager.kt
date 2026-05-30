package com.strengthlab.health.permissions

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.HeartRateRecord

/**
 * Single source of truth for Health Connect availability and permissions.
 * Stateless and cheap to construct — create one per screen/service/worker.
 */
class HealthConnectManager(private val context: Context) {

    /** The full permission set StrengthLab needs for HR tracking + background sync. */
    val permissions: Set<String> = setOf(
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getWritePermission(HeartRateRecord::class),
        HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND,
    )

    /** Permissions required just to start a foreground tracking session. */
    val foregroundPermissions: Set<String> = setOf(
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getWritePermission(HeartRateRecord::class),
    )

    private val providerPackage = "com.google.android.apps.healthdata"

    sealed interface Availability {
        data object Available : Availability
        data object UpdateRequired : Availability
        data object Unavailable : Availability
    }

    fun availability(): Availability =
        when (HealthConnectClient.getSdkStatus(context, providerPackage)) {
            HealthConnectClient.SDK_AVAILABLE -> Availability.Available
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED ->
                Availability.UpdateRequired
            else -> Availability.Unavailable
        }

    /**
     * Returns a client only when HC is actually usable. Callers MUST handle null
     * instead of assuming HC exists — primary edge-case guard.
     */
    fun clientOrNull(): HealthConnectClient? =
        if (availability() == Availability.Available)
            HealthConnectClient.getOrCreate(context, providerPackage)
        else null

    suspend fun grantedPermissions(): Set<String> =
        clientOrNull()?.permissionController?.getGrantedPermissions() ?: emptySet()

    suspend fun hasAllPermissions(): Boolean =
        grantedPermissions().containsAll(permissions)

    suspend fun hasForegroundPermissions(): Boolean =
        grantedPermissions().containsAll(foregroundPermissions)

    suspend fun hasBackgroundRead(): Boolean =
        grantedPermissions().contains(
            HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND,
        )

    /**
     * Activity Result contract that launches the Health Connect permission UI.
     *
     *   val launcher = registerForActivityResult(hc.requestPermissionsContract()) {
     *       granted -> if (granted.containsAll(hc.permissions)) startTracking()
     *   }
     *   launcher.launch(hc.permissions)
     */
    fun requestPermissionsContract() =
        PermissionController.createRequestPermissionResultContract(providerPackage)
}
