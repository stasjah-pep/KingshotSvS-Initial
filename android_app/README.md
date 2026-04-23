# SvS Command Hub - Android Companion App

This is the official native Android companion application for the SvS Command Hub. It allows users to quickly launch in-game rallies using customizable quick-action buttons natively drawn over other applications.

---

## 📱 User Guide

### How to Use the App

1. **Login:** Open the app and log in using your SvS Command Hub credentials (username and password).
2. **Dashboard Overview:** Once logged in, you will see your main configuration screen to manage the floating overlay buttons.
3. **Configuring Quick Action Buttons:**
   - Under **"In-Game Overlay Config"**, enter the name of the target (e.g., `Castle`, `North_Turret`).
   - Enter the duration of the march time in seconds (e.g., `300`).
   - Press **"Add Button"**. Your custom button will immediately appear in the floating overlay.
4. **Launching a Rally:**
   - The app runs a native overlay that draws floating buttons on top of your screen.
   - Simply tap your configured **"LAUNCH [Target]"** button over your game.
   - The app will instantly inform the server via WebSockets, updating the web dashboard.
5. **Managing Buttons:** Press the gray **"X"** next to any button in the app dashboard to delete it.

### Troubleshooting (User)

* **Cannot Login:** Ensure you have created an account on the main website first and that your server URL is correct.
* **Overlay not appearing:** Ensure you have granted the "Display over other apps" permission when prompted.

---

## 💻 Developer Guide

### Prerequisites

* Java Development Kit (JDK) 17
* Android Studio (Ladybug or newer recommended)
* Android SDK (API 34)

### Local Installation & Setup

This is a pure Native Android project built with Kotlin and Gradle. There are no Node.js, npm, React Native, or Metro Bundler dependencies.

1. Open **Android Studio**.
2. Select **File > Open...** and select the `android_app` directory.
3. Let Gradle sync and resolve the dependencies (OkHttp, Socket.IO).

### Connecting to the Local Backend

By default, Android Emulators cannot resolve `localhost` directly to the host machine's server. They use a special loopback IP.

* The app login screen has a configurable **Server URL** input field that defaults to `http://10.0.2.2:3001` (for Android Emulators).
* **If you are testing on a Physical Device on the same Wi-Fi network:** Change this input field on the login screen to your computer's local IP address (e.g., `http://192.168.1.100:3001`). This setting is saved across sessions.

### Building and Running

You can build and run the application directly from Android Studio by pressing the **Run** (Play) button, or via the command line:

```bash
cd android_app
./gradlew assembleDebug
```

The resulting APK will be located in `app/build/outputs/apk/debug/`.

### Architecture Notes

* **Language:** 100% Kotlin / Android SDK.
* **State & Storage:** The app uses standard Android `SharedPreferences` to persist the session token, player ID, server URL, and custom button configurations.
* **Networking:** Uses `OkHttp3` for REST API calls (login) and `socket.io-client-java` to emit events like `rally:start` directly to the backend.
* **System Overlays:** A true Android "Draw Over Other Apps" overlay is implemented natively in `FloatingOverlayService.kt`. It communicates with the main Activity using standard Android `BroadcastReceiver` intents.

---

## 🔌 API & Socket Specifications

The companion app is completely driven by a REST endpoint for authentication and a Socket.io WebSocket connection for real-time synchronization.

### REST Dependencies

* `POST /api/login`
  * **Requires:** JSON `{ "username": "...", "password": "..." }`
  * **Expects:** JSON `{ "success": true, "token": "...", "user": { "playerId": "..." } }`
  * *Note:* The app stores `token` and `playerId` in Android `SharedPreferences`.

### WebSocket Connectivity

The native Android app uses `io.socket:socket.io-client-java` v2.1.0.
* **Auth:** Connects via `IO.Options().apply { auth = mapOf("token" to sessionToken) }`.
* **Flow:** Emits `admin:get_teams` strictly *after* the `Socket.EVENT_CONNECT` listener fires.

#### Incoming Events (Server -> App)

The app listens for the following WebSocket events:

**1. `init_state`**
The primary payload parsed when the dashboard loads.
* **Expects:**
  ```json
  {
    "teams": [ { "id": "t1", "name": "Team A", "isEnemy": true, "selectedTarget": "castle", "landingTime": "10:00:00", "players": [ { "id": "p1", "mtCastle": 10 } ] } ],
    "rallies": [ { "id": "r1", "target": "castle", "initiatorId": "p1" } ]
  }
  ```

**2. `admin:teams_data`**
Updates the local memory list of teams, driving the enemy team selector dropdown and the UTC landing time calculations.
* **Expects:** `{ "teams": [...] }` (Array structure identical to `init_state`).

**3. `rally:update`**
Updates the local memory list of active rallies, which immediately drives the blinking states of the native Android Floating Overlay buttons.
* **Expects:** `{ "rallies": [...] }`

#### Outgoing Events (App -> Server)

**1. `admin:get_teams`**
Emitted instantly upon socket connection to force the server to broadcast the latest `teams_data`.

**2. `rally:start`**
Emitted when a user taps a "Start" button in the dashboard or native overlay.
* **Payload:**
  ```json
  {
    "initiatorId": "player_uuid",
    "target": "castle",
    "duration": 300000,
    "customMarchTimeMs": 150000
  }
  ```

**3. `rally:cancel`**
Emitted when a user taps a blinking active rally button in the dashboard or native overlay.
* **Payload:** `{ "rallyId": "active_rally_uuid" }`
