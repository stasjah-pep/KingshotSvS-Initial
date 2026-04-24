package com.companionapp

import android.app.ActivityManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import androidx.core.app.NotificationCompat
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.widget.*
import androidx.core.app.ActivityCompat
import android.content.pm.PackageManager
import android.Manifest
import androidx.appcompat.app.AppCompatActivity
import com.companionapp.overlay.FloatingOverlayService
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONArray
import org.json.JSONObject

class DashboardActivity : AppCompatActivity() {

    private var socket: Socket? = null
    private val colors = listOf("red", "blue", "green", "purple", "#FFA500")
    private var selectedColor = "red"
    private var isEnemyRally = false
    private var selectedEnemyTeamId = ""

    private val teamsList = mutableListOf<JSONObject>()
    private val ralliesList = mutableListOf<JSONObject>()
    private val buttonsList = mutableListOf<JSONObject>()
    private val knownRallyIds = mutableSetOf<String>()

    private lateinit var llColorPicker: LinearLayout
    private lateinit var llTeamList: LinearLayout
    private lateinit var llEnemyTeams: LinearLayout
    private lateinit var llActionButtonsList: LinearLayout
    private lateinit var btnEnemyToggle: Button
    private lateinit var tvDebugInfo: TextView

    private val handler = android.os.Handler(android.os.Looper.getMainLooper())
    private val refreshRunnable = object : Runnable {
        override fun run() {
            refreshButtonCountdowns()
            handler.postDelayed(this, 1000)
        }
    }

    private val overlayReceiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val action = intent?.getStringExtra("action")
            val activeRallyId = intent?.getStringExtra("activeRallyId")
            val target = intent?.getStringExtra("target")
            val customMarchTimeMs = intent?.getLongExtra("customMarchTimeMs", 300000L)
            val initiatorId = intent?.getStringExtra("initiatorId")


