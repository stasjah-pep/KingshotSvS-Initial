package com.companionapp

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException

class MainActivity : AppCompatActivity() {

    private val client = OkHttpClient()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val prefs = getSharedPreferences("CompanionAppPrefs", Context.MODE_PRIVATE)
        val isOffline = prefs.getBoolean("isOfflineMode", false)
        if (isOffline) {
            val intent = Intent(this, OfflineActivity::class.java)
            startActivity(intent)
            finish()
            return
        }

        val token = prefs.getString("sessionToken", null)
        if (token != null) {
            val intent = Intent(this, DashboardActivity::class.java)
            startActivity(intent)
            finish()
            return
        }

        setContentView(R.layout.activity_auth)

        val etServerUrl = findViewById<EditText>(R.id.etServerUrl)
        val etUsername = findViewById<EditText>(R.id.etUsername)
        val etPassword = findViewById<EditText>(R.id.etPassword)
        val btnLogin = findViewById<Button>(R.id.btnLogin)
        val btnOfflineMode = findViewById<Button>(R.id.btnOfflineMode)

        val savedUrl = prefs.getString("serverUrl", "http://10.0.2.2:3001")
        etServerUrl.setText(savedUrl)

        btnOfflineMode.setOnClickListener {
            prefs.edit().apply {
                putBoolean("isOfflineMode", true)
                remove("sessionToken")
                apply()
            }
            val intent = Intent(this@MainActivity, OfflineActivity::class.java)
            startActivity(intent)
            finish()
        }

        btnLogin.setOnClickListener {
            val url = etServerUrl.text.toString().removeSuffix("/")
            val username = etUsername.text.toString()
            val password = etPassword.text.toString()

            val json = JSONObject()
            json.put("username", username)
            json.put("password", password)

            val body = json.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
            val request = Request.Builder()
                .url("$url/api/login")
                .post(body)
                .build()

            client.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    runOnUiThread {
                        Toast.makeText(this@MainActivity, "Network error", Toast.LENGTH_SHORT).show()
                    }
                }

                override fun onResponse(call: Call, response: Response) {
                    val respBody = response.body?.string()
                    if (respBody != null) {
                        val respJson = JSONObject(respBody)
                        if (respJson.optBoolean("success", false)) {
                            val sessionToken = respJson.getString("token")
                            val userObj = respJson.getJSONObject("user")
                            val pId = userObj.optString("playerId", null)
                            val userRole = userObj.optString("role", "USER")
                            val username = userObj.optString("username", "")

                            prefs.edit().apply {
                                putString("serverUrl", url)
                                putString("sessionToken", sessionToken)
                                putString("userRole", userRole)
                                putString("username", username)
                                if (pId != null && pId != "null") {
                                    putString("playerId", pId)
                                } else {
                                    remove("playerId")
                                }
                                apply()
                            }

                            runOnUiThread {
                                val intent = Intent(this@MainActivity, DashboardActivity::class.java)
                                startActivity(intent)
                                finish()
                            }
                        } else {
                            runOnUiThread {
                                val msg = respJson.optString("message", "Invalid credentials")
                                Toast.makeText(this@MainActivity, msg, Toast.LENGTH_LONG).show()
                            }
                        }
                    }
                }
            })
        }
    }
}
