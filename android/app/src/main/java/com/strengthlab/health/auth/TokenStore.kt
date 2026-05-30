package com.strengthlab.health.auth

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "strengthlab_auth")

/**
 * Persists the bearer JWT returned from /api/auth/token. The token is the same
 * 7-day session token the web app uses; on a 401 the app re-authenticates and
 * overwrites it here.
 */
class TokenStore(private val context: Context) {

    suspend fun token(): String? =
        context.dataStore.data.map { it[KEY_TOKEN] }.first()

    suspend fun save(token: String) {
        context.dataStore.edit { it[KEY_TOKEN] = token }
    }

    suspend fun clear() {
        context.dataStore.edit { it.remove(KEY_TOKEN) }
    }

    companion object {
        private val KEY_TOKEN = stringPreferencesKey("bearer_token")
    }
}
