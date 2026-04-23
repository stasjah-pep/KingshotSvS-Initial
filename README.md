# SvS Command Hub

A real-time "Command Hub" web application for mobile strategy games, featuring an isometric deployment map, live chat, and rally timers.

## 🚀 Features

*   **Real-time Dashboard:** Isometric 45-degree grid map synced via WebSockets.
*   **Role-Based Access:** Superadmin, Admin, and User roles.
*   **Live Chat:** Real-time messaging for coordination.
*   **Rally Timers:** Server-synced countdowns for precision attacks.
*   **Admin Tools:** User and Player management (mock data backed).

## 🛠️ Tech Stack

*   **Frontend:** Next.js 15, Tailwind CSS 4, Zustand (State Management).
*   **Backend:** Node.js, Express, Socket.io.
*   **Database:** SQLite (managed via Prisma).
*   **Tools:** Concurrently (to run both servers).

## 📂 Project Structure

```
/
├── client/                 # Next.js Frontend
│   ├── app/                # App Router Pages (Login, Admin, Dashboard)
│   ├── components/         # UI Components (GridMap, TopBar, etc.)
│   └── store/              # Zustand Store & Socket Client
├── prisma/                 # Database Schema
├── server.js               # Node.js/Socket.io Backend (Mock Data Logic)
├── package.json            # Root scripts
└── dev.db                  # SQLite Database File
```

## ⚙️ Prerequisites

*   Node.js (v18 or higher)
*   npm

## 📦 Installation

1.  **Install Dependencies:**
    Run the following command in the root directory. It will install root dependencies and then automatically install client dependencies.
    ```bash
    npm install
    ```

2.  **Setup Database:**
    Initialize the SQLite database.
    ```bash
    npm run db:push
    ```

## ▶️ How to Run

Start both the backend server and the frontend client with a single command:

```bash
npm run dev
```

*   **Frontend:** `http://localhost:3000`
*   **Backend:** `http://localhost:3001`

## 🔑 Default Credentials

### Superadmin (Bypasses OTP)
*   **Username:** `admin`
*   **Password:** `admin123`

### Admin (Requires OTP)
*   **Username:** `cmdr_x`
*   **Password:** `password`
*   **OTP:** `1234` (Mock)

### User (Requires OTP)
*   **Username:** `user_1`
*   **Password:** (Any other password triggers user role in mock logic)
*   **OTP:** `1234`

## 🛡️ Admin Features

*   **User Management:** Block/Unblock users, Generate OTPs.
*   **Player Management:** Import players via CSV, view roster.
*   **Map Control:** Commanders can drag-and-drop players and start rallies.
*   **Chat Control:** Left-click on any message in the chat panel to select it, then use the buttons in the chat header to access moderation tools:
    - Block misbehaving users from chatting (`BLOCK USR`).
    - Global "Silence Chat" toggle (`SILENCE` / `SILENCED`).
    - Mark critical messages (`IMP. MSG`) or specific user accounts (`IMP. USR`) as "Important" (highlights their text).
*   **Slash Commands:** Admins and Commanders can type commands directly into the chat:
    - `/help`: Lists available commands.
    - `/alert <message>`: Sends a non-blocking global alert toast notification and ticker update.
    - `/silence`: Toggles global chat silence.
    - `/clear`: Clears the chat history.
    - `/block <username>`: Toggles a user's block status.
    - `/importantuser <username>`: Toggles highlighting for a user's future messages.
    - `/importantmsg <id>`: Toggles highlighting for a specific message by its ID.

## 🕒 Time Settings

All timers, chat messages, and landing times on the map use strict UTC+0. When setting up landing times via the TopBar, use the format `hh:mm:ss`. This guarantees precision synchronization between all players globally, irrespective of their local timezone.

## 📱 Mobile Companion App (Android)
A React Native (Expo) companion app is included in the `android_app/` directory. It supports pushing rally launch notifications to team members and features a configurable dashboard for quick "Launch Rally" actions.

**Note on Android System Overlays:** The current implementation of the companion app uses a standard "Dashboard" view intended to be run in split-screen or Picture-in-Picture alongside the game on a mobile device. Implementing a true "System Overlay" (Draw Over Other Apps / Floating Bubble) requires ejecting from standard Expo Go, utilizing custom native modules (like `react-native-floating-bubble`), and requesting the `SYSTEM_ALERT_WINDOW` Android permission.
