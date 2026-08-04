package com.companionapp

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.text.method.DigitsKeyListener
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import com.companionapp.overlay.FloatingOverlayService
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*

class OfflineActivity : AppCompatActivity() {

    private val targetOptions = arrayOf("Castle", "North Turret", "East Turret", "South Turret", "West Turret")
    private val colorNames = arrayOf("Red", "Blue", "Green", "Purple", "Orange")
    private val colorValues = arrayOf("red", "blue", "green", "purple", "#FFA500")

    // Group planner targets: id, display name, march-time field.
    private val groupTargets = listOf(
        Triple("castle", "Castle", "mtCastle"),
        Triple("north", "North Turret", "mtNorth"),
        Triple("east", "East Turret", "mtEast"),
        Triple("south", "South Turret", "mtSouth"),
        Triple("west", "West Turret", "mtWest")
    )

    private lateinit var etPlayerName: EditText
    private lateinit var btnCreatePlayer: Button
    private lateinit var llPlayersList: LinearLayout

    private lateinit var etTeamName: EditText
    private lateinit var spTeamTarget: Spinner
    private lateinit var etLaunchDelay: EditText
    private lateinit var spTeamColor: Spinner
    private lateinit var cbShowOnOverlay: CheckBox
    private lateinit var btnCreateTeam: Button
    private lateinit var llOfflineTeamsList: LinearLayout
    private lateinit var btnToggleOverlay: Button

