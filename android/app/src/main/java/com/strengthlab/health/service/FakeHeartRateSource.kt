package com.strengthlab.health.service

import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import java.time.Instant
import kotlin.random.Random

/**
 * Stand-in for a real BLE heart-rate sensor — emits a plausible reading every
 * second so the pipeline (service → Health Connect → backend) can be exercised
 * end to end without hardware. Replace with a BLE GATT implementation:
 *
 *   - scan for a device advertising the Heart Rate Service (UUID 0x180D),
 *   - connect, discover the Heart Rate Measurement characteristic (0x2A37),
 *   - enable notifications, parse the flags byte to read 8- vs 16-bit BPM,
 *   - emit each notification as a [HeartRateSample].
 */
class FakeHeartRateSource : HeartRateSource {
    override fun stream(): Flow<HeartRateSample> = flow {
        var bpm = 72
        while (true) {
            bpm = (bpm + Random.nextInt(-3, 4)).coerceIn(50, 180)
            emit(HeartRateSample(bpm = bpm, timestamp = Instant.now()))
            delay(1_000)
        }
    }
}
