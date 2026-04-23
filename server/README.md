# Server API & WebSocket Documentation

The SvS Command Hub backend is an Express/Node.js server paired with Socket.io. It handles real-time map data, team management, chat, and rallies.

---

## REST API Endpoints

### 1. `POST /api/login`
Authenticates a user and returns a session token.
- **Request Body:**
  ```json
  {
    "username": "admin",
    "password": "password123"
  }
  ```
- **Response (Success):**
  ```json
  {
    "success": true,
    "token": "uuid-string",
    "user": { "id": "...", "username": "admin", "role": "ADMIN", "playerId": "..." }
  }
  ```
- **Response (Error / Change Password):**
  ```json
  { "success": false, "message": "Invalid credentials" }
  // OR
  { "success": false, "code": "CHANGE_PASSWORD_REQUIRED", "userId": "..." }
  ```

### 2. `POST /api/push-token`
Registers an Expo push token to the user's account for receiving notifications.
- **Request Body:**
  ```json
  {
    "sessionToken": "uuid-string",
    "expoPushToken": "ExponentPushToken[...]"
  }
  ```
- **Response:**
  ```json
  { "success": true }
  ```

### 3. `POST /api/change-password`
Forces a password reset if `mustChangePassword` is flagged.
- **Request Body:**
  ```json
  {
    "username": "admin",
    "oldPassword": "old",
    "newPassword": "new"
  }
  ```
- **Response:**
  ```json
  { "success": true, "message": "Password changed successfully" }
  ```

---

## Socket.io Events

The Socket.io connection is secured using `io.use` middleware. The client must pass `{ auth: { token: "..." } }` during handshake, OR authenticate post-connection via `auth:verify_otp`.

### Client -> Server (Emitted Events)

#### Authentication & User
* `auth:change_password` - `{ userId, newPassword }`
* `auth:verify_otp` - `{ otp }`
* `user:claim_player` - `{ playerId }`
* `player:update_march_times` - `{ playerId, mtCastle, mtNorth, mtEast, mtSouth, mtWest, customMarchTimes (Object) }`

#### Map & Gameplay
* `map:move` - `{ playerId, x, y }`
* `map:remove` - `{ playerId }`
* `rally:start` - `{ initiatorId, target, duration (ms), customMarchTimeMs (optional) }`
* `rally:cancel` - `{ rallyId }`
* `landing:create` - `{ x, y, time, assignedTo, type }` *(Note: `type` represents the building target string)*
* `landing:cancel` - `{ landingId }`

#### Chat
* `chat:message` - `{ message }` *(Supports slash commands like `/help`, `/alert`, `/silence`)*
* `chat:clear` - `{}`

#### Administration
* `admin:get_teams` - `{}`
* `admin:create_team` - `{ name, color, isEnemy }`
* `admin:delete_team` - `{ teamId }`
* `admin:assign_player_to_team` - `{ playerId, teamId }`
* `admin:add_player` - `{ name, power, allianceId, role, mtCastle, mtNorth, mtEast, mtSouth, mtWest }`
* `admin:delete_player` - `{ playerId }`
* `admin:verify_player` - `{ playerId }`
* `admin:toggle_player_mute` - `{ playerId }`
* `admin:import_players` - `{ players (Array) }`
* `admin:get_users` - `{}`
* `admin:add_user` - `{ username, password, role }`
* `admin:delete_user` - `{ userId }`
* `admin:generate_otp` - `{ userId }`
* `admin:toggle_block` - `{ userId }`
* `admin:update_password` - `{ userId, newPassword }`
* `admin:alert` - `{ message }`
* `admin:toggle_chat_silence` - `{}`
* `admin:mark_message_important` - `{ messageId }`
* `admin:toggle_important_account` - `{ accountId }`
* `admin:get_maps` - `{}`
* `admin:save_map` - `{ name, size, renderElements }`
* `admin:set_active_map` - `{ id }`
* `admin:delete_map` - `{ id }`

---

### Server -> Client (Received Events)

Upon successful connection, the server immediately emits:
* `init_state` - The massive initial synchronization payload.
  ```json
  {
    "players": [...],
    "teams": [
      {
         "id": "...",
         "name": "Alpha",
         "isEnemy": false,
         "players": [...],
         "selectedTarget": "castle", // Injected based on active landings
         "landingTime": "10:00:00"    // Injected based on active landings
      }
    ],
    "chat": [...],
    "rallies": [...],
    "landings": [...],
    "serverTime": 1700000000000,
    "chatSilenced": false,
    "importantAccounts": [...],
    "activeMap": { "id": "...", "size": 40, "renderElements": [...] }
  }
  ```

#### Standard Updates
* `map:update` - `{ players: [...] }`
* `teams_data` or `admin:teams_data` - `{ teams: [...] }`
* `rally:update` - `{ rallies: [...] }`
* `landing:update` - `{ landings: [...] }`
* `chat:update` - `{ logs: [...] }`
* `admin:users_data` - `{ users: [...] }`
* `admin:maps_data` - `{ maps: [...] }`
* `map_layout:update` - `{ activeMap: Object }`
* `notification` - `{ message: "..." }`
* `notification:alert` - `{ message: "..." }`
* `error` - `{ message: "..." }`
