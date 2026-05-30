package com.strengthlab.health.auth

import com.strengthlab.health.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

/** Exchanges email + password for the bearer JWT and persists it. */
object AuthApi {

    private val http = OkHttpClient()
    private val endpoint = "${BuildConfig.API_BASE_URL}/api/auth/token"
    private val JSON = "application/json".toMediaType()

    suspend fun signIn(
        tokenStore: TokenStore,
        email: String,
        password: String,
    ): Boolean = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("email", email)
            .put("password", password)
            .toString()
            .toRequestBody(JSON)

        val request = Request.Builder().url(endpoint).post(body).build()

        runCatching {
            http.newCall(request).execute().use { resp ->
                if (!resp.isSuccessful) return@use false
                val token = JSONObject(resp.body?.string().orEmpty())
                    .optString("token")
                    .ifBlank { return@use false }
                tokenStore.save(token)
                true
            }
        }.getOrDefault(false)
    }
}