            if (action == "cancel" && !activeRallyId.isNullOrEmpty() && activeRallyId != "null") {
                val payload = JSONObject()
                payload.put("rallyId", activeRallyId)
                socket?.emit("rally:cancel", payload)
                Toast.makeText(this@DashboardActivity, "Rally canceled.", Toast.LENGTH_SHORT).show()
            } else if (action == "start" && !target.isNullOrEmpty() && target != "null") {
                var finalInitiatorId = if (initiatorId.isNullOrEmpty() || initiatorId == "null") getSharedPreferences("CompanionAppPrefs", Context.MODE_PRIVATE).getString("playerId", "") else initiatorId
                if (finalInitiatorId.isNullOrEmpty() || finalInitiatorId == "null") {
                    Toast.makeText(this@DashboardActivity, "No initiator configured. Please claim a player profile on the web hub first.", Toast.LENGTH_LONG).show()
                    return
                }
                val payload = JSONObject()
                payload.put("initiatorId", finalInitiatorId)
                payload.put("target", target)
                payload.put("duration", 300000)
                if (customMarchTimeMs != null) {
                    payload.put("customMarchTimeMs", customMarchTimeMs)
                }
                socket?.emit("rally:start", payload)
                Toast.makeText(this@DashboardActivity, "Rally launched on $target!", Toast.LENGTH_SHORT).show()
            }

        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_dashboard)

        llColorPicker = findViewById(R.id.llColorPicker)
        llTeamList = findViewById(R.id.llTeamList)
        llEnemyTeams = findViewById(R.id.llEnemyTeams)
        llActionButtonsList = findViewById(R.id.llActionButtonsList)
        btnEnemyToggle = findViewById(R.id.btnEnemyToggle)
        tvDebugInfo = findViewById(R.id.tvDebugInfo)

        val prefs = getSharedPreferences("CompanionAppPrefs", Context.MODE_PRIVATE)
        val token = prefs.getString("sessionToken", null)
        val serverUrl = prefs.getString("serverUrl", "http://10.0.2.2:3001")
        val playerId = prefs.getString("playerId", "")

        if (token == null) {
            logout()
            return
        }

        loadButtons()
        setupColorPicker()

        btnEnemyToggle.setOnClickListener {
            isEnemyRally = !isEnemyRally
            btnEnemyToggle.text = if (isEnemyRally) "YES" else "NO"
            btnEnemyToggle.setTextColor(if (isEnemyRally) Color.RED else Color.GRAY)
            llEnemyTeams.visibility = if (isEnemyRally) View.VISIBLE else View.GONE
        }

        findViewById<Button>(R.id.btnAddButton).setOnClickListener {
            val target = findViewById<EditText>(R.id.etTargetName).text.toString()
            if (target.isBlank()) return@setOnClickListener

            val timeStr = findViewById<EditText>(R.id.etMarchTime).text.toString()
            val timeSec = if (timeStr.isNotBlank()) timeStr.toLong() else 300L

            var initiatorId = playerId
            if (isEnemyRally) {
                if (selectedEnemyTeamId.isBlank()) {
                    Toast.makeText(this, "Please select an enemy team", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }
                val team = teamsList.find { it.optString("id") == selectedEnemyTeamId }
                val players = team?.optJSONArray("players")
                if (players != null && players.length() > 0) {
                    initiatorId = players.getJSONObject(0).optString("id")
                } else {
                    Toast.makeText(this, "Selected team has no players", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }
            }


            val newBtn = JSONObject()
            newBtn.put("id", System.currentTimeMillis().toString())
            newBtn.put("target", target)
            newBtn.put("customMarchTimeMs", (timeSec * 1000).toString())
            newBtn.put("color", selectedColor)
            newBtn.put("isEnemy", isEnemyRally.toString())
            newBtn.put("initiatorId", initiatorId)
            if (isEnemyRally && selectedEnemyTeamId.isNotBlank()) {
                newBtn.put("enemyTeamId", selectedEnemyTeamId)
            }


            buttonsList.add(newBtn)
            saveButtons()
            renderActionButtons()
            updateOverlay()

            findViewById<EditText>(R.id.etTargetName).setText("")
        }

        findViewById<Button>(R.id.btnLogout).setOnClickListener {
            logout()
        }

        findViewById<Button>(R.id.btnToggleOverlay).setOnClickListener {
            // Check if service is actually running, if not start it
            val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            var isRunning = false
            for (service in am.getRunningServices(Integer.MAX_VALUE)) {
                if (FloatingOverlayService::class.java.name == service.service.className) {
                    isRunning = true
                    break
                }
            }

            if (!isRunning) {
                startOverlayService()
            } else {
                val intent = Intent("com.companionapp.ACTION_TOGGLE_OVERLAY")
                intent.setPackage(packageName)
                sendBroadcast(intent)
            }
        }


        connectSocket(serverUrl!!, token)

        checkOverlayPermission()
        handler.post(refreshRunnable)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(overlayReceiver, android.content.IntentFilter("com.companionapp.ACTION_OVERLAY_CLICK"), RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(overlayReceiver, android.content.IntentFilter("com.companionapp.ACTION_OVERLAY_CLICK"))
        }
    }

    private fun checkOverlayPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ActivityCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 101)
            }
        }

        if (!Settings.canDrawOverlays(this)) {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:$packageName")
            )
            startActivityForResult(intent, 100)
        } else {
            startOverlayService()
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 100) {
            if (true && Settings.canDrawOverlays(this)) {
                startOverlayService()
            } else {
                Toast.makeText(this, "Overlay permission required", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun startOverlayService() {
        updateOverlay()
        val intent = Intent(this, FloatingOverlayService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }


    private fun updateOverlay() {
        val prefs = getSharedPreferences("CompanionAppPrefs", Context.MODE_PRIVATE)
        val playerId = prefs.getString("playerId", "")

        val serviceList = ArrayList<HashMap<String, String>>()
        for (i in 0 until buttonsList.size) {
            val btn = buttonsList[i]
            val map = HashMap<String, String>()
            val target = btn.optString("target")
            val initiatorId = btn.optString("initiatorId", playerId)
            val isEnemy = btn.optBoolean("isEnemy")
            val enemyTeamId = btn.optString("enemyTeamId", "")

            map["target"] = target
            map["customMarchTimeMs"] = btn.optString("customMarchTimeMs")
            map["utcTime"] = getUserStartTimeForTarget(target, btn.optString("customMarchTimeMs", "300000").toLong())
            map["color"] = btn.optString("color")
            map["initiatorId"] = initiatorId ?: ""

            var activeRally: JSONObject? = null

            if (isEnemy && enemyTeamId.isNotBlank()) {
                // Find if any player in this enemy team is marching to this target
                val enemyTeam = teamsList.find { it.optString("id") == enemyTeamId }
                if (enemyTeam != null) {
                    val players = enemyTeam.optJSONArray("players")
                    if (players != null) {
                        for (p in 0 until players.length()) {
                            val pId = players.getJSONObject(p).optString("id")
                            val rally = ralliesList.find {
                                it.optString("target").equals(target, ignoreCase = true) &&
                                it.optString("initiatorId") == pId
                            }
                            if (rally != null) {
                                activeRally = rally
                                break
                            }
                        }
                    }
                }
            } else {
                activeRally = ralliesList.find {
                    it.optString("target").equals(target, ignoreCase = true) &&
                    it.optString("initiatorId") == initiatorId
                }
            }

            if (activeRally != null) {
                map["isBlinking"] = "true"
                map["action"] = "cancel"
                map["activeRallyId"] = activeRally.optString("id")
            } else {
                map["isBlinking"] = "false"
                map["action"] = "start"
                map["activeRallyId"] = ""
            }

            serviceList.add(map)
        }
        FloatingOverlayService.updateButtons(serviceList)

        if (buttonsList.isNotEmpty()) {
            val intent = Intent(this, FloatingOverlayService::class.java)
            startService(intent)
        }
    }


    private fun connectSocket(serverUrl: String, token: String) {
        try {
            tvDebugInfo.text = "Status: Connecting to $serverUrl..."
            val opts = IO.Options()
            opts.auth = mapOf("token" to token)
            socket = IO.socket(serverUrl, opts)

            socket?.on("init_state") { args ->
                val data = args[0] as JSONObject
                runOnUiThread {
                    if (data.has("teams")) parseTeams(data.getJSONArray("teams"))
                    if (data.has("rallies")) parseRallies(data.getJSONArray("rallies"))
                }
            }
            socket?.on("rally:update") { args ->
                val data = args[0] as JSONObject
                runOnUiThread {
                    if (data.has("rallies")) parseRallies(data.getJSONArray("rallies"))
                }
            }
            socket?.on("admin:teams_data") { args ->
                val data = args[0] as JSONObject
                runOnUiThread {
                    if (data.has("teams")) parseTeams(data.getJSONArray("teams"))
                }
            }


            socket?.on(Socket.EVENT_CONNECT) {
                runOnUiThread {
                    tvDebugInfo.text = "Status: Connected! Requesting data..."
                    socket?.emit("admin:get_teams")
                }
            }
            socket?.on(Socket.EVENT_CONNECT_ERROR) { args ->
                runOnUiThread {
                    val err = if (args.isNotEmpty()) args[0].toString() else "Unknown"
                    tvDebugInfo.text = "Connection Error: $err"
                }
            }
            socket?.connect()

        } catch (e: Exception) {
            e.printStackTrace()
            tvDebugInfo.text = "Socket Setup Error: ${e.message}"
        }
    }




    private fun parseTeams(array: JSONArray) {
        teamsList.clear()
        val prefs = getSharedPreferences("CompanionAppPrefs", Context.MODE_PRIVATE)
        val playerId = prefs.getString("playerId", "")

        var debugText = "Debug: Players found: ${array.length()}\n"

        for (i in 0 until array.length()) {
            val team = array.getJSONObject(i)
            teamsList.add(team)

            val players = team.optJSONArray("players")
            var isMyTeam = false
            if (players != null) {
                for (p in 0 until players.length()) {
                    if (players.getJSONObject(p).optString("id") == playerId) {
                        isMyTeam = true
                        break
                    }
                }
            }

            if (isMyTeam) {
                val target = team.optString("selectedTarget", "NONE")
                val landing = team.optString("landingTime", "MISSING")
                debugText += "MY TEAM: Target=$target, Landing=$landing\n"

                // Check calculation for current buttons
                if (buttonsList.isNotEmpty()) {
                    for (b in 0 until buttonsList.size) {
                        val bTarget = buttonsList[b].optString("target")
                        val calcStart = getUserStartTimeForTarget(bTarget, 300000L)
                        if (calcStart.isNotEmpty()) {
                            debugText += "MATCH FOUND! $bTarget starts at: $calcStart\n"
                        }
                    }
                }
                
                // MOCK TEST: Let's see what the time WOULD be if landing was in 30 mins
                try {
                    val sdf = java.text.SimpleDateFormat("HH:mm:ss")
                    sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")
                    val mockLanding = System.currentTimeMillis() + 1800000L // +30 mins
                    val mockStart = mockLanding - 300000L - 60000L // -5m buffer - 1m march
                    debugText += "TEST MATH: If landing is ${sdf.format(java.util.Date(mockLanding))}, Start is ${sdf.format(java.util.Date(mockStart))} UTC\n"
                } catch(e: Exception) {}
            }
        }

        runOnUiThread {
            tvDebugInfo.text = debugText
        }

        renderTeams()
        updateOverlay()
        renderActionButtons()
    }





    private fun parseRallies(array: JSONArray) {
        val newRallies = mutableListOf<JSONObject>()
        val currentIds = mutableSetOf<String>()

        var rallyDebug = "\nRAW RALLIES: ${array.length()} found\n"
        if (array.length() > 0) {
            rallyDebug += "LATEST RALLY: ${array.getJSONObject(0).toString()}\n"
        }

        for (i in 0 until array.length()) {
            val rally = array.getJSONObject(i)
            newRallies.add(rally)
            currentIds.add(rally.optString("id"))
        }

        runOnUiThread {
            // Append to the existing debug text
            tvDebugInfo.text = tvDebugInfo.text.toString() + rallyDebug
        }
        
        // ... rest of the existing parseRallies logic ...
        val newIds = currentIds - knownRallyIds
        for (rally in newRallies) {
            if (newIds.contains(rally.optString("id"))) {
                val target = rally.optString("target")
                val initiatorId = rally.optString("initiatorId")

                var trackedButton: JSONObject? = null
                for (btn in buttonsList) {
                    if (btn.optBoolean("isEnemy") && btn.optString("target").equals(target, ignoreCase = true)) {
                        val enemyTeamId = btn.optString("enemyTeamId")
                        if (enemyTeamId.isNotBlank()) {
                            val enemyTeam = teamsList.find { it.optString("id") == enemyTeamId }
                            if (enemyTeam != null) {
                                val players = enemyTeam.optJSONArray("players")
                                if (players != null) {
                                    for (p in 0 until players.length()) {
                                        if (players.getJSONObject(p).optString("id") == initiatorId) {
                                            trackedButton = btn
                                            break
                                        }
                                    }
                                }
                            }
                        } else if (btn.optString("initiatorId") == initiatorId) {
                            trackedButton = btn
                        }
                    }
                    if (trackedButton != null) break
                }

                if (trackedButton != null) {
                    showLocalNotification("Enemy Rally!", "An enemy rally on $target has been initiated!")
                }
            }
        }

        knownRallyIds.clear()
        knownRallyIds.addAll(currentIds)

        ralliesList.clear()
        ralliesList.addAll(newRallies)
        updateOverlay()
    }

    private fun showLocalNotification(title: String, body: String) {
        val channelId = "rally_notifications"
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(channelId, "Rally Alerts", NotificationManager.IMPORTANCE_HIGH)
            manager.createNotificationChannel(channel)
        }

        val intent = Intent(this, DashboardActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        val pendingIntent = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        val builder = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent)

        manager.notify(System.currentTimeMillis().toInt(), builder.build())
    }




    private fun refreshButtonCountdowns() {
        for (i in 0 until llActionButtonsList.childCount) {
            val row = llActionButtonsList.getChildAt(i) as? LinearLayout
            if (row != null) {
                val btn = row.getChildAt(0) as? Button
                val btnObj = btn?.tag as? JSONObject
                if (btn != null && btnObj != null) {
                    updateActionButtonDisplay(btn, btnObj)
                }
            }
        }
    }

    private fun updateActionButtonDisplay(actionBtn: Button, btnObj: JSONObject) {
        val target = btnObj.optString("target")
        val timeMs = btnObj.optString("customMarchTimeMs").toLong()
        val isEnemy = btnObj.optBoolean("isEnemy")
        val colorStr = btnObj.optString("color")

        val utcTime = getUserStartTimeForTarget(target, timeMs)
        var timeDisplay = ""

        if (utcTime.isNotEmpty()) {
            try {
                val timeOnly = utcTime.split(" ")[0]
                val sdf = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US)
                sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")
                val now = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC"))
                val targetTime = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC"))
                val parsedDate = sdf.parse(timeOnly)
                if (parsedDate != null) {
                    val calParsed = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC"))
                    calParsed.time = parsedDate
                    targetTime.set(java.util.Calendar.HOUR_OF_DAY, calParsed.get(java.util.Calendar.HOUR_OF_DAY))
                    targetTime.set(java.util.Calendar.MINUTE, calParsed.get(java.util.Calendar.MINUTE))
                    targetTime.set(java.util.Calendar.SECOND, calParsed.get(java.util.Calendar.SECOND))

                    val diffMs = targetTime.timeInMillis - now.timeInMillis
                    if (diffMs < -600000) timeDisplay = "\nDONE"
                    else if (diffMs <= 0) timeDisplay = "\nNOW!"
                    else timeDisplay = "\nLaunch in: ${String.format("%03d", diffMs / 1000)}s"
                }
            } catch (e: Exception) {
                timeDisplay = "\nStarts: $utcTime"
            }
        } else {
            timeDisplay = " (${timeMs / 1000}s)"
        }

        actionBtn.text = "$target$timeDisplay" + if (isEnemy) " (ENEMY)" else ""
        actionBtn.setBackgroundColor(try { Color.parseColor(colorStr) } catch (e: Exception) { Color.RED })
        actionBtn.setTextColor(Color.WHITE)
    }

    private fun getUserStartTimeForTarget(target: String, fallbackMarchTimeMs: Long): String {
        val prefs = getSharedPreferences("CompanionAppPrefs", Context.MODE_PRIVATE)
        val playerId = prefs.getString("playerId", "")
        if (playerId.isNullOrBlank()) return ""

        var exactMarchTimeSeconds: Long? = null
        val cleanTarget = target.trim().lowercase()

        val allyTeam = teamsList.find { !it.optBoolean("isEnemy", false) && it.optJSONArray("players")?.let { players ->
            var found = false
            for (p in 0 until players.length()) {
                val playerObj = players.getJSONObject(p)
                if (playerObj.optString("id") == playerId) {
                    found = true
                    if (cleanTarget.contains("castle")) exactMarchTimeSeconds = playerObj.optLong("mtCastle", 0L)
                    else if (cleanTarget.contains("north")) exactMarchTimeSeconds = playerObj.optLong("mtNorth", 0L)
                    else if (cleanTarget.contains("east")) exactMarchTimeSeconds = playerObj.optLong("mtEast", 0L)
                    else if (cleanTarget.contains("south")) exactMarchTimeSeconds = playerObj.optLong("mtSouth", 0L)
                    else if (cleanTarget.contains("west")) exactMarchTimeSeconds = playerObj.optLong("mtWest", 0L)
                    else {
                         val customJSONStr = playerObj.optString("customMarchTimes", "{}")
                         try {
                             val customJSON = org.json.JSONObject(customJSONStr)
                             if (customJSON.has(target)) exactMarchTimeSeconds = customJSON.optLong(target, 0L)
                         } catch (e: Exception) {}
                    }
                    if (exactMarchTimeSeconds == 0L) exactMarchTimeSeconds = null
                }
            }
            found
        } ?: false }

        if (allyTeam != null) {
            val landingTarget = allyTeam.optString("selectedTarget").trim()
            val landingTime = allyTeam.optString("landingTime")
            if (landingTarget.equals(target.trim(), ignoreCase = true) && landingTime.isNotBlank()) {
                try {
                    val date: java.util.Date? = if (landingTime.contains("T")) {
                        val format = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
                        format.timeZone = java.util.TimeZone.getTimeZone("UTC")
                        format.parse(landingTime)
                    } else {
                        // Handle simple HH:mm:ss format
                        val format = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US)
                        format.timeZone = java.util.TimeZone.getTimeZone("UTC")
                        val parsed = format.parse(landingTime)
                        if (parsed != null) {
                            val cal = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC"))
                            val pCal = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC"))
                            pCal.time = parsed
                            cal.set(java.util.Calendar.HOUR_OF_DAY, pCal.get(java.util.Calendar.HOUR_OF_DAY))
                            cal.set(java.util.Calendar.MINUTE, pCal.get(java.util.Calendar.MINUTE))
                            cal.set(java.util.Calendar.SECOND, pCal.get(java.util.Calendar.SECOND))
                            cal.time
                        } else null
                    }

                    if (date != null) {
                        val finalMarchTimeMs = if (exactMarchTimeSeconds != null) exactMarchTimeSeconds!! * 1000L else fallbackMarchTimeMs
                        val startTimeMs = date.time - finalMarchTimeMs - 300000L // - 5 mins
                        val startFormat = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US)
                        startFormat.timeZone = java.util.TimeZone.getTimeZone("UTC")
                        return startFormat.format(java.util.Date(startTimeMs)) + " UTC"
                    }
                } catch (e: Exception) { e.printStackTrace() }
            }
        }
        return ""
    }


    private fun setupColorPicker() {
        llColorPicker.removeAllViews()
        val scale = resources.displayMetrics.density
        val size = (30 * scale + 0.5f).toInt()
        val margin = (10 * scale + 0.5f).toInt()

        for (colorStr in colors) {
            val view = View(this)
            val lp = LinearLayout.LayoutParams(size, size)
            lp.setMargins(0, 0, margin, 0)
            view.layoutParams = lp

            val shape = GradientDrawable()
            shape.shape = GradientDrawable.OVAL
            shape.setColor(try { Color.parseColor(colorStr) } catch(e:Exception) { Color.RED })
            shape.setStroke(if (selectedColor == colorStr) 5 else 0, Color.BLACK)
            view.background = shape

            view.setOnClickListener {
                selectedColor = colorStr
                setupColorPicker()
            }
            llColorPicker.addView(view)
        }
    }

    private fun renderTeams() {
        llTeamList.removeAllViews()
        val enemyTeams = teamsList.filter { it.optBoolean("isEnemy", false) }

        for (team in enemyTeams) {
            val btn = Button(this)
            btn.text = team.optString("name")
            val isSelected = selectedEnemyTeamId == team.optString("id")
            btn.setBackgroundColor(if (isSelected) Color.RED else Color.LTGRAY)
            btn.setTextColor(if (isSelected) Color.WHITE else Color.BLACK)

            btn.setOnClickListener {
                selectedEnemyTeamId = team.optString("id")
                renderTeams()
            }
            llTeamList.addView(btn)
        }
    }

    private fun renderActionButtons() {
        llActionButtonsList.removeAllViews()
        val prefs = getSharedPreferences("CompanionAppPrefs", Context.MODE_PRIVATE)
        val playerId = prefs.getString("playerId", "")

        for (i in 0 until buttonsList.size) {
            val btnObj = buttonsList[i]
            val row = LinearLayout(this)
            row.orientation = LinearLayout.HORIZONTAL
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            lp.setMargins(0, 0, 0, 20)
            row.layoutParams = lp

            val actionBtn = Button(this)
            actionBtn.tag = btnObj // Store for refresh loop
            val lpAct = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            actionBtn.layoutParams = lpAct

            updateActionButtonDisplay(actionBtn, btnObj)

            actionBtn.setOnClickListener {
                val target = btnObj.optString("target")
                val timeMs = btnObj.optString("customMarchTimeMs").toLong()
                val assignedInitiator = btnObj.optString("initiatorId", playerId)
                val activeRally = ralliesList.find { r ->
                    r.optString("target").equals(target, ignoreCase = true) && r.optString("initiatorId") == assignedInitiator
                }

                if (activeRally != null) {
                    val payload = JSONObject()
                    payload.put("rallyId", activeRally.optString("id"))
                    socket?.emit("rally:cancel", payload)
                } else {
                    if (assignedInitiator.isNullOrBlank() || assignedInitiator == "null") {
                        Toast.makeText(this, "No initiator configured. Please claim a player profile on the web hub first.", Toast.LENGTH_SHORT).show()
                    } else {
                        val payload = JSONObject()
                        payload.put("initiatorId", assignedInitiator)
                        payload.put("target", target)
                        payload.put("duration", 300000)
                        payload.put("customMarchTimeMs", timeMs)
                        socket?.emit("rally:start", payload)
                        Toast.makeText(this, "Rally launched on $target!", Toast.LENGTH_SHORT).show()
                    }
                }
            }

            val delBtn = Button(this)
            val lpDel = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            lpDel.setMargins(20, 0, 0, 0)
            delBtn.layoutParams = lpDel
            delBtn.text = "X"
            delBtn.setBackgroundColor(Color.GRAY)
            delBtn.setTextColor(Color.WHITE)

            delBtn.setOnClickListener {
                buttonsList.removeAt(i)
                saveButtons()
                renderActionButtons()
                updateOverlay()
            }

            row.addView(actionBtn)
            row.addView(delBtn)
            llActionButtonsList.addView(row)
        }
    }

    private fun loadButtons() {
        val prefs = getSharedPreferences("CompanionAppPrefs", Context.MODE_PRIVATE)
        val data = prefs.getString("customButtons", "[]")
        try {
            val array = JSONArray(data)
            buttonsList.clear()
            for (i in 0 until array.length()) {
                buttonsList.add(array.getJSONObject(i))
            }
            renderActionButtons()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun saveButtons() {
        val prefs = getSharedPreferences("CompanionAppPrefs", Context.MODE_PRIVATE)
        val array = JSONArray()
        for (btn in buttonsList) {
            array.put(btn)
        }
        prefs.edit().putString("customButtons", array.toString()).apply()
    }

    private fun logout() {
        getSharedPreferences("CompanionAppPrefs", Context.MODE_PRIVATE).edit().clear().apply()
        socket?.disconnect()
        val intent = Intent(this, FloatingOverlayService::class.java)
        stopService(intent)
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(refreshRunnable)
        socket?.disconnect()
        try { unregisterReceiver(overlayReceiver) } catch (e: Exception) {}
    }
}
