package com.strengthlab.health.sync

import com.strengthlab.health.BuildConfig
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

/** Wire-ready DTO — serialised to JSON for POST /api/health/hr-ingest. */
data class HrSampleDto(
    val bpm: Long,
    val recordedAt: String, // ISO-8601 UTC
    val sourceApp: String,
)

/**
 * Posts ambient HR samples to StrengthLab's Android-only ingest route.
 * Returns an [Outcome] so the worker can distinguish "retry later" (network /
 * 5xx) from "give up" (auth failure / bad request).
 */
object BackendUploader {

    enum class Outcome { SUCCESS, RETRY, UNAUTHORIZED }

    private val http = OkHttpClient()
    private val endpoint = "${BuildConfig.API_BASE_URL}/api/health/hr-ingest"
    private val JSON = "application/json".toMediaType()

    fun upload(token: String, samples: List<HrSampleDto>): Outcome {
        val payload = JSONObject().apply {
            put("samples", JSONArray(samples.map {
                JSONObject().apply {
                    put("bpm", it.bpm)
                    put("recordedAt", it.recordedAt)
                    put("sourceApp", it.sourceApp)
                }
            }))
        }.toString().toRequestBody(JSON)

        val request = Request.Builder()
            .url(endpoint)
            .header("Authorization", "Bearer $token")
            .post(payload)
            .build()

        return runCatching {
            http.newCall(request).execute().use { resp ->
                when {
                    resp.isSuccessful -> Outcome.SUCCESS
                    resp.code == 401 -> Outcome.UNAUTHORIZED
                    resp.code in 400..499 -> Outcome.SUCCESS // unprocessable; don't loop
                    else -> Outcome.RETRY                    // 5xx → back off
                }
            }
        }.getOrDefault(Outcome.RETRY) // network failure → retry
    }
}
