# Health Connect + OkHttp keep rules are bundled with the libraries.
# Keep Worker/Service entry points referenced by name from the manifest.
-keep class com.strengthlab.health.service.HeartRateTrackingService { *; }
-keep class com.strengthlab.health.sync.HealthConnectSyncWorker { *; }
