package com.companionapp.overlay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.IBinder
import android.view.Gravity
import android.view.LayoutInflater
import android.view.animation.AlphaAnimation
import android.view.animation.Animation
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import com.companionapp.R

class FloatingOverlayService : Service() {

    private val commandReceiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == "com.companionapp.ACTION_TOGGLE_OVERLAY") {
                overlayView?.let {
                    it.visibility = if (it.visibility == View.VISIBLE) View.GONE else View.VISIBLE
                }
            } else if (intent?.action == "com.companionapp.ACTION_OVERLAY_CLICK") {
                val action = intent.getStringExtra("action")
                if (action == "offline_team_click") {
                    val teamName = intent.getStringExtra("target") ?: ""
                    handleOfflineTeamClick(teamName)
                } else if (action == "offline_group_click") {
                    handleOfflineGroupClick()
                }
            }
        }
    }


    private var windowManager: WindowManager? = null
    private var overlayView: View? = null
    private var overlayMinimized = false
    private val handler = android.os.Handler(android.os.Looper.getMainLooper())
    private val refreshRunnable = object : Runnable {
        override fun run() {
            updateCountdownTexts()
            handler.postDelayed(this, 1000)
        }
    }

    companion object {
        var buttonConfigs: List<HashMap<String, String>> = ArrayList()

        // Offset = deviceClock - serverClock. Applied to every countdown so the overlay stays
        // aligned with the web app and other phones instead of drifting with the local clock.
        var serverTimeOffset: Long = 0L

        // Final window (seconds) where a countdown escalates: grows + reddens.
        const val ESCALATE_SEC = 15L

        fun updateButtons(buttons: List<HashMap<String, String>>) {
            buttonConfigs = buttons
        }
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    override fun onCreate() {
        super.onCreate()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channelId = "floating_overlay_channel"
            val channel = NotificationChannel(
                channelId,
                "Floating Overlay Service",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)

            val notification: Notification = NotificationCompat.Builder(this, channelId)
                .setContentTitle("SvS Command Hub")
                .setContentText("Overlay is running")
                .setSmallIcon(android.R.drawable.ic_menu_compass)
                .build()

            startForeground(1, notification)
        }

        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val inflater = getSystemService(Context.LAYOUT_INFLATER_SERVICE) as LayoutInflater
        overlayView = inflater.inflate(R.layout.floating_overlay, null)

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        )

        params.gravity = Gravity.TOP or Gravity.START
        params.x = 0
        params.y = 100

        windowManager?.addView(overlayView, params)
        handler.post(refreshRunnable)
        val filter = android.content.IntentFilter().apply {
            addAction("com.companionapp.ACTION_TOGGLE_OVERLAY")
            addAction("com.companionapp.ACTION_OVERLAY_CLICK")
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(commandReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(commandReceiver, filter)
        }

        val dragHandle = overlayView?.findViewById<View>(R.id.dragHandle)
        dragHandle?.setOnTouchListener(object : View.OnTouchListener {
            private var initialX: Int = 0
            private var initialY: Int = 0
            private var initialTouchX: Float = 0f
            private var initialTouchY: Float = 0f

            override fun onTouch(v: View?, event: MotionEvent?): Boolean {
                when (event?.action) {
                    MotionEvent.ACTION_DOWN -> {
                        initialX = params.x
                        initialY = params.y
                        initialTouchX = event.rawX
                        initialTouchY = event.rawY
                        return true
                    }
                    MotionEvent.ACTION_MOVE -> {
                        params.x = initialX + (event.rawX - initialTouchX).toInt()
                        params.y = initialY + (event.rawY - initialTouchY).toInt()
                        windowManager?.updateViewLayout(overlayView, params)
                        return true
                    }
                }
                return false
            }
        })

        overlayView?.findViewById<Button>(R.id.btnClose)?.setOnClickListener {
            stopSelf()
        }

        // Minimize / enlarge: collapse the pills to a small strip (drag + controls stay).
        val minimizeContainer = overlayView?.findViewById<LinearLayout>(R.id.buttonsContainer)
        val btnMinimize = overlayView?.findViewById<Button>(R.id.btnMinimize)
        btnMinimize?.setOnClickListener {
            overlayMinimized = !overlayMinimized
            minimizeContainer?.visibility = if (overlayMinimized) View.GONE else View.VISIBLE
            btnMinimize.text = if (overlayMinimized) "▢" else "▁"
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        populateButtons()
        return super.onStartCommand(intent, flags, startId)
    }

    private fun populateButtons() {
        val container = overlayView?.findViewById<LinearLayout>(R.id.buttonsContainer) ?: return
        container.removeAllViews()

        val inflater = LayoutInflater.from(this)
        for (btnMap in buttonConfigs) {
            val item = inflater.inflate(R.layout.overlay_target, container, false)
            item.tag = btnMap // Store the map for the refresh loop

            // Remember the team's chosen colour for the resting accent.
            val baseColor = try { Color.parseColor(btnMap["color"] ?: "#34C6D9") } catch (e: Exception) { Color.parseColor("#34C6D9") }
            btnMap["baseColorInt"] = baseColor.toString()

            updateItem(item, btnMap) // sets label, countdown, bar, colour and pulse for the current state

            val action = btnMap["action"] ?: "start"
            val target = btnMap["target"] ?: "Unknown"
            val customMarchTimeMs = btnMap["customMarchTimeMs"] ?: "300000"
            val activeRallyId = btnMap["activeRallyId"] ?: ""
            val initiatorId = btnMap["initiatorId"] ?: ""
            item.setOnClickListener {
                sendEventToReact(action, target, customMarchTimeMs.toLong(), activeRallyId, initiatorId)
            }
            container.addView(item)
        }
    }

    private fun updateCountdownTexts() {
        val container = overlayView?.findViewById<LinearLayout>(R.id.buttonsContainer) ?: return
        for (i in 0 until container.childCount) {
            val v = container.getChildAt(i)
            @Suppress("UNCHECKED_CAST")
            val btnMap = v.tag as? HashMap<String, String> ?: continue
            updateItem(v, btnMap)
        }
    }

    private fun updateItem(root: View, btnMap: HashMap<String, String>) {
        val tvLabel = root.findViewById<TextView>(R.id.tvLabel)
        val tvCount = root.findViewById<TextView>(R.id.tvCount)
        val barTrack = root.findViewById<View>(R.id.barTrack)
        val barFill = root.findViewById<View>(R.id.barFill)
        val barGap = root.findViewById<View>(R.id.barGap)

        val target = btnMap["target"] ?: "Unknown"
        val shortTarget = (if (target.length > 7) target.substring(0, 7) else target).uppercase()

        // Offline group button: static "tap to copy the whole group plan".
        if (btnMap["action"] == "offline_group_click") {
            tvLabel.text = "GROUP"
            tvCount.text = "COPY"
            barTrack.visibility = View.GONE
            applyItemStyle(root, tvLabel, tvCount, barFill, btnMap, null)
            return
        }

        // Offline team button: static "tap to copy" label, no live countdown / escalation.
        if (btnMap["action"] == "offline_team_click") {
            val teamTarget = btnMap["teamTarget"] ?: "Castle"
            val abbr = when {
                teamTarget.contains("castle", ignoreCase = true) -> "CSTL"
                teamTarget.contains("north", ignoreCase = true) -> "NRTH"
                teamTarget.contains("east", ignoreCase = true) -> "EAST"
                teamTarget.contains("south", ignoreCase = true) -> "SOUT"
                teamTarget.contains("west", ignoreCase = true) -> "WEST"
                else -> "TGT"
            }
            tvLabel.text = shortTarget
            tvCount.text = abbr
            barTrack.visibility = View.GONE
            applyItemStyle(root, tvLabel, tvCount, barFill, btnMap, null)
            return
        }

        // Server-synchronised "now": deviceClock - offset (offset = deviceClock - serverClock).
        val nowMs = System.currentTimeMillis() - serverTimeOffset
        val isEnemy = btnMap["isEnemy"]?.toBoolean() ?: false
        var remainingSec: Long? = null
        var countText = "--"

        // 1) Active rally in progress -> count down to its end.
        val rallyEndTimeStr = btnMap["rallyEndTime"] ?: ""
        if (rallyEndTimeStr.isNotEmpty() && rallyEndTimeStr != "null") {
            try {
                val diffMs = rallyEndTimeStr.toLong() - nowMs
                if (diffMs > 0) {
                    remainingSec = diffMs / 1000
                    countText = fmtCountdown(remainingSec!!)
                }
            } catch (e: Exception) {}
        }

        // 2) Scheduled UTC landing/launch time -> count down to it.
        if (remainingSec == null && countText == "--") {
            val utc = btnMap["utcTime"] ?: "" // Format: "HH:mm:ss UTC"
            if (utc.isNotEmpty() && utc != "null") {
                try {
                    val timeOnly = utc.split(" ")[0]
                    val sdf = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US)
                    sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")
                    val parsed = sdf.parse(timeOnly)
                    if (parsed != null) {
                        val calParsed = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC"))
                        calParsed.time = parsed
                        val targetTime = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC"))
                        targetTime.timeInMillis = nowMs
                        targetTime.set(java.util.Calendar.HOUR_OF_DAY, calParsed.get(java.util.Calendar.HOUR_OF_DAY))
                        targetTime.set(java.util.Calendar.MINUTE, calParsed.get(java.util.Calendar.MINUTE))
                        targetTime.set(java.util.Calendar.SECOND, calParsed.get(java.util.Calendar.SECOND))
                        targetTime.set(java.util.Calendar.MILLISECOND, 0)
                        var diffMs = targetTime.timeInMillis - nowMs
                        // If the time already passed >2h ago, assume it's for the next day.
                        if (diffMs < -7200000) {
                            targetTime.add(java.util.Calendar.DAY_OF_YEAR, 1)
                            diffMs = targetTime.timeInMillis - nowMs
                        }
                        when {
                            diffMs < -600000 -> { countText = "DONE"; remainingSec = null }
                            diffMs <= 0 -> { countText = "NOW"; remainingSec = 0 }
                            else -> { remainingSec = diffMs / 1000; countText = fmtCountdown(remainingSec!!) }
                        }
                    }
                } catch (e: Exception) { countText = "ERR" }
            } else {
                val timeSec = (btnMap["customMarchTimeMs"] ?: "300000").toLong() / 1000
                countText = "${timeSec}s"
            }
        }

        tvLabel.text = if (isEnemy) "$shortTarget · ENEM" else shortTarget
        tvCount.text = countText

        // Progress bar drains over the final 5 minutes; hidden when there's no live countdown.
        if (remainingSec != null) {
            barTrack.visibility = View.VISIBLE
            val frac = (remainingSec!!.toFloat() / 300f).coerceIn(0f, 1f)
            (barFill.layoutParams as LinearLayout.LayoutParams).weight = frac
            (barGap.layoutParams as LinearLayout.LayoutParams).weight = 1f - frac
            barFill.requestLayout()
            barGap.requestLayout()
        } else {
            barTrack.visibility = View.GONE
        }

        applyItemStyle(root, tvLabel, tvCount, barFill, btnMap, remainingSec)
    }

    private fun fmtCountdown(sec: Long): String =
        String.format(java.util.Locale.US, "%d:%02d", sec / 60, sec % 60)

    /**
     * Footprint-first styling: a dark translucent pill with a team-coloured accent (label under-
     * line, big number, progress bar) at rest, growing and reddening in the final [ESCALATE_SEC]
     * seconds and turning green at launch. Pulse only in that final window.
     */
    private fun applyItemStyle(
        root: View,
        tvLabel: TextView,
        tvCount: TextView,
        barFill: View,
        btnMap: HashMap<String, String>,
        remainingSec: Long?
    ) {
        val scale = resources.displayMetrics.density
        val base = btnMap["baseColorInt"]?.toIntOrNull()
            ?: (try { Color.parseColor(btnMap["color"] ?: "#34C6D9") } catch (e: Exception) { Color.parseColor("#34C6D9") })

        var accent = base
        var panel = Color.parseColor("#E60F1417")   // dark translucent
        var big = 22f
        var escalate = false
        when {
            remainingSec != null && remainingSec <= 0L -> {                 // launch
                accent = Color.parseColor("#46BF77"); panel = Color.parseColor("#E6102417"); big = 24f; escalate = true
            }
            remainingSec != null && remainingSec in 1..ESCALATE_SEC -> {    // final 15 seconds
                accent = Color.parseColor("#E5484D"); panel = Color.parseColor("#E62A1216"); big = 26f; escalate = true
            }
            btnMap["action"] == "offline_team_click" || btnMap["action"] == "offline_group_click" -> big = 19f // static copy pill
        }

        val gd = GradientDrawable()
        gd.shape = GradientDrawable.RECTANGLE
        gd.cornerRadius = 14f * scale
        gd.setColor(panel)
        gd.setStroke((1.5f * scale).toInt(), accent)
        root.background = gd

        tvCount.setTextColor(accent)
        tvCount.textSize = big
        tvLabel.setTextColor(Color.parseColor("#9AACAA"))
        barFill.setBackgroundColor(accent)

        if (escalate) startPulse(root) else stopPulse(root)
    }

    private fun startPulse(view: View) {
        if (view.animation == null) {
            val anim = AlphaAnimation(1.0f, 0.55f)
            anim.duration = 600
            anim.repeatMode = Animation.REVERSE
            anim.repeatCount = Animation.INFINITE
            view.startAnimation(anim)
        }
    }

    private fun stopPulse(view: View) {
        if (view.animation != null) view.clearAnimation()
    }


    private fun sendEventToReact(action: String, target: String, customMarchTimeMs: Long, activeRallyId: String, initiatorId: String) {
        val intent = Intent("com.companionapp.ACTION_OVERLAY_CLICK")
        intent.setPackage(packageName)
        intent.putExtra("action", action)
        intent.putExtra("target", target)
        intent.putExtra("customMarchTimeMs", customMarchTimeMs)
        intent.putExtra("activeRallyId", activeRallyId)
        intent.putExtra("initiatorId", initiatorId)
        sendBroadcast(intent)
    }

    private fun handleOfflineGroupClick() {
        val prefs = getSharedPreferences("CompanionAppPrefs", Context.MODE_PRIVATE)
        val groupStr = prefs.getString("offlineGroup", null) ?: return
        val teamsStr = prefs.getString("offlineTeams", "[]") ?: "[]"
        val playersStr = prefs.getString("offlinePlayers", "[]") ?: "[]"
        try {
            val group = org.json.JSONObject(groupStr)
            val sections = group.optJSONObject("sections") ?: return
            val delaySec = group.optInt("delay", 0)
            val castleOffset = group.optInt("castleOffset", 0)

            val playersArr = org.json.JSONArray(playersStr)
            val playersMap = HashMap<String, org.json.JSONObject>()
            for (i in 0 until playersArr.length()) {
                val p = playersArr.getJSONObject(i); playersMap[p.optString("id")] = p
            }
            val teamsArr = org.json.JSONArray(teamsStr)
            val teamsMap = HashMap<String, org.json.JSONObject>()
            for (i in 0 until teamsArr.length()) {
                val t = teamsArr.getJSONObject(i); teamsMap[t.optString("id")] = t
            }

            val targets = listOf(
                Triple("castle", "Castle", "mtCastle"),
                Triple("north", "North Turret", "mtNorth"),
                Triple("east", "East Turret", "mtEast"),
                Triple("south", "South Turret", "mtSouth"),
                Triple("west", "West Turret", "mtWest")
            )

            fun sectionPlayerIds(targetId: String): List<String> {
                val sec = sections.optJSONObject(targetId) ?: return emptyList()
                if (!sec.optBoolean("enabled", true)) return emptyList() // excluded targets are skipped
                val ids = LinkedHashSet<String>()
                val teamId = sec.optString("teamId", "")
                if (teamId.isNotEmpty()) {
                    val assigned = teamsMap[teamId]?.optJSONArray("assignedPlayers")
                    if (assigned != null) for (i in 0 until assigned.length()) ids.add(assigned.getString(i))
                }
                val indiv = sec.optJSONArray("playerIds")
                if (indiv != null) for (i in 0 until indiv.length()) ids.add(indiv.getString(i))
                return ids.toList()
            }

            // Earliest feasible landing = now + max(march + 300s) over all assigned players.
            var maxReq = 300L
            var any = false
            for ((id, _, mtField) in targets) {
                for (pid in sectionPlayerIds(id)) {
                    val p = playersMap[pid] ?: continue
                    any = true
                    val req = p.optLong(mtField, 0L) + 300L
                    if (req > maxReq) maxReq = req
                }
            }
            if (!any) {
                android.widget.Toast.makeText(this, "Group has no assigned players.", android.widget.Toast.LENGTH_SHORT).show()
                return
            }

            val baseMs = System.currentTimeMillis() + (maxReq + delaySec) * 1000L
            val sdf = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US)
            sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")

            val sb = StringBuilder()
            sb.append("⚔️ GROUP: ${sdf.format(java.util.Date(baseMs))} UTC\n")
            for ((id, name, mtField) in targets) {
                val ids = sectionPlayerIds(id)
                if (ids.isEmpty()) continue
                val targetMs = baseMs + (if (id == "castle") castleOffset * 1000L else 0L)
                var line = 0
                val body = StringBuilder()
                for (pid in ids) {
                    val p = playersMap[pid] ?: continue
                    val march = p.optLong(mtField, 0L)
                    if (march <= 0L) continue // skip players with no march time
                    line++
                    val launchMs = targetMs - march * 1000L - 300000L
                    body.append("$line ${p.optString("name")} @ ${sdf.format(java.util.Date(launchMs))}\n")
                }
                if (line > 0) {
                    sb.append("🎯 ${name.uppercase()}:\n")
                    sb.append(body)
                }
            }

            val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
            clipboard.setPrimaryClip(android.content.ClipData.newPlainText("SVS Group Plan", sb.toString().trimEnd()))
            android.widget.Toast.makeText(this, "Group plan copied to clipboard!", android.widget.Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            e.printStackTrace()
            android.widget.Toast.makeText(this, "Group plan error: ${e.message}", android.widget.Toast.LENGTH_LONG).show()
        }
    }

    private fun handleOfflineTeamClick(teamName: String) {
        val prefs = getSharedPreferences("CompanionAppPrefs", Context.MODE_PRIVATE)
        val teamsStr = prefs.getString("offlineTeams", "[]") ?: "[]"
        val playersStr = prefs.getString("offlinePlayers", "[]") ?: "[]"

        try {
            val teamsArr = org.json.JSONArray(teamsStr)
            var targetTeam: org.json.JSONObject? = null
            for (i in 0 until teamsArr.length()) {
                val t = teamsArr.getJSONObject(i)
                if (t.optString("name") == teamName) {
                    targetTeam = t
                    break
                }
            }

            if (targetTeam == null) return

            val playersArr = org.json.JSONArray(playersStr)
            val allPlayersMap = mutableMapOf<String, org.json.JSONObject>()
            for (i in 0 until playersArr.length()) {
                val p = playersArr.getJSONObject(i)
                allPlayersMap[p.optString("id")] = p
            }

            val target = targetTeam.optString("target", "Castle")
            val launchDelay = targetTeam.optInt("launchDelay", 10)
            val assignedIds = targetTeam.optJSONArray("assignedPlayers") ?: org.json.JSONArray()
            val playerOffsets = targetTeam.optJSONObject("playerOffsets") ?: org.json.JSONObject()

            if (assignedIds.length() == 0) {
                android.widget.Toast.makeText(this, "No players in team '$teamName'", android.widget.Toast.LENGTH_SHORT).show()
                return
            }

            val mtField = when {
                target.contains("castle", ignoreCase = true) -> "mtCastle"
                target.contains("north", ignoreCase = true) -> "mtNorth"
                target.contains("east", ignoreCase = true) -> "mtEast"
                target.contains("south", ignoreCase = true) -> "mtSouth"
                target.contains("west", ignoreCase = true) -> "mtWest"
                else -> "mtCastle"
            }

            class OfflinePlayer(val id: String, val name: String, val marchSec: Long, val offsetSec: Int)
            val teamPlayers = mutableListOf<OfflinePlayer>()

            for (i in 0 until assignedIds.length()) {
                val pId = assignedIds.getString(i)
                val pObj = allPlayersMap[pId] ?: continue
                val marchSec = pObj.optLong(mtField, 0L)
                val offsetSec = playerOffsets.optInt(pId, 0)
                teamPlayers.add(OfflinePlayer(pId, pObj.optString("name"), marchSec, offsetSec))
            }

            if (teamPlayers.isEmpty()) return

            val firstPlayer = teamPlayers.maxByOrNull { it.marchSec - it.offsetSec } ?: teamPlayers[0]

            val nowMs = System.currentTimeMillis()
            val firstLaunchTimeMs = nowMs + (launchDelay * 1000L)
            val firstLandTimeMs = firstLaunchTimeMs + 300000L + (firstPlayer.marchSec * 1000L)
            val teamLandingTimeMs = firstLandTimeMs - (firstPlayer.offsetSec * 1000L)

            val sdf = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US)
            sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")

            val planBuilder = StringBuilder()
            planBuilder.append("⚔️ SVS PLAN: ${teamName.toUpperCase()} ⚔️\n")
            planBuilder.append("🎯 Target: ${target.toUpperCase()} | Hit: ${sdf.format(java.util.Date(teamLandingTimeMs))} UTC\n")

            teamPlayers.sortBy { it.offsetSec }

            for ((idx, player) in teamPlayers.withIndex()) {
                val pLaunchMs = teamLandingTimeMs + (player.offsetSec * 1000L) - (player.marchSec * 1000L) - 300000L
                val pLaunchStr = sdf.format(java.util.Date(pLaunchMs))
                planBuilder.append("${idx + 1}. [${player.name}] => LAUNCH: $pLaunchStr UTC (M: ${player.marchSec}s | D: +${player.offsetSec}s)\n")
            }

            val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
            val clip = android.content.ClipData.newPlainText("SVS Plan", planBuilder.toString())
            clipboard.setPrimaryClip(clip)

            android.widget.Toast.makeText(this, "Plan for '$teamName' copied to clipboard!", android.widget.Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            e.printStackTrace()
            android.widget.Toast.makeText(this, "Calculation error: ${e.message}", android.widget.Toast.LENGTH_LONG).show()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(refreshRunnable)
        try { unregisterReceiver(commandReceiver) } catch (e: Exception) {}
        if (overlayView != null) {
            windowManager?.removeView(overlayView)
        }
    }
}