    // Group planner views
    private lateinit var etGroupLandingTime: EditText
    private lateinit var etGroupCastleOffset: EditText
    private lateinit var etGroupDelay: EditText
    private lateinit var cbGroupOverlay: CheckBox
    private lateinit var llGroupSections: LinearLayout
    private lateinit var tvGroupStatus: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_offline)

        // Setup toolbar & overlay toggle
        val toolbar = findViewById<androidx.appcompat.widget.Toolbar>(R.id.toolbar)
        setSupportActionBar(toolbar)

        btnToggleOverlay = findViewById(R.id.btnToggleOverlay)
        btnToggleOverlay.setOnClickListener {
            checkOverlayPermission()
        }

        // Bind Player inputs
        etPlayerName = findViewById(R.id.etPlayerName)
        btnCreatePlayer = findViewById(R.id.btnCreatePlayer)
        llPlayersList = findViewById(R.id.llPlayersList)

        btnCreatePlayer.setOnClickListener {
            val name = etPlayerName.text.toString().trim()
            if (name.isNotEmpty()) {
                createPlayer(name)
                etPlayerName.setText("")
                refreshUI()
                updateOverlay()
            } else {
                Toast.makeText(this, "Please enter a player name", Toast.LENGTH_SHORT).show()
            }
        }

        // Bind Team inputs
        etTeamName = findViewById(R.id.etTeamName)
        spTeamTarget = findViewById(R.id.spTeamTarget)
        etLaunchDelay = findViewById(R.id.etLaunchDelay)
        spTeamColor = findViewById(R.id.spTeamColor)
        cbShowOnOverlay = findViewById(R.id.cbShowOnOverlay)
        btnCreateTeam = findViewById(R.id.btnCreateTeam)
        llOfflineTeamsList = findViewById(R.id.llOfflineTeamsList)

        // Populate Target selection spinner
        val targetAdapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, targetOptions)
        targetAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spTeamTarget.adapter = targetAdapter

        // Populate Color selection spinner
        val colorAdapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, colorNames)
        colorAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spTeamColor.adapter = colorAdapter

        btnCreateTeam.setOnClickListener {
            val name = etTeamName.text.toString().trim()
            val delayStr = etLaunchDelay.text.toString().trim()
            val delaySec = if (delayStr.isEmpty()) 10 else delayStr.toIntOrNull() ?: 10
            val target = spTeamTarget.selectedItem?.toString() ?: "Castle"
            val colorIndex = spTeamColor.selectedItemPosition
            val colorHex = if (colorIndex >= 0 && colorIndex < colorValues.size) colorValues[colorIndex] else "red"
            val showOnOverlay = cbShowOnOverlay.isChecked

            if (name.isNotEmpty()) {
                createTeam(name, target, delaySec, colorHex, showOnOverlay)
                etTeamName.setText("")
                etLaunchDelay.setText("10")
                refreshUI()
                updateOverlay()
            } else {
                Toast.makeText(this, "Please enter a team name", Toast.LENGTH_SHORT).show()
            }
        }

        // Back to Login Button
        findViewById<Button>(R.id.btnBackToLogin).setOnClickListener {
            val prefs = getSharedPreferences("CompanionAppPrefs", Context.MODE_PRIVATE)
            prefs.edit().apply {
                putBoolean("isOfflineMode", false)
                apply()
            }
            // Stop overlay if running
            val intent = Intent(this, FloatingOverlayService::class.java)
            stopService(intent)

            startActivity(Intent(this, MainActivity::class.java))
            finish()
        }

        // --- Group Attack Planner ---
        etGroupLandingTime = findViewById(R.id.etGroupLandingTime)
        etGroupCastleOffset = findViewById(R.id.etGroupCastleOffset)
        llGroupSections = findViewById(R.id.llGroupSections)
        tvGroupStatus = findViewById(R.id.tvGroupStatus)

        val savedGroup = getGroup()
        etGroupLandingTime.setText(savedGroup.optString("landingTime", ""))
        etGroupCastleOffset.setText(savedGroup.optInt("castleOffset", 0).toString())

        etGroupDelay = findViewById(R.id.etGroupDelay)
        cbGroupOverlay = findViewById(R.id.cbGroupOverlay)
        etGroupDelay.setText(savedGroup.optInt("delay", 0).toString())
        cbGroupOverlay.isChecked = savedGroup.optBoolean("overlayEnabled", false)
        etGroupDelay.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                val g = getGroup(); g.put("delay", s.toString().trim().toIntOrNull() ?: 0); saveGroup(g)
            }
        })
        cbGroupOverlay.setOnCheckedChangeListener { _, checked ->
            val g = getGroup(); g.put("overlayEnabled", checked); saveGroup(g); updateOverlay()
        }

        etGroupLandingTime.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                val g = getGroup(); g.put("landingTime", s.toString().trim()); saveGroup(g); updateGroupStatus()
            }
        })
        etGroupCastleOffset.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                val g = getGroup(); g.put("castleOffset", s.toString().trim().toIntOrNull() ?: 0); saveGroup(g)
            }
        })

        findViewById<Button>(R.id.btnGroupSuggest).setOnClickListener {
            val suggested = suggestGroupLandingTime()
            if (suggested != null) {
                etGroupLandingTime.setText(suggested)
                Toast.makeText(this, "Set earliest feasible landing time.", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(this, "Assign a team or player to a target first.", Toast.LENGTH_SHORT).show()
            }
        }

        findViewById<Button>(R.id.btnGroupCopyPlan).setOnClickListener {
            val plan = buildGroupPlan()
            if (plan == null || plan.isBlank()) {
                Toast.makeText(this, "Set a valid landing time and assign forces first.", Toast.LENGTH_LONG).show()
            } else {
                val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                clipboard.setPrimaryClip(ClipData.newPlainText("SVS Group Plan", plan))
                Toast.makeText(this, "Group plan copied to clipboard!", Toast.LENGTH_SHORT).show()
            }
        }

        refreshUI()
    }

    private fun checkOverlayPermission() {
        if (!Settings.canDrawOverlays(this)) {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:$packageName")
            )
            startActivityForResult(intent, 100)
        } else {
            toggleOverlayService()
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 100) {
            if (Settings.canDrawOverlays(this)) {
                toggleOverlayService()
            } else {
                Toast.makeText(this, "Overlay permission required", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun toggleOverlayService() {
        updateOverlay()
        val am = getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
        var isRunning = false
        for (service in am.getRunningServices(Integer.MAX_VALUE)) {
            if (FloatingOverlayService::class.java.name == service.service.className) {
                isRunning = true
                break
            }
        }

        val intent = Intent(this, FloatingOverlayService::class.java)
        if (!isRunning) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent)
            } else {
                startService(intent)
            }
            Toast.makeText(this, "Floating Overlay Started", Toast.LENGTH_SHORT).show()
        } else {
            stopService(intent)
            Toast.makeText(this, "Floating Overlay Stopped", Toast.LENGTH_SHORT).show()
        }
    }

    private fun updateOverlay() {
        val prefs = getSharedPreferences("CompanionAppPrefs", Context.MODE_PRIVATE)
        val teams = getStoredTeams()
        val serviceList = ArrayList<HashMap<String, String>>()

        for (team in teams) {
            if (team.optBoolean("isOverlayAssigned", true)) {
                val map = HashMap<String, String>()
                map["target"] = team.optString("name") // Use team name for the button label
                map["teamTarget"] = team.optString("target") // Keep track of configured target
                map["color"] = team.optString("color", "red")
                map["action"] = "offline_team_click"
                map["customMarchTimeMs"] = "300000"
                map["isBlinking"] = "false"
                map["activeRallyId"] = ""
                map["initiatorId"] = ""
                map["isEnemy"] = "false"
                map["rallyEndTime"] = ""
                map["utcTime"] = ""
                serviceList.add(map)
            }
        }

        // Group overlay button (tap = instant copy of the whole group plan at earliest + delay).
        val group = getGroup()
        if (group.optBoolean("overlayEnabled", false) &&
            groupTargets.any { sectionEnabled(group, it.first) && groupSectionPlayerIds(group, it.first).isNotEmpty() }) {
            val gm = HashMap<String, String>()
            gm["target"] = "GROUP"
            gm["teamTarget"] = "GROUP"
            gm["color"] = "#EAB308"
            gm["action"] = "offline_group_click"
            gm["customMarchTimeMs"] = "300000"
            gm["isBlinking"] = "false"
            gm["activeRallyId"] = ""
            gm["initiatorId"] = ""
            gm["isEnemy"] = "false"
            gm["rallyEndTime"] = ""
            gm["utcTime"] = ""
            serviceList.add(gm)
        }

        FloatingOverlayService.updateButtons(serviceList)
        
        // If service is running, notify it to redraw
        val am = getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
        var isRunning = false
        for (service in am.getRunningServices(Integer.MAX_VALUE)) {
            if (FloatingOverlayService::class.java.name == service.service.className) {
                isRunning = true
                break
            }
        }
        if (isRunning && serviceList.isNotEmpty()) {
            val intent = Intent(this, FloatingOverlayService::class.java)
            startService(intent)
        }
    }

    private fun refreshUI() {
        renderPlayersList()
        renderTeamsList()
        renderGroupPlanner()
        updateGroupStatus()
    }

    // --- SharedPreferences Storage Helpers ---

    private fun getStoredPlayers(): List<JSONObject> {
        val prefs = getSharedPreferences("CompanionAppPrefs", Context.MODE_PRIVATE)
        val jsonStr = prefs.getString("offlinePlayers", "[]") ?: "[]"
        val list = mutableListOf<JSONObject>()
        try {
            val arr = JSONArray(jsonStr)
            for (i in 0 until arr.length()) {
                list.add(arr.getJSONObject(i))
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return list
    }

    private fun savePlayers(list: List<JSONObject>) {
        val prefs = getSharedPreferences("CompanionAppPrefs", Context.MODE_PRIVATE)
        val arr = JSONArray()
        for (obj in list) {
            arr.put(obj)
        }
        prefs.edit().putString("offlinePlayers", arr.toString()).apply()
    }

    private fun getStoredTeams(): List<JSONObject> {
        val prefs = getSharedPreferences("CompanionAppPrefs", Context.MODE_PRIVATE)
        val jsonStr = prefs.getString("offlineTeams", "[]") ?: "[]"
        val list = mutableListOf<JSONObject>()
        try {
            val arr = JSONArray(jsonStr)
            for (i in 0 until arr.length()) {
                list.add(arr.getJSONObject(i))
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return list
    }

    private fun saveTeams(list: List<JSONObject>) {
        val prefs = getSharedPreferences("CompanionAppPrefs", Context.MODE_PRIVATE)
        val arr = JSONArray()
        for (obj in list) {
            arr.put(obj)
        }
        prefs.edit().putString("offlineTeams", arr.toString()).apply()
    }

    // --- Business Logic Operations ---

    private fun createPlayer(name: String) {
        val players = getStoredPlayers().toMutableList()
        val newPlayer = JSONObject().apply {
            put("id", UUID.randomUUID().toString())
            put("name", name)
            put("mtCastle", 0)
            put("mtNorth", 0)
            put("mtEast", 0)
            put("mtSouth", 0)
            put("mtWest", 0)
        }
        players.add(newPlayer)
        savePlayers(players)
    }

    private fun createTeam(name: String, target: String, delaySec: Int, colorHex: String, showOnOverlay: Boolean) {
        val teams = getStoredTeams().toMutableList()
        val newTeam = JSONObject().apply {
            put("id", UUID.randomUUID().toString())
            put("name", name)
            put("target", target)
            put("launchDelay", delaySec)
            put("assignedPlayers", JSONArray())
            put("playerOffsets", JSONObject())
            put("color", colorHex)
            put("isOverlayAssigned", showOnOverlay)
            put("landingTime", "")
        }
        teams.add(newTeam)
        saveTeams(teams)
    }

    private fun deletePlayer(playerId: String) {
        // Remove from players roster
        val players = getStoredPlayers().filter { it.optString("id") != playerId }
        savePlayers(players)

        // Remove player assignment from all teams
        val teams = getStoredTeams()
        for (team in teams) {
            val assigned = team.optJSONArray("assignedPlayers") ?: JSONArray()
            val newAssigned = JSONArray()
            for (i in 0 until assigned.length()) {
                val id = assigned.getString(i)
                if (id != playerId) {
                    newAssigned.put(id)
                }
            }
            team.put("assignedPlayers", newAssigned)

            val offsets = team.optJSONObject("playerOffsets") ?: JSONObject()
            offsets.remove(playerId)
            team.put("playerOffsets", offsets)
        }
        saveTeams(teams)
        refreshUI()
        updateOverlay()
    }

    private fun deleteTeam(teamId: String) {
        val teams = getStoredTeams().filter { it.optString("id") != teamId }
        saveTeams(teams)
        refreshUI()
        updateOverlay()
    }

    private fun updatePlayerMarchTime(playerId: String, field: String, valSec: Long) {
        val players = getStoredPlayers()
        val player = players.find { it.optString("id") == playerId }
        if (player != null) {
            player.put(field, valSec)
            savePlayers(players)
        }
    }

    private fun assignPlayerToTeam(teamId: String, playerId: String) {
        val teams = getStoredTeams()
        val team = teams.find { it.optString("id") == teamId }
        if (team != null) {
            val assigned = team.optJSONArray("assignedPlayers") ?: JSONArray()
            // Check duplicate
            var found = false
            for (i in 0 until assigned.length()) {
                if (assigned.getString(i) == playerId) {
                    found = true
                    break
                }
            }
            if (!found) {
                assigned.put(playerId)
                val offsets = team.optJSONObject("playerOffsets") ?: JSONObject()
                offsets.put(playerId, 0) // default 0 offset
                team.put("assignedPlayers", assigned)
                team.put("playerOffsets", offsets)
                saveTeams(teams)
                refreshUI()
            }
        }
    }

    private fun removePlayerFromTeam(teamId: String, playerId: String) {
        val teams = getStoredTeams()
        val team = teams.find { it.optString("id") == teamId }
        if (team != null) {
            val assigned = team.optJSONArray("assignedPlayers") ?: JSONArray()
            val newAssigned = JSONArray()
            for (i in 0 until assigned.length()) {
                val id = assigned.getString(i)
                if (id != playerId) {
                    newAssigned.put(id)
                }
            }
            team.put("assignedPlayers", newAssigned)

            val offsets = team.optJSONObject("playerOffsets") ?: JSONObject()
            offsets.remove(playerId)
            team.put("playerOffsets", offsets)

            saveTeams(teams)
            refreshUI()
        }
    }

    private fun updateTeamPlayerOffset(teamId: String, playerId: String, offsetSec: Int) {
        val teams = getStoredTeams()
        val team = teams.find { it.optString("id") == teamId }
        if (team != null) {
            val offsets = team.optJSONObject("playerOffsets") ?: JSONObject()
            offsets.put(playerId, offsetSec)
            team.put("playerOffsets", offsets)
            saveTeams(teams)
        }
    }

    private fun updateTeamLandingTime(teamId: String, landingTimeStr: String) {
        val teams = getStoredTeams()
        val team = teams.find { it.optString("id") == teamId }
        if (team != null) {
            team.put("landingTime", landingTimeStr)
            saveTeams(teams)
        }
    }

    private fun updateTeamLaunchDelay(teamId: String, delaySec: Int) {
        val teams = getStoredTeams()
        val team = teams.find { it.optString("id") == teamId }
        if (team != null) {
            team.put("launchDelay", delaySec)
            saveTeams(teams)
            updateOverlay()
        }
    }

    // --- UI Rendering ---

    private fun renderPlayersList() {
        llPlayersList.removeAllViews()
        val players = getStoredPlayers()

        if (players.isEmpty()) {
            val tvEmpty = TextView(this).apply {
                text = "No players created yet."
                setTextColor(Color.GRAY)
                textSize = 13f
                setPadding(0, 8, 0, 8)
            }
            llPlayersList.addView(tvEmpty)
            return
        }

        for (player in players) {
            val pId = player.optString("id")
            val pName = player.optString("name")

            val playerCard = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setBackgroundColor(Color.parseColor("#292929"))
                setPadding(16, 16, 16, 16)
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    setMargins(0, 0, 0, 16)
                }
            }

            // Header: Name & Delete Button
            val header = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = android.view.Gravity.CENTER_VERTICAL
            }
            val tvName = TextView(this).apply {
                text = pName
                setTextColor(Color.WHITE)
                textSize = 15f
                typeface = android.graphics.Typeface.DEFAULT_BOLD
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
            val btnDelete = Button(this).apply {
                text = "X"
                setBackgroundColor(Color.parseColor("#CF6679"))
                setTextColor(Color.WHITE)
                layoutParams = LinearLayout.LayoutParams(
                    (36 * resources.displayMetrics.density + 0.5f).toInt(),
                    (32 * resources.displayMetrics.density + 0.5f).toInt()
                )
                textSize = 10f
                setPadding(0, 0, 0, 0)
                setOnClickListener {
                    deletePlayer(pId)
                }
            }
            header.addView(tvName)
            header.addView(btnDelete)
            playerCard.addView(header)

            // March Times Grid Label
            val tvGridLabel = TextView(this).apply {
                text = "March Times (Seconds):"
                setTextColor(Color.GRAY)
                textSize = 11f
                setPadding(0, 8, 0, 4)
            }
            playerCard.addView(tvGridLabel)

            // March Times Inputs Layout
            val gridLayout = GridLayout(this).apply {
                columnCount = 5
                rowCount = 1
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
            }

            val targetsList = arrayOf("Castle" to "mtCastle", "North" to "mtNorth", "East" to "mtEast", "South" to "mtSouth", "West" to "mtWest")
            for (pair in targetsList) {
                val inputLayout = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    gravity = android.view.Gravity.CENTER_HORIZONTAL
                    layoutParams = GridLayout.LayoutParams().apply {
                        width = 0
                        columnSpec = GridLayout.spec(GridLayout.UNDEFINED, 1f)
                    }
                }
                val tvLabel = TextView(this).apply {
                    text = pair.first
                    setTextColor(Color.parseColor("#E0E0E0"))
                    textSize = 9f
                }
                val etMarchVal = EditText(this).apply {
                    inputType = InputType.TYPE_CLASS_NUMBER
                    gravity = android.view.Gravity.CENTER
                    setTextColor(Color.CYAN)
                    textSize = 12f
                    typeface = android.graphics.Typeface.MONOSPACE
                    val currentVal = player.optLong(pair.second, 0L)
                    setText(if (currentVal > 0) currentVal.toString() else "")
                    hint = "0"
                    
                    addTextChangedListener(object : TextWatcher {
                        override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                        override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                            val sec = s.toString().toLongOrNull() ?: 0L
                            updatePlayerMarchTime(pId, pair.second, sec)
                        }
                        override fun afterTextChanged(s: Editable?) {}
                    })
                }
                inputLayout.addView(tvLabel)
                inputLayout.addView(etMarchVal)
                gridLayout.addView(inputLayout)
            }

            playerCard.addView(gridLayout)
            llPlayersList.addView(playerCard)
        }
    }

    private fun renderTeamsList() {
        llOfflineTeamsList.removeAllViews()
        val teams = getStoredTeams()
        val allPlayers = getStoredPlayers()

        if (teams.isEmpty()) {
            val tvEmpty = TextView(this).apply {
                text = "No teams created yet."
                setTextColor(Color.GRAY)
                textSize = 13f
                setPadding(0, 8, 0, 8)
            }
            llOfflineTeamsList.addView(tvEmpty)
            return
        }

        for (team in teams) {
            val teamId = team.optString("id")
            val teamName = team.optString("name")
            val target = team.optString("target", "Castle")
            val launchDelay = team.optInt("launchDelay", 10)
            val colorHex = team.optString("color", "red")
            val isOverlayAssigned = team.optBoolean("isOverlayAssigned", true)
            val landingTime = team.optString("landingTime", "")

            val teamCard = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setBackgroundColor(Color.parseColor("#1F1F1F"))
                setPadding(16, 16, 16, 16)
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    setMargins(0, 0, 0, 24)
                }
                // Custom border depending on target
                background = getDrawable(R.drawable.team_border)
                (background as? android.graphics.drawable.GradientDrawable)?.apply {
                    setColor(Color.parseColor("#1F1F1F"))
                    setStroke(3, Color.parseColor("#06B6D4"))
                }
            }

            // Header Layout (Team Name, Target, Color indicator, Delete Button)
            val header = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = android.view.Gravity.CENTER_VERTICAL
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    setMargins(0, 0, 0, 16)
                }
            }

            val tvTitle = TextView(this).apply {
                text = teamName.toUpperCase()
                setTextColor(Color.WHITE)
                textSize = 16f
                typeface = android.graphics.Typeface.DEFAULT_BOLD
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }

            // Tiny color circle indicator
            val colorIndicator = View(this).apply {
                layoutParams = LinearLayout.LayoutParams(
                    (16 * resources.displayMetrics.density + 0.5f).toInt(),
                    (16 * resources.displayMetrics.density + 0.5f).toInt()
                ).apply {
                    setMargins(0, 0, 12, 0)
                }
                background = android.graphics.drawable.GradientDrawable().apply {
                    shape = android.graphics.drawable.GradientDrawable.OVAL
                    setColor(try { Color.parseColor(colorHex) } catch (e: Exception) { Color.RED })
                }
            }

            val btnDelete = Button(this).apply {
                text = "X"
                setBackgroundColor(Color.parseColor("#CF6679"))
                setTextColor(Color.WHITE)
                layoutParams = LinearLayout.LayoutParams(
                    (36 * resources.displayMetrics.density + 0.5f).toInt(),
                    (32 * resources.displayMetrics.density + 0.5f).toInt()
                )
                textSize = 10f
                setPadding(0, 0, 0, 0)
                setOnClickListener {
                    deleteTeam(teamId)
                }
            }

            header.addView(tvTitle)
            header.addView(colorIndicator)
            header.addView(btnDelete)
            teamCard.addView(header)

            // Team properties
            val tvDetails = TextView(this).apply {
                text = "Target: ${target.toUpperCase()}"
                setTextColor(Color.parseColor("#06B6D4"))
                textSize = 12f
                typeface = android.graphics.Typeface.MONOSPACE
                setPadding(0, 0, 0, 8)
            }
            teamCard.addView(tvDetails)

            // Editable first-launch delay (used by this team's overlay button).
            val delayRow = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = android.view.Gravity.CENTER_VERTICAL
                setPadding(0, 0, 0, 12)
            }
            val delayLabel = TextView(this).apply {
                text = "First launch delay (s):  "
                setTextColor(Color.parseColor("#B0B0B0"))
                textSize = 12f
            }
            val etTeamDelay = EditText(this).apply {
                inputType = InputType.TYPE_CLASS_NUMBER
                setText(launchDelay.toString())
                setTextColor(Color.parseColor("#06B6D4"))
                textSize = 13f
                typeface = android.graphics.Typeface.MONOSPACE
                gravity = android.view.Gravity.CENTER
                layoutParams = LinearLayout.LayoutParams(
                    (60 * resources.displayMetrics.density + 0.5f).toInt(),
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
                addTextChangedListener(object : TextWatcher {
                    override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                    override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
                    override fun afterTextChanged(s: Editable?) {
                        updateTeamLaunchDelay(teamId, s.toString().toIntOrNull() ?: 10)
                    }
                })
            }
            delayRow.addView(delayLabel)
            delayRow.addView(etTeamDelay)
            teamCard.addView(delayRow)

            // Players assigned section header
            val tvPlayersHeader = TextView(this).apply {
                text = "PLAYERS IN TEAM:"
                setTextColor(Color.GRAY)
                textSize = 11f
                setPadding(0, 0, 0, 8)
            }
            teamCard.addView(tvPlayersHeader)

            // Players list UI
            val assignedIds = team.optJSONArray("assignedPlayers") ?: JSONArray()
            val playerOffsets = team.optJSONObject("playerOffsets") ?: JSONObject()

            val containerPlayers = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
            }

            for (p in 0 until assignedIds.length()) {
                val pId = assignedIds.getString(p)
                val pObj = allPlayers.find { it.optString("id") == pId } ?: continue
                val pName = pObj.optString("name")
                val mtField = getMarchTimeFieldName(target)
                val marchTime = pObj.optLong(mtField, 0L)

                val rowPlayer = LinearLayout(this).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = android.view.Gravity.CENTER_VERTICAL
                    setPadding(0, 0, 0, 8)
                }

                val tvPName = TextView(this).apply {
                    text = pName
                    setTextColor(Color.parseColor("#E0E0E0"))
                    textSize = 13f
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                }

                val tvPMarch = TextView(this).apply {
                    text = "M: ${marchTime}s"
                    setTextColor(Color.CYAN)
                    textSize = 11f
                    setPadding(0, 0, 8, 0)
                }

                val tvOffsetLabel = TextView(this).apply {
                    text = "Delay: +"
                    setTextColor(Color.GRAY)
                    textSize = 11f
                }

                val etOffset = EditText(this).apply {
                    inputType = InputType.TYPE_CLASS_NUMBER
                    gravity = android.view.Gravity.CENTER
                    setTextColor(Color.YELLOW)
                    textSize = 12f
                    typeface = android.graphics.Typeface.MONOSPACE
                    layoutParams = LinearLayout.LayoutParams(
                        (40 * resources.displayMetrics.density + 0.5f).toInt(),
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    )
                    val savedOffset = playerOffsets.optInt(pId, 0)
                    setText(savedOffset.toString())
                    
                    addTextChangedListener(object : TextWatcher {
                        override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                        override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                            val offVal = s.toString().toIntOrNull() ?: 0
                            updateTeamPlayerOffset(teamId, pId, offVal)
                        }
                        override fun afterTextChanged(s: Editable?) {}
                    })
                }

                val tvOffsetSuffix = TextView(this).apply {
                    text = "s"
                    setTextColor(Color.YELLOW)
                    textSize = 11f
                    setPadding(0, 0, 12, 0)
                }

                val btnRemove = Button(this).apply {
                    text = "Remove"
                    setBackgroundColor(Color.DKGRAY)
                    setTextColor(Color.WHITE)
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        (30 * resources.displayMetrics.density + 0.5f).toInt()
                    )
                    textSize = 9f
                    setPadding(8, 0, 8, 0)
                    setOnClickListener {
                        removePlayerFromTeam(teamId, pId)
                    }
                }

                rowPlayer.addView(tvPName)
                rowPlayer.addView(tvPMarch)
                rowPlayer.addView(tvOffsetLabel)
                rowPlayer.addView(etOffset)
                rowPlayer.addView(tvOffsetSuffix)
                rowPlayer.addView(btnRemove)
                containerPlayers.addView(rowPlayer)
            }

            if (assignedIds.length() == 0) {
                val tvNoPlayers = TextView(this).apply {
                    text = "No players assigned."
                    setTextColor(Color.parseColor("#555555"))
                    textSize = 12f
                    setPadding(0, 0, 0, 8)
                }
                containerPlayers.addView(tvNoPlayers)
            }
            teamCard.addView(containerPlayers)

            // Assign Player Dropdown Section
            val assignLayout = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = android.view.Gravity.CENTER_VERTICAL
                setPadding(0, 8, 0, 12)
            }

            val unassignedNames = mutableListOf<String>()
            val unassignedIds = mutableListOf<String>()
            unassignedNames.add("-- Select Player --")
            unassignedIds.add("")

            for (pObj in allPlayers) {
                val id = pObj.optString("id")
                // Check if already assigned
                var assigned = false
                for (x in 0 until assignedIds.length()) {
                    if (assignedIds.getString(x) == id) {
                        assigned = true
                        break
                    }
                }
                if (!assigned) {
                    unassignedNames.add(pObj.optString("name"))
                    unassignedIds.add(id)
                }
            }

            val spinnerAssign = Spinner(this).apply {
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                background = getDrawable(android.R.drawable.btn_dropdown)
            }
            val assignAdapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, unassignedNames)
            assignAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
            spinnerAssign.adapter = assignAdapter

            val btnAssign = Button(this).apply {
                text = "Assign"
                setBackgroundColor(Color.parseColor("#06B6D4"))
                setTextColor(Color.BLACK)
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    (36 * resources.displayMetrics.density + 0.5f).toInt()
                ).apply {
                    setMargins(8, 0, 0, 0)
                }
                textSize = 11f
                setPadding(12, 0, 12, 0)
                setOnClickListener {
                    val pos = spinnerAssign.selectedItemPosition
                    if (pos > 0) {
                        val pIdToAssign = unassignedIds[pos]
                        assignPlayerToTeam(teamId, pIdToAssign)
                    } else {
                        Toast.makeText(this@OfflineActivity, "Select a player first", Toast.LENGTH_SHORT).show()
                    }
                }
            }

            assignLayout.addView(spinnerAssign)
            assignLayout.addView(btnAssign)
            teamCard.addView(assignLayout)

            // Divider
            val div = View(this).apply {
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    1
                ).apply {
                    setMargins(0, 4, 0, 12)
                }
                setBackgroundColor(Color.parseColor("#33FFFFFF"))
            }
            teamCard.addView(div)

            // Landing Time Input & Calculated Output
            val tvPlannerTitle = TextView(this).apply {
                text = "Landing Time Calculator:"
                setTextColor(Color.WHITE)
                textSize = 13f
                typeface = android.graphics.Typeface.DEFAULT_BOLD
                setPadding(0, 0, 0, 8)
            }
            teamCard.addView(tvPlannerTitle)

            val inputLayout = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = android.view.Gravity.CENTER_VERTICAL
                setPadding(0, 0, 0, 12)
            }

            val etLandingInput = EditText(this).apply {
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.0f)
                inputType = InputType.TYPE_CLASS_PHONE
                keyListener = DigitsKeyListener.getInstance("0123456789:")
                setTextColor(Color.WHITE)
                textSize = 14f
                typeface = android.graphics.Typeface.MONOSPACE
                hint = "Landing Time (HH:mm:ss)"
                setText(landingTime)

                var isUpdating = false
                addTextChangedListener(object : TextWatcher {
                    override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                    override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
                    override fun afterTextChanged(s: Editable?) {
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
                        // Automatically update stored landing time on change
                        updateTeamLandingTime(teamId, s.toString())
                    }
                })
            }

            val tvCalculatedTimes = TextView(this).apply {
                setTextColor(Color.parseColor("#E0E0E0"))
                textSize = 12f
                typeface = android.graphics.Typeface.MONOSPACE
                setPadding(8, 0, 0, 12)
                visibility = View.GONE
            }

            val btnSetLanding = Button(this).apply {
                text = "Calculate"
                setBackgroundColor(Color.parseColor("#3700B3"))
                setTextColor(Color.WHITE)
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    (36 * resources.displayMetrics.density + 0.5f).toInt()
                ).apply {
                    setMargins(8, 0, 0, 0)
                }
                textSize = 11f
                setPadding(12, 0, 12, 0)
                setOnClickListener {
                    val lTime = etLandingInput.text.toString().trim()
                    if (lTime.length == 8) {
                        val report = performLaunchCalculations(team, allPlayers, lTime)
                        if (report != null) {
                            tvCalculatedTimes.text = report.launchListDisplay
                            tvCalculatedTimes.visibility = View.VISIBLE
                        } else {
                            Toast.makeText(this@OfflineActivity, "Enter a valid landing time (HH:mm:ss).", Toast.LENGTH_LONG).show()
                        }
                    } else {
                        Toast.makeText(this@OfflineActivity, "Enter HH:mm:ss format", Toast.LENGTH_SHORT).show()
                    }
                }
            }

            inputLayout.addView(etLandingInput)
            inputLayout.addView(btnSetLanding)
            teamCard.addView(inputLayout)
            teamCard.addView(tvCalculatedTimes)

            // Trigger click on Calculate initially if there is a saved landing time
            if (landingTime.length == 8) {
                val report = performLaunchCalculations(team, allPlayers, landingTime)
                if (report != null) {
                    tvCalculatedTimes.text = report.launchListDisplay
                    tvCalculatedTimes.visibility = View.VISIBLE
                }
            }

            // Copy Plan button
            val btnCopyPlan = Button(this).apply {
                text = "📋 Copy Plan"
                setBackgroundColor(Color.parseColor("#121212"))
                setTextColor(Color.parseColor("#06B6D4"))
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    (45 * resources.displayMetrics.density + 0.5f).toInt()
                )
                textSize = 12f
                typeface = android.graphics.Typeface.DEFAULT_BOLD
                setOnClickListener {
                    val lTime = etLandingInput.text.toString().trim()
                    if (lTime.length == 8) {
                        val report = performLaunchCalculations(team, allPlayers, lTime)
                        if (report != null) {
                            val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                            val clip = ClipData.newPlainText("SVS Plan", report.fullPlanText)
                            clipboard.setPrimaryClip(clip)
                            Toast.makeText(this@OfflineActivity, "Plan copied to clipboard!", Toast.LENGTH_SHORT).show()
                        } else {
                            Toast.makeText(this@OfflineActivity, "Enter a valid landing time (HH:mm:ss).", Toast.LENGTH_LONG).show()
                        }
                    } else {
                        Toast.makeText(this@OfflineActivity, "Please enter and calculate landing time first", Toast.LENGTH_SHORT).show()
                    }
                }
            }

            teamCard.addView(btnCopyPlan)
            llOfflineTeamsList.addView(teamCard)
        }
    }

    // ===================== Group Attack Planner =====================

    private fun defaultGroup(): JSONObject {
        val g = JSONObject()
        g.put("landingTime", "")
        g.put("castleOffset", 0)
        g.put("delay", 0)
        g.put("overlayEnabled", false)
        val sections = JSONObject()
        for ((id, _, _) in groupTargets) {
            sections.put(id, JSONObject().put("teamId", "").put("playerIds", JSONArray()).put("enabled", true))
        }
        g.put("sections", sections)
        return g
    }

    private fun getGroup(): JSONObject {
        val prefs = getSharedPreferences("CompanionAppPrefs", Context.MODE_PRIVATE)
        val str = prefs.getString("offlineGroup", null) ?: return defaultGroup()
        return try {
            val g = JSONObject(str)
            if (!g.has("sections")) defaultGroup() else g
        } catch (e: Exception) { defaultGroup() }
    }

    private fun saveGroup(g: JSONObject) {
        val prefs = getSharedPreferences("CompanionAppPrefs", Context.MODE_PRIVATE)
        prefs.edit().putString("offlineGroup", g.toString()).apply()
    }

    private fun groupSection(g: JSONObject, targetId: String): JSONObject {
        val sections = g.optJSONObject("sections") ?: JSONObject().also { g.put("sections", it) }
        var sec = sections.optJSONObject(targetId)
        if (sec == null) {
            sec = JSONObject().put("teamId", "").put("playerIds", JSONArray()).put("enabled", true)
            sections.put(targetId, sec)
        }
        return sec
    }

    // Effective player ids for a target = assigned team roster + any individual players.
    private fun groupSectionPlayerIds(g: JSONObject, targetId: String): List<String> {
        val sec = g.optJSONObject("sections")?.optJSONObject(targetId) ?: return emptyList()
        val ids = LinkedHashSet<String>()
        val teamId = sec.optString("teamId", "")
        if (teamId.isNotEmpty()) {
            val team = getStoredTeams().find { it.optString("id") == teamId }
            val assigned = team?.optJSONArray("assignedPlayers")
            if (assigned != null) for (i in 0 until assigned.length()) ids.add(assigned.getString(i))
        }
        val indiv = sec.optJSONArray("playerIds")
        if (indiv != null) for (i in 0 until indiv.length()) ids.add(indiv.getString(i))
        return ids.toList()
    }

    private fun sectionEnabled(g: JSONObject, targetId: String): Boolean =
        g.optJSONObject("sections")?.optJSONObject(targetId)?.optBoolean("enabled", true) ?: true

    // Every player already placed on any target — used to keep a player unique across targets.
    private fun allAssignedPlayerIds(g: JSONObject): Set<String> {
        val ids = HashSet<String>()
        for ((id, _, _) in groupTargets) ids.addAll(groupSectionPlayerIds(g, id))
        return ids
    }

    private fun setSectionEnabled(targetId: String, enabled: Boolean) {
        val g = getGroup()
        groupSection(g, targetId).put("enabled", enabled)
        saveGroup(g)
        updateGroupStatus()
        updateOverlay()
    }

    private fun removeGroupIndividual(targetId: String, playerId: String) {
        val g = getGroup()
        val sec = groupSection(g, targetId)
        val arr = sec.optJSONArray("playerIds") ?: JSONArray()
        val newArr = JSONArray()
        for (i in 0 until arr.length()) {
            val pid = arr.getString(i)
            if (pid != playerId) newArr.put(pid)
        }
        sec.put("playerIds", newArr)
        saveGroup(g)
        renderGroupPlanner()
        updateGroupStatus()
    }

    // Parse "HH:mm:ss" (UTC) to epoch ms (today, or tomorrow if more than 12h in the past).
    private fun groupLandingMs(timeStr: String): Long? {
        if (timeStr.length < 5) return null
        val sdf = SimpleDateFormat("HH:mm:ss", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        val parsed = try { sdf.parse(timeStr) } catch (e: Exception) { null } ?: return null
        val now = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
        val cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
        val p = Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply { time = parsed }
        cal.set(Calendar.HOUR_OF_DAY, p.get(Calendar.HOUR_OF_DAY))
        cal.set(Calendar.MINUTE, p.get(Calendar.MINUTE))
        cal.set(Calendar.SECOND, p.get(Calendar.SECOND))
        cal.set(Calendar.MILLISECOND, 0)
        if (cal.timeInMillis < now.timeInMillis - 12L * 60 * 60 * 1000) cal.add(Calendar.DAY_OF_YEAR, 1)
        return cal.timeInMillis
    }

    private fun playerMarchSec(playerId: String, mtField: String): Long {
        val p = getStoredPlayers().find { it.optString("id") == playerId } ?: return 0L
        return p.optLong(mtField, 0L)
    }

    private fun updateGroupStatus() {
        if (!::tvGroupStatus.isInitialized) return
        val g = getGroup()
        var assigned = 0
        var missing = 0
        for ((id, _, mtField) in groupTargets) {
            if (!sectionEnabled(g, id)) continue
            for (pid in groupSectionPlayerIds(g, id)) {
                assigned++
                if (playerMarchSec(pid, mtField) <= 0L) missing++
            }
        }
        tvGroupStatus.text = if (assigned == 0) "No forces assigned yet."
            else "$assigned assigned · ${assigned - missing} ready, $missing missing march (excluded from plan)"
    }

    // Earliest feasible landing = now + max(march + 300s) over all assigned players (+ 30s prep buffer).
    private fun suggestGroupLandingTime(): String? {
        val g = getGroup()
        var maxReq = 300L
        var any = false
        for ((id, _, mtField) in groupTargets) {
            if (!sectionEnabled(g, id)) continue
            for (pid in groupSectionPlayerIds(g, id)) {
                any = true
                val req = playerMarchSec(pid, mtField) + 300L
                if (req > maxReq) maxReq = req
            }
        }
        if (!any) return null
        val ms = System.currentTimeMillis() + (maxReq + 30L) * 1000L
        val sdf = SimpleDateFormat("HH:mm:ss", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        return sdf.format(Date(ms))
    }

    // Combined <=500-char plan across all targets. Players with no march time are skipped.
    private fun buildGroupPlan(): String? {
        val g = getGroup()
        val timeStr = g.optString("landingTime", "")
        val baseMs = groupLandingMs(timeStr) ?: return null
        val castleOffset = g.optInt("castleOffset", 0)
        val players = getStoredPlayers()
        val sdf = SimpleDateFormat("HH:mm:ss", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")

        fun nameOf(pid: String) = players.find { it.optString("id") == pid }?.optString("name") ?: "?"

        fun build(trunc: Int?): String {
            val sb = StringBuilder()
            sb.append("⚔️ GROUP: $timeStr UTC\n")
            for ((id, name, mtField) in groupTargets) {
                if (!sectionEnabled(g, id)) continue
                val ids = groupSectionPlayerIds(g, id)
                if (ids.isEmpty()) continue
                val targetMs = baseMs + (if (id == "castle") castleOffset * 1000L else 0L)
                var line = 0
                val body = StringBuilder()
                for (pid in ids) {
                    val march = playerMarchSec(pid, mtField)
                    if (march <= 0L) continue
                    line++
                    val launchMs = targetMs - march * 1000L - 300000L
                    var pName = nameOf(pid)
                    if (trunc != null && pName.length > trunc) pName = pName.substring(0, trunc) + ".."
                    body.append("$line $pName @ ${sdf.format(Date(launchMs))}\n")
                }
                if (line > 0) {
                    sb.append("🎯 ${name.uppercase()}:\n")
                    sb.append(body)
                }
            }
            return sb.toString().trimEnd()
        }

        var text = build(null)
        if (text.length > 500) text = build(10)
        if (text.length > 500) text = build(6)
        return text
    }

    private fun renderGroupPlanner() {
        if (!::llGroupSections.isInitialized) return
        llGroupSections.removeAllViews()
        val g = getGroup()
        val teams = getStoredTeams()
        val players = getStoredPlayers()
        val globallyAssigned = allAssignedPlayerIds(g)

        for ((id, name, mtField) in groupTargets) {
            val sec = groupSection(g, id)
            val enabled = sec.optBoolean("enabled", true)
            val indivArr = sec.optJSONArray("playerIds") ?: JSONArray()
            val indivIds = (0 until indivArr.length()).map { indivArr.getString(it) }
            val assignedIds = groupSectionPlayerIds(g, id)

            val card = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setBackgroundColor(Color.parseColor("#171717"))
                setPadding(20, 16, 20, 16)
                alpha = if (enabled) 1f else 0.45f
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { setMargins(0, 0, 0, 16) }
            }

            // Header: include checkbox + name + count
            val headerRow = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = android.view.Gravity.CENTER_VERTICAL
                setPadding(0, 0, 0, 8)
            }
            val cbInclude = CheckBox(this).apply {
                isChecked = enabled
                buttonTintList = android.content.res.ColorStateList.valueOf(Color.parseColor("#EAB308"))
                setOnCheckedChangeListener { _, checked -> setSectionEnabled(id, checked); renderGroupPlanner() }
            }
            val headerText = TextView(this).apply {
                text = "${name.uppercase()}  ·  ${assignedIds.size} assigned"
                setTextColor(Color.parseColor("#EAB308"))
                textSize = 13f
                typeface = android.graphics.Typeface.DEFAULT_BOLD
            }
            headerRow.addView(cbInclude)
            headerRow.addView(headerText)
            card.addView(headerRow)

            // Team spinner
            val teamNames = mutableListOf("— No team —")
            val teamIds = mutableListOf("")
            for (t in teams) { teamNames.add(t.optString("name")); teamIds.add(t.optString("id")) }
            val teamSpinner = Spinner(this).apply {
                background = getDrawable(android.R.drawable.btn_dropdown)
                adapter = ArrayAdapter(this@OfflineActivity, android.R.layout.simple_spinner_item, teamNames).also {
                    it.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
                }
                val cur = teamIds.indexOf(sec.optString("teamId", ""))
                if (cur >= 0) setSelection(cur)
            }
            teamSpinner.onItemSelectedListener = object : android.widget.AdapterView.OnItemSelectedListener {
                override fun onItemSelected(parent: android.widget.AdapterView<*>?, view: View?, position: Int, rowId: Long) {
                    val current = getGroup().optJSONObject("sections")?.optJSONObject(id)?.optString("teamId", "") ?: ""
                    val picked = teamIds.getOrElse(position) { "" }
                    if (picked == current) return
                    val g2 = getGroup(); groupSection(g2, id).put("teamId", picked); saveGroup(g2)
                    renderGroupPlanner(); updateGroupStatus()
                }
                override fun onNothingSelected(parent: android.widget.AdapterView<*>?) {}
            }
            card.addView(teamSpinner)

            // Assigned players: team players are read-only; individual extras get a remove (✕).
            if (assignedIds.isEmpty()) {
                card.addView(TextView(this).apply {
                    text = "No players."
                    setTextColor(Color.parseColor("#666666"))
                    textSize = 12f
                    setPadding(0, 6, 0, 0)
                })
            } else {
                for (pid in assignedIds) {
                    val p = players.find { it.optString("id") == pid } ?: continue
                    val isIndividual = indivIds.contains(pid)
                    val march = p.optLong(mtField, 0L)
                    val row = LinearLayout(this).apply {
                        orientation = LinearLayout.HORIZONTAL
                        gravity = android.view.Gravity.CENTER_VERTICAL
                        setPadding(0, 6, 0, 0)
                    }
                    val nameTv = TextView(this).apply {
                        val src = if (isIndividual) "" else "  ·team"
                        text = if (march > 0L) "• ${p.optString("name")} (${march}s)$src"
                            else "• ${p.optString("name")}  ⚠ no march$src"
                        setTextColor(if (march > 0L) Color.parseColor("#B0B0B0") else Color.parseColor("#CF6679"))
                        textSize = 12f
                        layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                    }
                    row.addView(nameTv)
                    if (isIndividual) {
                        val btnX = Button(this).apply {
                            text = "✕"
                            setBackgroundColor(Color.parseColor("#3A1A1A"))
                            setTextColor(Color.parseColor("#CF6679"))
                            textSize = 10f
                            setPadding(0, 0, 0, 0)
                            layoutParams = LinearLayout.LayoutParams(
                                (30 * resources.displayMetrics.density + 0.5f).toInt(),
                                (30 * resources.displayMetrics.density + 0.5f).toInt()
                            )
                            setOnClickListener { removeGroupIndividual(id, pid) }
                        }
                        row.addView(btnX)
                    }
                    card.addView(row)
                }
            }

            // Add individual player spinner — excludes anyone already placed on ANY target.
            val addNames = mutableListOf("+ Add extra player")
            val addIds = mutableListOf("")
            for (p in players) {
                val pid = p.optString("id")
                if (!globallyAssigned.contains(pid)) { addNames.add(p.optString("name")); addIds.add(pid) }
            }
            val addSpinner = Spinner(this).apply {
                background = getDrawable(android.R.drawable.btn_dropdown)
                adapter = ArrayAdapter(this@OfflineActivity, android.R.layout.simple_spinner_item, addNames).also {
                    it.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
                }
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { setMargins(0, 10, 0, 0) }
            }
            addSpinner.onItemSelectedListener = object : android.widget.AdapterView.OnItemSelectedListener {
                override fun onItemSelected(parent: android.widget.AdapterView<*>?, view: View?, position: Int, rowId: Long) {
                    if (position <= 0) return
                    val g2 = getGroup()
                    val s = groupSection(g2, id)
                    val arr = s.optJSONArray("playerIds") ?: JSONArray().also { s.put("playerIds", it) }
                    arr.put(addIds.getOrElse(position) { "" })
                    saveGroup(g2)
                    renderGroupPlanner()
                    updateGroupStatus()
                }
                override fun onNothingSelected(parent: android.widget.AdapterView<*>?) {}
            }
            card.addView(addSpinner)

            llGroupSections.addView(card)
        }
    }

    private fun getMarchTimeFieldName(target: String): String {
        return when {
            target.contains("castle", ignoreCase = true) -> "mtCastle"
            target.contains("north", ignoreCase = true) -> "mtNorth"
            target.contains("east", ignoreCase = true) -> "mtEast"
            target.contains("south", ignoreCase = true) -> "mtSouth"
            target.contains("west", ignoreCase = true) -> "mtWest"
            else -> "mtCastle"
        }
    }

    data class LaunchReport(val launchListDisplay: String, val fullPlanText: String)

    private fun performLaunchCalculations(team: JSONObject, allPlayers: List<JSONObject>, landingTimeStr: String): LaunchReport? {
        val target = team.optString("target", "Castle")
        val assignedIds = team.optJSONArray("assignedPlayers") ?: JSONArray()
        val playerOffsets = team.optJSONObject("playerOffsets") ?: JSONObject()

        if (assignedIds.length() == 0) {
            return LaunchReport("No players in team to calculate.", "No players in team to calculate.")
        }

        // Parse HH:mm:ss into Date
        val sdf = SimpleDateFormat("HH:mm:ss", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        val parsedTime = try { sdf.parse(landingTimeStr) } catch (e: Exception) { null } ?: return null

        val now = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
        val targetTime = Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply {
            val pCal = Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply { time = parsedTime }
            set(Calendar.HOUR_OF_DAY, pCal.get(Calendar.HOUR_OF_DAY))
            set(Calendar.MINUTE, pCal.get(Calendar.MINUTE))
            set(Calendar.SECOND, pCal.get(Calendar.SECOND))
            set(Calendar.MILLISECOND, 0)
        }

        // If time is in the past today, assume tomorrow
        if (targetTime.timeInMillis < now.timeInMillis - 600000L) {
            targetTime.add(Calendar.DAY_OF_YEAR, 1)
        }

        val mtField = getMarchTimeFieldName(target)
        val playersDataList = mutableListOf<LaunchPlayerDetails>()

        for (i in 0 until assignedIds.length()) {
            val pId = assignedIds.getString(i)
            val pObj = allPlayers.find { it.optString("id") == pId } ?: continue
            val marchSec = pObj.optLong(mtField, 0L)
            val offsetSec = playerOffsets.optInt(pId, 0)

            playersDataList.add(LaunchPlayerDetails(
                id = pId,
                name = pObj.optString("name"),
                marchSec = marchSec,
                offsetSec = offsetSec
            ))
        }

        // Calculate and format launch times
        val displayBuilder = StringBuilder()
        val planBuilder = StringBuilder()

        planBuilder.append("⚔️ SVS PLAN: ${team.optString("name").toUpperCase()} ⚔️\n")
        planBuilder.append("🎯 Target: ${target.toUpperCase()} | Hit: $landingTimeStr UTC\n")

        // Sort by offset to match execution sequence
        playersDataList.sortBy { it.offsetSec }

        val missingNames = mutableListOf<String>()
        var lineNo = 0
        for (player in playersDataList) {
            // Never broadcast a launch we can't compute — skip players with no march time set.
            if (player.marchSec <= 0L) { missingNames.add(player.name); continue }
            lineNo++
            // Launch time = Landing Time + playerOffset - marchTime - rallyTime (300s)
            val launchTimeMs = targetTime.timeInMillis + (player.offsetSec * 1000L) - (player.marchSec * 1000L) - 300000L
            val launchStr = sdf.format(Date(launchTimeMs))
            displayBuilder.append("$lineNo. [${player.name}] => Launch: $launchStr UTC\n")
            planBuilder.append("$lineNo. [${player.name}] => LAUNCH: $launchStr UTC (M: ${player.marchSec}s | D: +${player.offsetSec}s)\n")
        }
        // Flag anyone excluded so the commander fixes it (kept out of the clipboard plan).
        if (missingNames.isNotEmpty()) {
            displayBuilder.append("\n⚠ No march time: ${missingNames.joinToString(", ")}")
        }

        return LaunchReport(displayBuilder.toString(), planBuilder.toString())
    }

    private data class LaunchPlayerDetails(
        val id: String,
        val name: String,
        val marchSec: Long,
        val offsetSec: Int
    )
}
