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
import androidx.core.app.NotificationCompat
import com.companionapp.R

class FloatingOverlayService : Service() {

    private val commandReceiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == "com.companionapp.ACTION_TOGGLE_OVERLAY") {
                overlayView?.let {
                    it.visibility = if (it.visibility == View.VISIBLE) View.GONE else View.VISIBLE
                }
            }
        }
    }


    private var windowManager: WindowManager? = null
    private var overlayView: View? = null
    private val handler = android.os.Handler(android.os.Looper.getMainLooper())
    private val refreshRunnable = object : Runnable {
        override fun run() {
            updateCountdownTexts()
            handler.postDelayed(this, 1000)
        }
    }

    companion object {
        var buttonConfigs: List<HashMap<String, String>> = ArrayList()

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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(commandReceiver, android.content.IntentFilter("com.companionapp.ACTION_TOGGLE_OVERLAY"), Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(commandReceiver, android.content.IntentFilter("com.companionapp.ACTION_TOGGLE_OVERLAY"))
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
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        populateButtons()
        return super.onStartCommand(intent, flags, startId)
    }

    private fun populateButtons() {
        val container = overlayView?.findViewById<LinearLayout>(R.id.buttonsContainer)
        container?.removeAllViews()

        val scale = resources.displayMetrics.density
        val buttonSize = (52 * scale + 0.5f).toInt() // 52dp (Shrunk 30%)

        for (btnMap in buttonConfigs) {
            val button = Button(this)
            button.tag = btnMap // Store the map for the refresh loop
            
            val target = btnMap["target"] ?: "Unknown"
            val customMarchTimeMs = btnMap["customMarchTimeMs"] ?: "300000"
            val colorStr = btnMap["color"] ?: "RED"
            val isBlinking = btnMap["isBlinking"]?.toBoolean() ?: false
            val action = btnMap["action"] ?: "start"
            val activeRallyId = btnMap["activeRallyId"] ?: ""
            val initiatorId = btnMap["initiatorId"] ?: ""

            updateButtonText(button, btnMap)
            button.textSize = 10f
            button.setPadding(0,0,0,0)
            button.setTextColor(Color.WHITE)

            // Round button with custom color
            val shape = GradientDrawable()
            shape.shape = GradientDrawable.OVAL
            shape.setColor(try { Color.parseColor(colorStr) } catch(e: Exception) { Color.RED })
            button.background = shape

            if (isBlinking) {
                val anim = AlphaAnimation(1.0f, 0.0f)
                anim.duration = 300
                anim.repeatMode = Animation.REVERSE
                anim.repeatCount = Animation.INFINITE
                button.startAnimation(anim)
            }

            val layoutParams = LinearLayout.LayoutParams(buttonSize, buttonSize)
            layoutParams.setMargins(0, 0, 0, 10)
            button.layoutParams = layoutParams

            button.setOnClickListener {
                sendEventToReact(action, target, customMarchTimeMs.toLong(), activeRallyId, initiatorId)
            }
            container?.addView(button)
        }
    }

    private fun updateCountdownTexts() {
        val container = overlayView?.findViewById<LinearLayout>(R.id.buttonsContainer) ?: return
        for (i in 0 until container.childCount) {
            val v = container.getChildAt(i)
            if (v is Button) {
                val btnMap = v.tag as? HashMap<String, String>
                if (btnMap != null) {
                    updateButtonText(v, btnMap)
                }
            }
        }
    }

    private fun updateButtonText(button: Button, btnMap: HashMap<String, String>) {
        val target = btnMap["target"] ?: "Unknown"
        val customMarchTimeMs = btnMap["customMarchTimeMs"] ?: "300000"
        val shortTarget = if (target.length > 5) target.substring(0, 5) else target
        
        val utcTimeString = btnMap["utcTime"] ?: "" // Format: "HH:mm:ss UTC"
        
        if (utcTimeString.isNotEmpty() && utcTimeString != "null") {
            try {
                val timeOnly = utcTimeString.split(" ")[0] // Get "HH:mm:ss"
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
                    
                    var diffMs = targetTime.timeInMillis - now.timeInMillis
                    
                    // Logic to handle if the target time is "tomorrow" (if it's less than 2 hours ago, maybe it's done, otherwise it's in the future)
                    if (diffMs < -7200000) { 
                        targetTime.add(java.util.Calendar.DAY_OF_YEAR, 1)
                        diffMs = targetTime.timeInMillis - now.timeInMillis
                    }

                    if (diffMs < -600000) { 
                         button.text = "$shortTarget\nDONE"
                    } else if (diffMs <= 0) {
                         button.text = "$shortTarget\nNOW!"
                    } else {
                        val diffSec = diffMs / 1000
                        button.text = "$shortTarget\n${String.format(java.util.Locale.US, "%03d", diffSec)}s"
                    }
                }
            } catch (e: Exception) {
                button.text = "$shortTarget\nERR"
            }
        } else {
            val timeSec = customMarchTimeMs.toLong() / 1000
            button.text = "$shortTarget\n${timeSec}s"
        }
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


    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(refreshRunnable)
        try { unregisterReceiver(commandReceiver) } catch (e: Exception) {}
        if (overlayView != null) {
            windowManager?.removeView(overlayView)
        }
    }
}
