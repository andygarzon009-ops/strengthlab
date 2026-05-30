package com.strengthlab.health.service

import kotlinx.coroutines.flow.Flow
import java.time.Instant

/** A single HR reading from an active sensor (BLE strap, watch, etc.). */
data class HeartRateSample(val bpm: Int, val timestamp: Instant)

/**
 * Abstraction over whatever produces live HR. Swap the implementation for a
 * real BLE GATT client (Heart Rate Service 0x180D / measurement char 0x2A37).
 */
interface HeartRateSource {
    /** Hot stream of readings; completes when the sensor disconnects. */
    fun stream(): Flow<HeartRateSample>
}
