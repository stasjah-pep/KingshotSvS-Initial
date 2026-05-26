# ⚔️ SvS Command Hub

A state-of-the-art, real-time cyber-military **Command Hub** web application and native Android companion app designed for high-precision coordination in strategy games (State-vs-State). Features a dynamic isometric grid battlefield, live tactical countdown schedules, real-time WebSocket synchronization, role-based cockpit controls, and a floating overlay threat service.

---

## 🚀 Key Features

### 💻 Web Cockpit Terminal
*   **Real-time Isometric Map:** High-performance, 45-degree tactical battlefield grid synchronized instantly via WebSockets across all clients.
*   **Fully Resizable & Collapsible Side Panels:** Smooth, drag-resizeable layout with glassmorphic, micro-animated sidebar toggles to maximize battlefield map space.
*   **Tactical Cockpit HUD:** Floating minimizable player stats panel tracking current active target status, custom march delay settings, and real-time UTC launch timers.
*   **Guaranteed Under 500-Char "Copy Plan":** Compact launch scheduling tool inside Allied team cards that auto-truncates and compresses plan details to guarantee launch scripts always fit in standard 500-character external chat rooms (e.g., game chat, Discord).
*   **Live Chat & Moderation Cockpit:** Real-time messaging console with administrative controls (silencing chat globally, pinning important messages, blocking disruptive accounts).
*   **Role-Based Security & OTP Flow:** Role-locked capabilities (`SUPERADMIN`, `ADMIN`, `COMMANDER`, `USER`). Clean OTP flow (required only once post-login) with real-time UI state toggle between Login and Logout.

### 📱 Native Android Companion App (`android_app/`)
*   **Floating System Overlay (Draw Over Apps):** Translucent overlay panel that floats on top of your main game screen, displaying live timers and action buttons.
*   **Live Active Threat Blinking Indicators:** Real-time visual feedback and blazingly fast countdown tickers (`ENEM [diff]s` blinking in red, `ALLY [diff]s` blinking in green) rendered on floating buttons.
*   **Target Selector Dropdown:** Integrated Material Spinner replacing manual text fields for selecting predefined buildings (Castle, North Turret, East Turret, South Turret, West Turret).
*   **Bi-directional March Sync:** Instant, conflict-free synchronization of player march times between the web portal and Android app, using a "last modified is the truth" resolution strategy.
*   **Dynamic Landing Time Keypad Formatter:** Launches a numeric keypad and automatically formats inputs to `HH:MM:SS` (e.g., typing `224312` automatically formats to `22:43:12`).
*   **Double-Rally Prevention:** Dual-layered backend and app validation blocking duplicate active rallies for the same player, showing feedback via Toasts.
*   **Role-Locked Team Hub:** Dedicated commander interface permitting administrative creation of teams, allocations of unassigned players, unassignments, and team deletions.

---

## 🛠️ Advanced Tech Stack & Dependency Audit

The codebase is fully upgraded and hardened to prevent any distribution issues. Both the `client` and `root` environments are validated with **0 security vulnerabilities**!

*   **Frontend Web:** Next.js `16.2.6` (React `19.0.0`, Turbopack compilation), Tailwind CSS `v4`, Zustand.
*   **Vulnerability Hardening:** Added PostCSS `^8.5.10` dependency `overrides` inside [client/package.json](client/package.json) to eliminate all nested security vulnerabilities.
*   **Backend Server:** Node.js, Express `^5.2.1` (Next-gen Express API), Socket.io `^4.8.1`, Dotenv, Cors.
*   **Database Engine:** SQLite database managed cleanly through Prisma Client `v6.19.3` (preventing Prisma 7's breaking datasource URL removal, making it native SQLite-ready).
*   **Android App:** Native Kotlin, Android SDK 34, Material components.

---

## 📂 Project Directory Structure

```
/
├── android_app/            # Native Kotlin Android Companion Application
│   ├── app/src/main/       # Layouts, Floating Overlay Service, Dashboard Activity
│   └── gradlew.bat         # Gradle compilation wrapper
├── client/                 # Next.js 16 Client Portal
│   ├── app/                # App Router Layouts & Pages (Dashboard, Admin, Login, OTP)
│   ├── components/         # Glassmorphic Sidebars, Tactical HUD, Isometric Map Grid
│   └── store/              # Zustand Reactive State Store & Socket Client Connections
├── prisma/                 # SQLite Database Schemas
│   └── schema.prisma       # Database relations for Accounts, Players, Teams, and Layouts
├── server.js               # Express 5 / Socket.io real-time active battle server
├── package.json            # Root configuration scripts
└── hub_database.db         # Persistent SQLite database file
```

---

## ⚙️ Setup & Installation

### Prerequisites
*   Node.js (v20+ recommended)
*   npm (v10+)
*   Android Studio (for companion app building)

### 1. Web Portal & Server Setup

From the root directory, install all required dependencies (this automatically triggers the post-install setup for the Next.js `client` directory):
```bash
npm install
```

Generate the Prisma client and sync your SQLite database schemas:
```bash
npm run db:push
```

### 2. Running the System Locally

Start both the backend websocket server and the Next.js Turbopack dev portal concurrently with a single command:
```bash
npm run dev
```

*   **Tactical Dashboard Web Portal:** `http://localhost:3000`
*   **Real-time WebSocket server:** `http://localhost:3001`

---

## 🔑 Security & Accounts Directory

The battle coordinator has several configured test account roles:

| Username | Password | Role | OTP Requirement |
| :--- | :--- | :--- | :--- |
| `admin` | `admin123` | `SUPERADMIN` | Bypassed (instant access) |
| `cmdr_x` | `password` | `ADMIN` (Commander) | Requires OTP once (`1234`) |
| `user_1` | `password` | `USER` (Reinforcer) | Requires OTP once (`1234`) |

---

## 🧭 Administrative Chat Console

Admins and Commanders can type instant slash commands inside the chat panel:

*   `/help` - Lists all available operations.
*   `/alert <message>` - Dispatches a global scrolling ticker update and red banner alert.
*   `/silence` - Suspends/Restores standard user chat permissions globally.
*   `/clear` - Wipes active chat logs.
*   `/block <username>` - Blocks/Unblocks an account.
*   `/importantuser <username>` - Highlights all future messages from this account.
*   `/importantmsg <id>` - Highlights a specific past chat log by ID.

---

## 🕒 Global Synchronized Time System

All battlefield coordinates, sequential march plans, map countdowns, and timers use strict **UTC+0** (Coordinated Universal Time). Landing times are entered in `HH:MM:SS` (e.g. `23:45:00`). This ensures millisecond-precision hit orders for players launching from different continents.
