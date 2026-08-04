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
    private val landingsList = mutableListOf<JSONObject>()
    private val buttonsList = mutableListOf<JSONObject>()
    private val playersList = mutableListOf<JSONObject>()
    private var isEnemyTeamCreation = false
    private val knownRallyIds = mutableSetOf<String>()
    private val plannerPlayerOffsets = mutableMapOf<String, Long>()
    private val targets = arrayOf("Castle", "North Turret", "East Turret", "South Turret", "West Turret")

    // Group planner (online)
    private data class GroupTarget(val id: String, val display: String, val mtField: String, val x: Int, val y: Int)
    private val groupTargets = listOf(
        GroupTarget("castle", "Castle", "mtCastle", 20, 20),
        GroupTarget("north", "North Turret", "mtNorth", 15, 15),
        GroupTarget("east", "East Turret", "mtEast", 25, 15),
        GroupTarget("south", "South Turret", "mtSouth", 25, 25),
        GroupTarget("west", "West Turret", "mtWest", 15, 25)
    )
    private var grpLanding: EditText? = null
    private var grpCastleOffset: EditText? = null
    private var grpSections: LinearLayout? = null
    private var grpStatus: TextView? = null

    private lateinit var llColorPicker: LinearLayout
    private lateinit var llTeamList: LinearLayout
    private lateinit var llEnemyTeams: LinearLayout
    private lateinit var llActionButtonsList: LinearLayout
    private lateinit var btnEnemyToggle: Button
    private var isAway = false
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

                // Block duplicate active rallies
                val initiatorActiveRally = ralliesList.find { r ->
                    r.optString("initiatorId") == finalInitiatorId
                }
                if (initiatorActiveRally != null) {
                    Toast.makeText(this@DashboardActivity, "You already have an active rally on ${initiatorActiveRally.optString("target")}!", Toast.LENGTH_SHORT).show()
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

        // --- Commander Launch Planner Bindings & Logic ---
        val spPlannerTarget = findViewById<Spinner>(R.id.spPlannerTarget)
        val spPlannerTeam = findViewById<Spinner>(R.id.spPlannerTeam)
        val spPlannerRallyTime = findViewById<Spinner>(R.id.spPlannerRallyTime)
        val etPlannerLandingTime = findViewById<EditText>(R.id.etPlannerLandingTime)
        val tvPlannerOffsetsTitle = findViewById<TextView>(R.id.tvPlannerOffsetsTitle)
        val llPlannerPlayerOffsets = findViewById<LinearLayout>(R.id.llPlannerPlayerOffsets)
        val btnPlannerSetLanding = findViewById<Button>(R.id.btnPlannerSetLanding)
        val btnPlannerCancelLanding = findViewById<Button>(R.id.btnPlannerCancelLanding)

        // Populate Target spinner
        val targetAdapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, targets)
        targetAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spPlannerTarget.adapter = targetAdapter

        // Populate Add Action Button target spinner
        val spAddButtonTarget = findViewById<Spinner>(R.id.spAddButtonTarget)
        spAddButtonTarget.adapter = targetAdapter

        // Configure landing time dynamic input formatting
        etPlannerLandingTime.inputType = android.text.InputType.TYPE_CLASS_PHONE
        etPlannerLandingTime.keyListener = android.text.method.DigitsKeyListener.getInstance("0123456789:")
        etPlannerLandingTime.addTextChangedListener(object : android.text.TextWatcher {
            private var isUpdating = false
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: android.text.Editable?) {
                if (isUpdating) return
                isUpdating = true

                val input = s.toString()
                val clean = input.replace(":", "")
                val sb = StringBuilder()

                val len = clean.length
                if (len > 0) {
                    val hh = clean.substring(0, Math.min(len, 2))
                    sb.append(hh)
                    if (len > 2) {
                        sb.append(":")
                        val mm = clean.substring(2, Math.min(len, 4))
                        sb.append(mm)
                        if (len > 4) {
                            sb.append(":")
                            val ss = clean.substring(4, Math.min(len, 6))
                            sb.append(ss)
                        }
                    }
                }

                val formatted = sb.toString()
                if (formatted != input) {
                    s?.replace(0, s.length, formatted)
                }
                isUpdating = false
            }
        })

        // Populate Rally prep spinner
        val rallyPrepDurations = arrayOf("1 Min", "2 Min", "5 Min", "10 Min")
        val rallyAdapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, rallyPrepDurations)
        rallyAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spPlannerRallyTime.adapter = rallyAdapter
        spPlannerRallyTime.setSelection(2) // Default to 5 Min (index 2)

        // Spinner listeners to build sequential delay list reactively
        spPlannerTeam.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                rebuildPlannerPlayerOffsets()
            }
            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }

        spPlannerTarget.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                rebuildPlannerPlayerOffsets()
            }
            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }

        btnPlannerSetLanding.setOnClickListener {
            val targetName = spPlannerTarget.selectedItem?.toString() ?: "Castle"
            val teamName = spPlannerTeam.selectedItem?.toString() ?: ""
            val landingTimeStr = etPlannerLandingTime.text.toString()
            val rallyTimeText = spPlannerRallyTime.selectedItem?.toString() ?: "5 Min"
            val rallyPrepSeconds = when (rallyTimeText) {
                "1 Min" -> 60
                "2 Min" -> 120
                "5 Min" -> 300
                "10 Min" -> 600
                else -> 300
            }

            if (teamName.isBlank()) {
                Toast.makeText(this, "Please select an allied team to assign", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            if (landingTimeStr.isBlank()) {
                Toast.makeText(this, "Please enter landing time (e.g. 23:45:00)", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val offsetsJson = org.json.JSONObject()
            for ((pId, delaySec) in plannerPlayerOffsets) {
                offsetsJson.put(pId, delaySec)
            }

            val payload = JSONObject()
            payload.put("x", 20)
            payload.put("y", 20)
            payload.put("time", formatToHHMMSS(landingTimeStr))
            payload.put("assignedTo", teamName)
            payload.put("type", targetName)
            payload.put("rallyTime", rallyPrepSeconds)
            payload.put("playerOffsets", offsetsJson)

            socket?.emit("landing:create", payload)
            Toast.makeText(this, "Landing details broadcasted!", Toast.LENGTH_SHORT).show()
        }

        btnPlannerCancelLanding.setOnClickListener {
            val teamName = spPlannerTeam.selectedItem?.toString() ?: ""
            val activeLanding = landingsList.find { it.optString("assignedTo") == teamName }

            if (activeLanding != null) {
                val payload = JSONObject()
                payload.put("landingId", activeLanding.optString("id"))
                socket?.emit("landing:cancel", payload)
                Toast.makeText(this, "Landing cancelled.", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(this, "No active landing found to cancel.", Toast.LENGTH_SHORT).show()
            }
        }

        findViewById<Button>(R.id.btnAddButton).setOnClickListener {
            val target = findViewById<Spinner>(R.id.spAddButtonTarget).selectedItem?.toString() ?: "Castle"

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
        }

        // --- Team Management Hub Bindings & Logic ---
        val btnTeamTypeToggle = findViewById<Button>(R.id.btnTeamTypeToggle)
        val btnCreateTeam = findViewById<Button>(R.id.btnCreateTeam)
        val etNewTeamName = findViewById<EditText>(R.id.etNewTeamName)

        btnTeamTypeToggle?.setOnClickListener {
            isEnemyTeamCreation = !isEnemyTeamCreation
            btnTeamTypeToggle.text = if (isEnemyTeamCreation) "YES" else "NO"
            btnTeamTypeToggle.setTextColor(if (isEnemyTeamCreation) Color.RED else Color.parseColor("#EAB308"))
        }

        btnCreateTeam?.setOnClickListener {
            val name = etNewTeamName?.text?.toString() ?: ""
            if (name.isBlank()) {
                Toast.makeText(this, "Please enter a team name", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val payload = JSONObject()
            payload.put("name", name)
            payload.put("isEnemy", isEnemyTeamCreation)
            socket?.emit("admin:create_team", payload)
            Toast.makeText(this, "Creating team '$name'...", Toast.LENGTH_SHORT).show()
            etNewTeamName?.setText("")
        }

        findViewById<Button>(R.id.btnLogout).setOnClickListener {
            logout()
        }

        // Availability toggle (Online / Away) — advisory presence for the readiness overview.
        val btnAvailability = findViewById<Button>(R.id.btnAvailability)
        btnAvailability.setOnClickListener {
            isAway = !isAway
            socket?.emit("player:set_availability", JSONObject().put("status", if (isAway) "away" else "online"))
            updateAvailabilityButton(btnAvailability)
        }
        updateAvailabilityButton(btnAvailability)

        // --- Online Group Attack Planner ---
        grpLanding = findViewById(R.id.etGrpLanding)
        grpCastleOffset = findViewById(R.id.etGrpCastleOffset)
        grpSections = findViewById(R.id.llGrpSections)
        grpStatus = findViewById(R.id.tvGrpStatus)
        val gInit = getGroup()
        grpLanding?.setText(gInit.optString("landingTime", ""))
        grpCastleOffset?.setText(gInit.optInt("castleOffset", 0).toString())
        grpLanding?.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: android.text.Editable?) {
                val g = getGroup(); g.put("landingTime", s.toString().trim()); saveGroup(g); updateGroupStatus()
            }
        })
        grpCastleOffset?.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: android.text.Editable?) {
                val g = getGroup(); g.put("castleOffset", s.toString().trim().toIntOrNull() ?: 0); saveGroup(g)
            }
        })
        findViewById<Button>(R.id.btnGrpSuggest).setOnClickListener {
            val sug = suggestGroupLandingTime()
            if (sug != null) {
                grpLanding?.setText(sug)
                Toast.makeText(this, "Set earliest feasible landing time.", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(this, "Assign a team or player to a target first.", Toast.LENGTH_SHORT).show()
            }
        }
        findViewById<Button>(R.id.btnGrpPrepare).setOnClickListener {
            socket?.emit("grouping:prepare")
            Toast.makeText(this, "Prepare alert sent to all players.", Toast.LENGTH_SHORT).show()
        }
        findViewById<Button>(R.id.btnGrpDeploy).setOnClickListener { deployGroup() }
        findViewById<Button>(R.id.btnGrpCopy).setOnClickListener {
            val plan = buildGroupPlan()
            if (plan == null || plan.isBlank()) {
                Toast.makeText(this, "Set a valid landing time and assign forces first.", Toast.LENGTH_LONG).show()
            } else {
                val clip = getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                clip.setPrimaryClip(android.content.ClipData.newPlainText("SVS Group Plan", plan))
                Toast.makeText(this, "Group plan copied to clipboard!", Toast.LENGTH_SHORT).show()
            }
        }
        refreshGroupPlannerUI()

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
            map["isEnemy"] = isEnemy.toString()

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
                map["rallyEndTime"] = activeRally.optLong("endTime").toString()
            } else {
                map["isBlinking"] = "false"
                map["action"] = "start"
                map["activeRallyId"] = ""
                map["rallyEndTime"] = ""
            }

            serviceList.add(map)
        }
        FloatingOverlayService.updateButtons(serviceList)

        if (buttonsList.isNotEmpty()) {
            val intent = Intent(this, FloatingOverlayService::class.java)
            startService(intent)
        }
    }


    private fun updateAvailabilityButton(btn: Button) {
        if (isAway) {
            btn.text = "● Away"
            btn.setTextColor(android.graphics.Color.parseColor("#EAB308"))
        } else {
            btn.text = "● Online"
            btn.setTextColor(android.graphics.Color.parseColor("#4CAF50"))
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
                    // Align overlay countdowns to the server clock instead of the local device clock.
                    if (data.has("serverTime")) {
                        val st = data.optLong("serverTime", 0L)
                        if (st > 0L) FloatingOverlayService.serverTimeOffset = System.currentTimeMillis() - st
                    }
                    if (data.has("players")) parsePlayers(data.getJSONArray("players"))
                    if (data.has("teams")) parseTeams(data.getJSONArray("teams"))
                    if (data.has("rallies")) parseRallies(data.getJSONArray("rallies"))
                    if (data.has("landings")) parseLandings(data.getJSONArray("landings"))
                }
            }
            socket?.on("map:update") { args ->
                val data = args[0] as JSONObject
                runOnUiThread {
                    if (data.has("players")) parsePlayers(data.getJSONArray("players"))
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
            socket?.on("landing:update") { args ->
                val data = args[0] as JSONObject
                runOnUiThread {
                    if (data.has("landings")) parseLandings(data.getJSONArray("landings"))
                }
            }


            socket?.on(Socket.EVENT_CONNECT) {
                runOnUiThread {
                    tvDebugInfo.text = "Status: Connected! Requesting data..."
                    socket?.emit("admin:get_teams")
                    // Re-assert our availability so it survives reconnects.
                    socket?.emit("player:set_availability", JSONObject().put("status", if (isAway) "away" else "online"))
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
        runOnUiThread {
            refreshCommanderPlannerUI()
            refreshTeamManagementUI()
            refreshGroupPlannerUI()
        }
    }

    private fun parseLandings(array: JSONArray) {
        landingsList.clear()
        for (i in 0 until array.length()) {
            landingsList.add(array.getJSONObject(i))
        }
        updateOverlay()
        runOnUiThread {
            refreshCommanderPlannerUI()
        }
    }

    private fun parsePlayers(array: JSONArray) {
        playersList.clear()
        for (i in 0 until array.length()) {
            playersList.add(array.getJSONObject(i))
        }
        runOnUiThread {
            refreshTeamManagementUI()
            refreshGroupPlannerUI()
        }
    }

    // ===================== Group Attack Planner (online) =====================

    private fun defaultGroup(): JSONObject {
        val g = JSONObject()
        g.put("landingTime", "")
        g.put("castleOffset", 0)
        val sections = JSONObject()
        for (gt in groupTargets) sections.put(gt.id, JSONObject().put("teamId", "").put("playerIds", JSONArray()).put("enabled", true))
        g.put("sections", sections)
        return g
    }

    private fun getGroup(): JSONObject {
        val prefs = getSharedPreferences("CompanionAppPrefs", Context.MODE_PRIVATE)
        val str = prefs.getString("onlineGroup", null) ?: return defaultGroup()
        return try { val g = JSONObject(str); if (!g.has("sections")) defaultGroup() else g } catch (e: Exception) { defaultGroup() }
    }

    private fun saveGroup(g: JSONObject) {
        getSharedPreferences("CompanionAppPrefs", Context.MODE_PRIVATE).edit().putString("onlineGroup", g.toString()).apply()
    }

    private fun groupSection(g: JSONObject, targetId: String): JSONObject {
        val sections = g.optJSONObject("sections") ?: JSONObject().also { g.put("sections", it) }
        var sec = sections.optJSONObject(targetId)
        if (sec == null) { sec = JSONObject().put("teamId", "").put("playerIds", JSONArray()).put("enabled", true); sections.put(targetId, sec) }
        return sec
    }

    private fun teamPlayerIds(teamId: String): List<String> {
        val team = teamsList.find { it.optString("id") == teamId } ?: return emptyList()
        val arr = team.optJSONArray("players") ?: return emptyList()
        return (0 until arr.length()).map { arr.getJSONObject(it).optString("id") }
    }

    private fun groupSectionPlayerIds(g: JSONObject, targetId: String): List<String> {
        val sec = g.optJSONObject("sections")?.optJSONObject(targetId) ?: return emptyList()
        val ids = LinkedHashSet<String>()
        val teamId = sec.optString("teamId", "")
        if (teamId.isNotEmpty()) ids.addAll(teamPlayerIds(teamId))
        val indiv = sec.optJSONArray("playerIds")
        if (indiv != null) for (i in 0 until indiv.length()) ids.add(indiv.getString(i))
        return ids.toList()
    }

    private fun sectionEnabled(g: JSONObject, targetId: String): Boolean =
        g.optJSONObject("sections")?.optJSONObject(targetId)?.optBoolean("enabled", true) ?: true

    private fun allAssignedPlayerIds(g: JSONObject): Set<String> {
        val ids = HashSet<String>()
        for (gt in groupTargets) ids.addAll(groupSectionPlayerIds(g, gt.id))
        return ids
    }

    private fun grpPlayerMarch(playerId: String, mtField: String): Long =
        playersList.find { it.optString("id") == playerId }?.optLong(mtField, 0L) ?: 0L

    private fun grpPlayerName(playerId: String): String =
        playersList.find { it.optString("id") == playerId }?.optString("name") ?: "?"

    private fun grpLandingMs(timeStr: String): Long? {
        if (timeStr.length < 5) return null
        val sdf = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US)
        sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")
        val parsed = try { sdf.parse(timeStr) } catch (e: Exception) { null } ?: return null
        val now = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC"))
        val cal = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC"))
        val p = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC")).apply { time = parsed }
        cal.set(java.util.Calendar.HOUR_OF_DAY, p.get(java.util.Calendar.HOUR_OF_DAY))
        cal.set(java.util.Calendar.MINUTE, p.get(java.util.Calendar.MINUTE))
        cal.set(java.util.Calendar.SECOND, p.get(java.util.Calendar.SECOND))
        cal.set(java.util.Calendar.MILLISECOND, 0)
        if (cal.timeInMillis < now.timeInMillis - 12L * 60 * 60 * 1000) cal.add(java.util.Calendar.DAY_OF_YEAR, 1)
        return cal.timeInMillis
    }

    // Prefer the value typed on-screen right now, falling back to the saved config.
    private fun currentGroupTime(): String =
        grpLanding?.text?.toString()?.trim()?.takeIf { it.isNotEmpty() } ?: getGroup().optString("landingTime", "")

    private fun currentCastleOffset(): Int =
        grpCastleOffset?.text?.toString()?.trim()?.toIntOrNull() ?: getGroup().optInt("castleOffset", 0)

    private fun updateGroupStatus() {
        val g = getGroup()
        var assigned = 0; var missing = 0
        for (gt in groupTargets) {
            if (!sectionEnabled(g, gt.id)) continue
            for (pid in groupSectionPlayerIds(g, gt.id)) { assigned++; if (grpPlayerMarch(pid, gt.mtField) <= 0L) missing++ }
        }
        grpStatus?.text = if (assigned == 0) "No forces assigned yet."
            else "$assigned assigned · ${assigned - missing} ready, $missing missing march (excluded)"
    }

    private fun suggestGroupLandingTime(): String? {
        val g = getGroup()
        var maxReq = 300L; var any = false
        for (gt in groupTargets) {
            if (!sectionEnabled(g, gt.id)) continue
            for (pid in groupSectionPlayerIds(g, gt.id)) { any = true; val req = grpPlayerMarch(pid, gt.mtField) + 300L; if (req > maxReq) maxReq = req }
        }
        if (!any) return null
        val sdf = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US)
        sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")
        return sdf.format(java.util.Date(System.currentTimeMillis() + (maxReq + 30L) * 1000L))
    }

    private fun buildGroupPlan(): String? {
        val g = getGroup()
        val timeStr = currentGroupTime()
        val baseMs = grpLandingMs(timeStr) ?: return null
        val castleOffset = currentCastleOffset()
        val sdf = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US)
        sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")
        val sb = StringBuilder()
        sb.append("⚔️ GROUP: $timeStr UTC\n")
        for (gt in groupTargets) {
            if (!sectionEnabled(g, gt.id)) continue
            val ids = groupSectionPlayerIds(g, gt.id)
            if (ids.isEmpty()) continue
            val targetMs = baseMs + (if (gt.id == "castle") castleOffset * 1000L else 0L)
            var line = 0; val body = StringBuilder()
            for (pid in ids) {
                val march = grpPlayerMarch(pid, gt.mtField)
                if (march <= 0L) continue
                line++
                val launchMs = targetMs - march * 1000L - 300000L
                body.append("$line ${grpPlayerName(pid)} @ ${sdf.format(java.util.Date(launchMs))}\n")
            }
            if (line > 0) { sb.append("🎯 ${gt.display.uppercase()}:\n"); sb.append(body) }
        }
        return sb.toString().trimEnd()
    }

    // Deploy = grouping:deploy (2+ targets, replaces stale landings + one group alert), or a single
    // landing:create for 1 target. Uses the on-screen landing time/offset, committing them first.
    private fun deployGroup() {
        val timeStr = currentGroupTime()
        val offset = currentCastleOffset()
        val g = getGroup()
        g.put("landingTime", timeStr); g.put("castleOffset", offset); saveGroup(g)

        val baseMs = grpLandingMs(timeStr)
        if (baseMs == null) { Toast.makeText(this, "Set a valid landing time (HH:mm:ss) first.", Toast.LENGTH_LONG).show(); return }
        val sdf = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US)
        sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")

        val landings = JSONArray()
        for (gt in groupTargets) {
            if (!sectionEnabled(g, gt.id)) continue
            val ids = groupSectionPlayerIds(g, gt.id)
            if (ids.isEmpty()) continue
            val teamId = g.optJSONObject("sections")?.optJSONObject(gt.id)?.optString("teamId", "") ?: ""
            val teamName = if (teamId.isNotEmpty()) teamsList.find { it.optString("id") == teamId }?.optString("name") ?: "" else ""
            val targetMs = baseMs + (if (gt.id == "castle") offset * 1000L else 0L)
            val offsets = JSONObject()
            for (pid in ids) offsets.put(pid, 0)
            val landing = JSONObject()
            landing.put("x", gt.x); landing.put("y", gt.y)
            landing.put("time", sdf.format(java.util.Date(targetMs)))
            landing.put("assignedTo", if (teamName.isNotEmpty()) teamName else "GROUP ${gt.display.uppercase()}")
            landing.put("type", gt.display)
            landing.put("rallyTime", 300)
            landing.put("playerOffsets", offsets)
            landings.put(landing)
        }

        when {
            landings.length() == 0 ->
                Toast.makeText(this, "Nothing to deploy — enable a target and assign forces.", Toast.LENGTH_LONG).show()
            landings.length() == 1 -> {
                socket?.emit("landing:create", landings.getJSONObject(0))
                Toast.makeText(this, "Deployed 1 target landing to everyone.", Toast.LENGTH_SHORT).show()
            }
            else -> {
                socket?.emit("grouping:deploy", JSONObject().put("landings", landings))
                Toast.makeText(this, "Deployed ${landings.length()} target landings to everyone.", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun setSectionEnabled(targetId: String, enabled: Boolean) {
        val g = getGroup(); groupSection(g, targetId).put("enabled", enabled); saveGroup(g); updateGroupStatus()
    }

    private fun removeGroupIndividual(targetId: String, playerId: String) {
        val g = getGroup(); val sec = groupSection(g, targetId)
        val arr = sec.optJSONArray("playerIds") ?: JSONArray(); val newArr = JSONArray()
        for (i in 0 until arr.length()) { val pid = arr.getString(i); if (pid != playerId) newArr.put(pid) }
        sec.put("playerIds", newArr); saveGroup(g); renderGroupPlanner(); updateGroupStatus()
    }

    private fun refreshGroupPlannerUI() {
        val prefs = getSharedPreferences("CompanionAppPrefs", Context.MODE_PRIVATE)
        val userRole = prefs.getString("userRole", "USER")
        val isPrivileged = userRole == "SUPERADMIN" || userRole == "ADMIN" || userRole == "COMMANDER"
        val card = findViewById<View>(R.id.cardGroupPlanner) ?: return
        card.visibility = if (isPrivileged) View.VISIBLE else View.GONE
        if (isPrivileged) { renderGroupPlanner(); updateGroupStatus() }
    }

    private fun renderGroupPlanner() {
        val container = grpSections ?: return
        container.removeAllViews()
        val g = getGroup()
        val teams = teamsList.filter { !it.optBoolean("isEnemy", false) }
        val players = playersList.filter { it.optString("allianceId") == "ally" }
        val globallyAssigned = allAssignedPlayerIds(g)

        for (gt in groupTargets) {
            val sec = groupSection(g, gt.id)
            val enabled = sec.optBoolean("enabled", true)
            val indivArr = sec.optJSONArray("playerIds") ?: JSONArray()
            val indivIds = (0 until indivArr.length()).map { indivArr.getString(it) }
            val assignedIds = groupSectionPlayerIds(g, gt.id)

            val card = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setBackgroundColor(Color.parseColor("#262626"))
                setPadding(20, 16, 20, 16)
                alpha = if (enabled) 1f else 0.45f
                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { setMargins(0, 0, 0, 16) }
            }

            val headerRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = android.view.Gravity.CENTER_VERTICAL; setPadding(0, 0, 0, 8) }
            val cbInclude = CheckBox(this).apply {
                isChecked = enabled
                buttonTintList = android.content.res.ColorStateList.valueOf(Color.parseColor("#EAB308"))
                setOnCheckedChangeListener { _, checked -> setSectionEnabled(gt.id, checked); renderGroupPlanner() }
            }
            val headerText = TextView(this).apply {
                text = "${gt.display.uppercase()}  ·  ${assignedIds.size} assigned"
                setTextColor(Color.parseColor("#EAB308")); textSize = 13f; typeface = android.graphics.Typeface.DEFAULT_BOLD
            }
            headerRow.addView(cbInclude); headerRow.addView(headerText); card.addView(headerRow)

            val teamNames = mutableListOf("— No team —"); val teamIds = mutableListOf("")
            for (t in teams) { teamNames.add(t.optString("name")); teamIds.add(t.optString("id")) }
            val teamSpinner = Spinner(this).apply {
                background = getDrawable(android.R.drawable.btn_dropdown)
                adapter = ArrayAdapter(this@DashboardActivity, android.R.layout.simple_spinner_item, teamNames).also { it.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item) }
                val cur = teamIds.indexOf(sec.optString("teamId", "")); if (cur >= 0) setSelection(cur)
            }
            teamSpinner.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
                override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, rowId: Long) {
                    val current = getGroup().optJSONObject("sections")?.optJSONObject(gt.id)?.optString("teamId", "") ?: ""
                    val picked = teamIds.getOrElse(position) { "" }
                    if (picked == current) return
                    val g2 = getGroup(); groupSection(g2, gt.id).put("teamId", picked); saveGroup(g2); renderGroupPlanner(); updateGroupStatus()
                }
                override fun onNothingSelected(parent: AdapterView<*>?) {}
            }
            card.addView(teamSpinner)

            if (assignedIds.isEmpty()) {
                card.addView(TextView(this).apply { text = "No players."; setTextColor(Color.parseColor("#666666")); textSize = 12f; setPadding(0, 6, 0, 0) })
            } else {
                for (pid in assignedIds) {
                    val pname = grpPlayerName(pid)
                    val isIndividual = indivIds.contains(pid)
                    val march = grpPlayerMarch(pid, gt.mtField)
                    val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = android.view.Gravity.CENTER_VERTICAL; setPadding(0, 6, 0, 0) }
                    val nameTv = TextView(this).apply {
                        val src = if (isIndividual) "" else "  ·team"
                        text = if (march > 0L) "• $pname (${march}s)$src" else "• $pname  ⚠ no march$src"
                        setTextColor(if (march > 0L) Color.parseColor("#B0B0B0") else Color.parseColor("#CF6679"))
                        textSize = 12f
                        layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                    }
                    row.addView(nameTv)
                    if (isIndividual) {
                        row.addView(Button(this).apply {
                            text = "✕"; setBackgroundColor(Color.parseColor("#3A1A1A")); setTextColor(Color.parseColor("#CF6679")); textSize = 10f; setPadding(0, 0, 0, 0)
                            layoutParams = LinearLayout.LayoutParams((30 * resources.displayMetrics.density + 0.5f).toInt(), (30 * resources.displayMetrics.density + 0.5f).toInt())
                            setOnClickListener { removeGroupIndividual(gt.id, pid) }
                        })
                    }
                    card.addView(row)
                }
            }

            val addNames = mutableListOf("+ Add extra player"); val addIds = mutableListOf("")
            for (p in players) { val pid = p.optString("id"); if (!globallyAssigned.contains(pid)) { addNames.add(p.optString("name")); addIds.add(pid) } }
            val addSpinner = Spinner(this).apply {
                background = getDrawable(android.R.drawable.btn_dropdown)
                adapter = ArrayAdapter(this@DashboardActivity, android.R.layout.simple_spinner_item, addNames).also { it.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item) }
                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { setMargins(0, 10, 0, 0) }
            }
            addSpinner.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
                override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, rowId: Long) {
                    if (position <= 0) return
                    val g2 = getGroup(); val s = groupSection(g2, gt.id)
                    val arr = s.optJSONArray("playerIds") ?: JSONArray().also { s.put("playerIds", it) }
                    arr.put(addIds.getOrElse(position) { "" }); saveGroup(g2); renderGroupPlanner(); updateGroupStatus()
                }
                override fun onNothingSelected(parent: AdapterView<*>?) {}
            }
            card.addView(addSpinner)

            container.addView(card)
        }
    }

    private fun refreshTeamManagementUI() {
        val prefs = getSharedPreferences("CompanionAppPrefs", Context.MODE_PRIVATE)
        val userRole = prefs.getString("userRole", "USER")
        val isPrivileged = userRole == "SUPERADMIN" || userRole == "ADMIN" || userRole == "COMMANDER"

        val cardTeamManagement = findViewById<View>(R.id.cardTeamManagement) ?: return
        val cardCommanderPlanner = findViewById<View>(R.id.cardCommanderPlanner) ?: return

        if (!isPrivileged) {
            cardTeamManagement.visibility = View.GONE
            cardCommanderPlanner.visibility = View.GONE
            return
        }

        cardTeamManagement.visibility = View.VISIBLE
        cardCommanderPlanner.visibility = View.VISIBLE

        val container = findViewById<LinearLayout>(R.id.llTeamManagementList) ?: return
        container.removeAllViews()

        if (teamsList.isEmpty()) {
            val tvEmpty = TextView(this)
            tvEmpty.text = "No teams configured. Create one above!"
            tvEmpty.setTextColor(Color.GRAY)
            tvEmpty.textSize = 12f
            container.addView(tvEmpty)
            return
        }

        // List all teams
        for (t in 0 until teamsList.size) {
            val team = teamsList[t]
            val teamId = team.optString("id")
            val teamName = team.optString("name")
            val isEnemy = team.optBoolean("isEnemy", false)

            val teamCard = LinearLayout(this)
            teamCard.orientation = LinearLayout.VERTICAL
            teamCard.setBackgroundColor(Color.parseColor("#262626"))
            teamCard.setPadding(20, 20, 20, 20)
            val cardParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            cardParams.setMargins(0, 0, 0, 24)
            teamCard.layoutParams = cardParams

            // Header Layout (Team Name, Type, and Delete Button)
            val headerLayout = LinearLayout(this)
            headerLayout.orientation = LinearLayout.HORIZONTAL
            headerLayout.gravity = android.view.Gravity.CENTER_VERTICAL
            val headerParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            headerParams.setMargins(0, 0, 0, 16)
            headerLayout.layoutParams = headerParams

            val tvTitle = TextView(this)
            tvTitle.text = teamName
            tvTitle.setTextColor(Color.WHITE)
            tvTitle.textSize = 15f
            tvTitle.typeface = android.graphics.Typeface.DEFAULT_BOLD
            val titleParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            tvTitle.layoutParams = titleParams

            val tvType = TextView(this)
            tvType.text = if (isEnemy) "ENEMY " else "ALLIED "
            tvType.setTextColor(if (isEnemy) Color.RED else Color.GREEN)
            tvType.textSize = 10f
            tvType.typeface = android.graphics.Typeface.MONOSPACE

            val btnDelete = Button(this)
            btnDelete.text = "X"
            btnDelete.setBackgroundColor(Color.parseColor("#CF6679"))
            btnDelete.setTextColor(Color.WHITE)
            val deleteParams = LinearLayout.LayoutParams((36 * resources.displayMetrics.density + 0.5f).toInt(), (32 * resources.displayMetrics.density + 0.5f).toInt())
            btnDelete.layoutParams = deleteParams
            btnDelete.textSize = 10f
            btnDelete.setPadding(0, 0, 0, 0)
            btnDelete.setOnClickListener {
                val payload = JSONObject()
                payload.put("teamId", teamId)
                socket?.emit("admin:delete_team", payload)
                Toast.makeText(this, "Team '$teamName' deletion broadcasted.", Toast.LENGTH_SHORT).show()
            }

            headerLayout.addView(tvTitle)
            headerLayout.addView(tvType)
            headerLayout.addView(btnDelete)
            teamCard.addView(headerLayout)

            // Players list sub-header
            val tvPlayersHeader = TextView(this)
            tvPlayersHeader.text = "PLAYERS IN TEAM:"
            tvPlayersHeader.setTextColor(Color.parseColor("#808080"))
            tvPlayersHeader.textSize = 11f
            tvPlayersHeader.setPadding(0, 0, 0, 8)
            teamCard.addView(tvPlayersHeader)

            // Dynamic Players list inside the team card
            val playersArray = team.optJSONArray("players")
            if (playersArray != null && playersArray.length() > 0) {
                for (p in 0 until playersArray.length()) {
                    val pObj = playersArray.getJSONObject(p)
                    val pId = pObj.optString("id")
                    val pName = pObj.optString("name")

                    val playerRow = LinearLayout(this)
                    playerRow.orientation = LinearLayout.HORIZONTAL
                    playerRow.gravity = android.view.Gravity.CENTER_VERTICAL
                    val rowParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                    rowParams.setMargins(0, 0, 0, 8)
                    playerRow.layoutParams = rowParams

                    val tvPlayerName = TextView(this)
                    tvPlayerName.text = pName
                    tvPlayerName.setTextColor(Color.parseColor("#E0E0E0"))
                    tvPlayerName.textSize = 13f
                    val pNameParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                    tvPlayerName.layoutParams = pNameParams

                    val btnRemovePlayer = Button(this)
                    btnRemovePlayer.text = "Remove"
                    btnRemovePlayer.setBackgroundColor(Color.DKGRAY)
                    btnRemovePlayer.setTextColor(Color.WHITE)
                    val removeParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, (30 * resources.displayMetrics.density + 0.5f).toInt())
                    btnRemovePlayer.layoutParams = removeParams
                    btnRemovePlayer.textSize = 9f
                    btnRemovePlayer.setPadding(10, 0, 10, 0)
                    btnRemovePlayer.setOnClickListener {
                        val payload = JSONObject()
                        payload.put("playerId", pId)
                        payload.put("teamId", JSONObject.NULL) // Unassign player
                        socket?.emit("admin:assign_player_to_team", payload)
                        Toast.makeText(this, "Removing $pName from team...", Toast.LENGTH_SHORT).show()
                    }

                    playerRow.addView(tvPlayerName)
                    playerRow.addView(btnRemovePlayer)
                    teamCard.addView(playerRow)
                }
            } else {
                val tvNoPlayers = TextView(this)
                tvNoPlayers.text = "No players assigned."
                tvNoPlayers.setTextColor(Color.parseColor("#555555"))
                tvNoPlayers.textSize = 12f
                tvNoPlayers.setPadding(0, 0, 0, 12)
                teamCard.addView(tvNoPlayers)
            }

            // Assign Player Section inside team card
            val assignLayout = LinearLayout(this)
            assignLayout.orientation = LinearLayout.HORIZONTAL
            assignLayout.gravity = android.view.Gravity.CENTER_VERTICAL
            val assignParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            assignParams.setMargins(0, 12, 0, 0)
            assignLayout.layoutParams = assignParams

            val unassignedPlayersNames = mutableListOf<String>()
            val unassignedPlayersIds = mutableListOf<String>()
            
            unassignedPlayersNames.add("-- Select Player --")
            unassignedPlayersIds.add("")

            for (playerObj in playersList) {
                val pId = playerObj.optString("id")
                val pName = playerObj.optString("name")
                val pTeamId = playerObj.optString("teamId", "")

                if (pTeamId != teamId) {
                    unassignedPlayersNames.add(pName)
                    unassignedPlayersIds.add(pId)
                }
            }

            val spinner = Spinner(this)
            val spinnerParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            spinner.layoutParams = spinnerParams
            spinner.background = getDrawable(android.R.drawable.btn_dropdown)
            val assignAdapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, unassignedPlayersNames)
            assignAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
            spinner.adapter = assignAdapter

            val btnAssign = Button(this)
            btnAssign.text = "Assign"
            btnAssign.setBackgroundColor(Color.parseColor("#EAB308"))
            btnAssign.setTextColor(Color.BLACK)
            val assignBtnParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, (36 * resources.displayMetrics.density + 0.5f).toInt())
            assignBtnParams.setMargins(10, 0, 0, 0)
            btnAssign.layoutParams = assignBtnParams
            btnAssign.textSize = 11f
            btnAssign.setPadding(15, 0, 15, 0)
            btnAssign.setOnClickListener {
                val selectedPos = spinner.selectedItemPosition
                if (selectedPos > 0) {
                    val pIdToAssign = unassignedPlayersIds[selectedPos]
                    val pNameToAssign = unassignedPlayersNames[selectedPos]
                    val payload = JSONObject()
                    payload.put("playerId", pIdToAssign)
                    payload.put("teamId", teamId)
                    socket?.emit("admin:assign_player_to_team", payload)
                    Toast.makeText(this, "Assigning $pNameToAssign to $teamName...", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(this, "Please select a player to assign", Toast.LENGTH_SHORT).show()
                }
            }

            assignLayout.addView(spinner)
            assignLayout.addView(btnAssign)
            teamCard.addView(assignLayout)

            container.addView(teamCard)
        }
    }

    private fun refreshCommanderPlannerUI() {
        val spPlannerTeam = findViewById<Spinner>(R.id.spPlannerTeam) ?: return
        val btnPlannerCancelLanding = findViewById<Button>(R.id.btnPlannerCancelLanding) ?: return
        
        val alliedTeamNames = teamsList.filter { !it.optBoolean("isEnemy", false) }.map { it.optString("name") }
        val currentSelectedTeam = spPlannerTeam.selectedItem?.toString() ?: ""
        
        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, alliedTeamNames)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spPlannerTeam.adapter = adapter
        
        if (currentSelectedTeam.isNotBlank()) {
            val restoreIndex = alliedTeamNames.indexOf(currentSelectedTeam)
            if (restoreIndex != -1) {
                spPlannerTeam.setSelection(restoreIndex)
            }
        }
        
        rebuildPlannerPlayerOffsets()
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
                            cal.set(java.util.Calendar.MILLISECOND, 0)
                            // Match the web calculator: a landing time already >10min past is tomorrow's.
                            val nowMs = System.currentTimeMillis() - FloatingOverlayService.serverTimeOffset
                            if (cal.timeInMillis < nowMs - 600000L) {
                                cal.add(java.util.Calendar.DAY_OF_YEAR, 1)
                            }
                            cal.time
                        } else null
                    }

                    if (date != null) {
                        val rallyTimeSeconds = allyTeam.optLong("rallyTime", 300L)
                        val playerOffsetsObj = allyTeam.optJSONObject("playerOffsets")
                        val playerOffsetSeconds = playerOffsetsObj?.optLong(playerId, 0L) ?: 0L

                        val finalMarchTimeMs = if (exactMarchTimeSeconds != null) exactMarchTimeSeconds!! * 1000L else fallbackMarchTimeMs
                        val rallyTimeMs = rallyTimeSeconds * 1000L
                        val playerOffsetMs = playerOffsetSeconds * 1000L

                        val startTimeMs = date.time + playerOffsetMs - finalMarchTimeMs - rallyTimeMs
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
                        // Block duplicate active rallies
                        val initiatorActiveRally = ralliesList.find { r ->
                            r.optString("initiatorId") == assignedInitiator
                        }
                        if (initiatorActiveRally != null) {
                            Toast.makeText(this, "You already have an active rally on ${initiatorActiveRally.optString("target")}!", Toast.LENGTH_SHORT).show()
                            return@setOnClickListener
                        }

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

    private fun formatToHHMMSS(timeStr: String): String {
        val clean = timeStr.replace(":", "")
        if (clean.length == 6) {
            return "${clean.substring(0, 2)}:${clean.substring(2, 4)}:${clean.substring(4, 6)}"
        }
        return timeStr
    }

    private fun getPlayerMarchTimeForTarget(playerObj: JSONObject, targetName: String): Long {
        val t = targetName.lowercase().replace(" ", "_")
        return when {
            t.contains("castle") -> playerObj.optLong("mtCastle", 0L)
            t.contains("north") -> playerObj.optLong("mtNorth", 0L)
            t.contains("east") -> playerObj.optLong("mtEast", 0L)
            t.contains("south") -> playerObj.optLong("mtSouth", 0L)
            t.contains("west") -> playerObj.optLong("mtWest", 0L)
            else -> {
                try {
                    val customStr = playerObj.optString("customMarchTimes", "{}")
                    val customObj = JSONObject(customStr)
                    customObj.optLong(t, 0L)
                } catch (e: Exception) {
                    0L
                }
            }
        }
    }

    private fun updatePlayerMarchTime(playerId: String, playerObj: JSONObject, targetName: String, newMarchSec: Long) {
        val t = targetName.lowercase().replace(" ", "_")
        
        var mtCastle = playerObj.optLong("mtCastle", 0L)
        var mtNorth = playerObj.optLong("mtNorth", 0L)
        var mtEast = playerObj.optLong("mtEast", 0L)
        var mtSouth = playerObj.optLong("mtSouth", 0L)
        var mtWest = playerObj.optLong("mtWest", 0L)
        
        val customMarchTimesObj = try {
            val customStr = playerObj.optString("customMarchTimes", "{}")
            JSONObject(customStr)
        } catch (e: Exception) {
            JSONObject()
        }
        
        if (t.contains("castle")) mtCastle = newMarchSec
        else if (t.contains("north")) mtNorth = newMarchSec
        else if (t.contains("east")) mtEast = newMarchSec
        else if (t.contains("south")) mtSouth = newMarchSec
        else if (t.contains("west")) mtWest = newMarchSec
        else {
            customMarchTimesObj.put(t, newMarchSec)
        }
        
        val payload = JSONObject()
        payload.put("playerId", playerId)
        payload.put("mtCastle", mtCastle)
        payload.put("mtNorth", mtNorth)
        payload.put("mtEast", mtEast)
        payload.put("mtSouth", mtSouth)
        payload.put("mtWest", mtWest)
        payload.put("customMarchTimes", customMarchTimesObj)
        
        socket?.emit("player:update_march_times", payload)
    }

    private fun rebuildPlannerPlayerOffsets() {
        val spPlannerTeam = findViewById<Spinner>(R.id.spPlannerTeam) ?: return
        val spPlannerTarget = findViewById<Spinner>(R.id.spPlannerTarget) ?: return
        val tvPlannerOffsetsTitle = findViewById<TextView>(R.id.tvPlannerOffsetsTitle) ?: return
        val llPlannerPlayerOffsets = findViewById<LinearLayout>(R.id.llPlannerPlayerOffsets) ?: return
        val etPlannerLandingTime = findViewById<EditText>(R.id.etPlannerLandingTime) ?: return
        val btnPlannerCancelLanding = findViewById<Button>(R.id.btnPlannerCancelLanding) ?: return
        val spPlannerRallyTime = findViewById<Spinner>(R.id.spPlannerRallyTime) ?: return

        val selectedTeamName = spPlannerTeam.selectedItem?.toString() ?: ""
        val selectedTeam = teamsList.find { !it.optBoolean("isEnemy", false) && it.optString("name") == selectedTeamName }

        llPlannerPlayerOffsets.removeAllViews()
        plannerPlayerOffsets.clear()

        if (selectedTeam != null) {
            val players = selectedTeam.optJSONArray("players")
            if (players != null && players.length() > 0) {
                tvPlannerOffsetsTitle.visibility = View.VISIBLE
                llPlannerPlayerOffsets.visibility = View.VISIBLE

                val existingOffsets = selectedTeam.optJSONObject("playerOffsets")
                val targetName = spPlannerTarget.selectedItem?.toString() ?: "Castle"

                for (p in 0 until players.length()) {
                    val playerObj = players.getJSONObject(p)
                    val pId = playerObj.optString("id")
                    val pName = playerObj.optString("name")

                    val row = LinearLayout(this)
                    row.orientation = LinearLayout.HORIZONTAL
                    row.gravity = android.view.Gravity.CENTER_VERTICAL
                    val rowParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                    rowParams.setMargins(0, 0, 0, 15)
                    row.layoutParams = rowParams

                    val tvName = TextView(this)
                    val lpName = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.0f)
                    tvName.layoutParams = lpName
                    tvName.text = pName
                    tvName.setTextColor(Color.WHITE)
                    tvName.textSize = 13f

                    val tvMarchLabel = TextView(this)
                    tvMarchLabel.text = " March:"
                    tvMarchLabel.setTextColor(Color.GRAY)
                    tvMarchLabel.textSize = 11f

                    val etMarch = EditText(this)
                    val lpMarch = LinearLayout.LayoutParams((45 * resources.displayMetrics.density + 0.5f).toInt(), LinearLayout.LayoutParams.WRAP_CONTENT)
                    etMarch.layoutParams = lpMarch
                    etMarch.inputType = android.text.InputType.TYPE_CLASS_NUMBER
                    etMarch.gravity = android.view.Gravity.CENTER
                    etMarch.setTextColor(Color.CYAN)
                    etMarch.textSize = 12f
                    etMarch.typeface = android.graphics.Typeface.MONOSPACE

                    val currentMarchVal = getPlayerMarchTimeForTarget(playerObj, targetName)
                    if (currentMarchVal > 0) {
                        etMarch.setText(currentMarchVal.toString())
                    } else {
                        etMarch.setHint("--")
                    }

                    etMarch.addTextChangedListener(object : android.text.TextWatcher {
                        override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                        override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                            val valLong = if (s.isNullOrBlank()) 0L else s.toString().toLongOrNull() ?: 0L
                            updatePlayerMarchTime(pId, playerObj, targetName, valLong)
                        }
                        override fun afterTextChanged(s: android.text.Editable?) {}
                    })

                    val tvMarchSuffix = TextView(this)
                    tvMarchSuffix.text = "s |"
                    tvMarchSuffix.setTextColor(Color.CYAN)
                    tvMarchSuffix.textSize = 11f

                    val tvLabel = TextView(this)
                    tvLabel.text = " Delay:"
                    tvLabel.setTextColor(Color.GRAY)
                    tvLabel.textSize = 11f

                    val etDelay = EditText(this)
                    val lpDelay = LinearLayout.LayoutParams((45 * resources.displayMetrics.density + 0.5f).toInt(), LinearLayout.LayoutParams.WRAP_CONTENT)
                    etDelay.layoutParams = lpDelay
                    etDelay.inputType = android.text.InputType.TYPE_CLASS_NUMBER
                    etDelay.gravity = android.view.Gravity.CENTER
                    etDelay.setTextColor(Color.YELLOW)
                    etDelay.textSize = 12f
                    etDelay.typeface = android.graphics.Typeface.MONOSPACE

                    val savedVal = existingOffsets?.optLong(pId, 0L) ?: 0L
                    if (savedVal > 0) {
                        etDelay.setText(savedVal.toString())
                        plannerPlayerOffsets[pId] = savedVal
                    } else {
                        etDelay.setHint("+0s")
                        plannerPlayerOffsets[pId] = 0L
                    }

                    etDelay.addTextChangedListener(object : android.text.TextWatcher {
                        override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                        override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                            val valLong = if (s.isNullOrBlank()) 0L else s.toString().toLongOrNull() ?: 0L
                            plannerPlayerOffsets[pId] = valLong
                        }
                        override fun afterTextChanged(s: android.text.Editable?) {}
                    })

                    val tvSuffix = TextView(this)
                    tvSuffix.text = "s"
                    tvSuffix.setTextColor(Color.YELLOW)
                    tvSuffix.textSize = 11f

                    row.addView(tvName)
                    row.addView(tvMarchLabel)
                    row.addView(etMarch)
                    row.addView(tvMarchSuffix)
                    row.addView(tvLabel)
                    row.addView(etDelay)
                    row.addView(tvSuffix)
                    llPlannerPlayerOffsets.addView(row)
                }

                // Pre-populate landing details
                val landingTarget = selectedTeam.optString("selectedTarget")
                val landingTime = selectedTeam.optString("landingTime")
                val rallyTimeSec = selectedTeam.optLong("rallyTime", 300L)

                if (landingTime.isNotBlank()) {
                    etPlannerLandingTime.setText(formatToHHMMSS(landingTime))
                    btnPlannerCancelLanding.visibility = View.VISIBLE

                    val targetIndex = targets.indexOfFirst { it.equals(landingTarget, ignoreCase = true) }
                    if (targetIndex != -1) {
                        spPlannerTarget.setSelection(targetIndex)
                    }

                    val rallyIndex = when (rallyTimeSec) {
                        60L -> 0
                        120L -> 1
                        300L -> 2
                        600L -> 3
                        else -> 2
                    }
                    spPlannerRallyTime.setSelection(rallyIndex)
                } else {
                    etPlannerLandingTime.setText("")
                    btnPlannerCancelLanding.visibility = View.GONE
                }
            } else {
                tvPlannerOffsetsTitle.visibility = View.GONE
                llPlannerPlayerOffsets.visibility = View.GONE
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(refreshRunnable)
        socket?.disconnect()
        try { unregisterReceiver(overlayReceiver) } catch (e: Exception) {}
    }
}
