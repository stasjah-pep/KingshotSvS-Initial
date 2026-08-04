require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const prisma = require('./server/db');


function getTeamsWithLandings(teams, landings) {
    return teams.map(team => {
        const teamLanding = landings.find(l => l.assignedTo === team.name);
        return {
            ...team,
            selectedTarget: teamLanding ? teamLanding.type : "",
            landingTime: teamLanding ? teamLanding.time : "",
            rallyTime: teamLanding ? (teamLanding.rallyTime || 300) : 300,
            playerOffsets: teamLanding ? (teamLanding.playerOffsets || {}) : {}
        };
    });
}

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// --- Mock Data ---

const ALLIANCES = [
  { id: 'ally', name: 'Crimson Legion', tag: 'CRL' },
  { id: 'enemy', name: 'Azure Vanguard', tag: 'AZV' }
];

const ROLES = {
  COMMANDER: 'COMMANDER',
  RALLY_LEADER: 'RALLY_LEADER',
  CASTLE_TEAM: 'CASTLE_TEAM',
  TURRET_TEAM: 'TURRET_TEAM',
  REINFORCER: 'REINFORCER',
  HITMAN: 'HITMAN'
};

// Initial Players
let PLAYERS = [
  { id: 'p1', name: 'Commander X', allianceId: 'ally', role: ROLES.COMMANDER, power: 150000000, x: null, y: null, status: 'IDLE', avatar: 'https://i.pravatar.cc/150?u=p1', accountId: null },
  { id: 'p2', name: 'Rally Lead A', allianceId: 'ally', role: ROLES.RALLY_LEADER, power: 120000000, x: null, y: null, status: 'IDLE', avatar: 'https://i.pravatar.cc/150?u=p2', accountId: null },
  { id: 'p3', name: 'Castle Guard 1', allianceId: 'ally', role: ROLES.CASTLE_TEAM, power: 90000000, x: null, y: null, status: 'IDLE', avatar: 'https://i.pravatar.cc/150?u=p3', accountId: null },
  { id: 'p4', name: 'Turret Def 1', allianceId: 'ally', role: ROLES.TURRET_TEAM, power: 85000000, x: null, y: null, status: 'IDLE', avatar: 'https://i.pravatar.cc/150?u=p4', accountId: null },
  { id: 'e1', name: 'Enemy Cmdr', allianceId: 'enemy', role: ROLES.COMMANDER, power: 160000000, x: 15, y: 15, status: 'IDLE', avatar: 'https://i.pravatar.cc/150?u=e1', accountId: null },
  { id: 'e2', name: 'Enemy Rally', allianceId: 'enemy', role: ROLES.RALLY_LEADER, power: 130000000, x: 18, y: 18, status: 'RALLYING', avatar: 'https://i.pravatar.cc/150?u=e2', accountId: null }
];

let CHAT_LOGS = [
  { id: 1, sender: 'System', message: 'Welcome to the Command Hub.', timestamp: Date.now(), role: 'SYSTEM' },
  { id: 2, sender: 'Commander X', message: 'Prepare for the castle battle!', timestamp: Date.now(), role: 'COMMANDER' }
];

let RALLIES = [
  // { id, initiatorId, target, startTime, duration, endTime }
];

let LANDINGS = [
  // { id, x, y, time, assignedTo, creatorId }
];

let USERS = [
  { id: '1', username: 'admin', password: 'admin123', role: 'SUPERADMIN', isBlocked: false, otp: null, isVerified: true },
  { id: '2', username: 'cmdr_x', password: 'password', role: 'ADMIN', isBlocked: false, otp: null, isVerified: true },
  { id: '3', username: 'user_1', password: 'password', role: 'USER', isBlocked: true, otp: null, isVerified: false },
];

let CHAT_SILENCED = false;
let IMPORTANT_ACCOUNTS = new Set();
let ACTIVE_MAP = null;

// --- Presence (in-memory, ephemeral) ---
const ONLINE_COUNTS = new Map(); // accountId -> active socket count (web + app)
const AWAY_ACCOUNTS = new Set();  // accountId -> self-set "away" while connected

function getPresenceMap() {
  // { accountId: 'online' | 'away' } for connected accounts; absent = offline.
  const map = {};
  for (const [accountId, count] of ONLINE_COUNTS.entries()) {
    if (count > 0) map[accountId] = AWAY_ACCOUNTS.has(accountId) ? 'away' : 'online';
  }
  return map;
}

function broadcastPresence() {
  io.emit('presence:update', { presence: getPresenceMap() });
}
let ALL_MAPS = [];

const GRID_SIZE = 40; // 40x40 grid

// --- Database Seeding ---

async function seedDatabase() {
    try {
        const userCount = await prisma.account.count();
        if (userCount === 0) {
            console.log('Seeding Users...');
            for (const user of USERS) {
                await prisma.account.create({
                    data: {
                        id: user.id,
                        username: user.username,
                        password: user.password,
                        role: user.role,
                        isBlocked: user.isBlocked,
                        isVerified: user.isVerified
                    }
                });
            }
        } else {
             // Sync in-memory USERS with DB users if DB exists but USERS array is hardcoded (useful for transition)
             const dbUsers = await prisma.account.findMany();
             USERS = dbUsers;
        }

        const allianceCount = await prisma.alliance.count();
        if (allianceCount === 0) {
            console.log('Seeding Alliances...');
            for (const alliance of ALLIANCES) {
                await prisma.alliance.create({
                    data: {
                        id: alliance.id,
                        name: alliance.name,
                        tag: alliance.tag
                    }
                });
            }
        }

        const playerCount = await prisma.player.count();
        if (playerCount === 0) {
            console.log('Seeding Players...');
            for (const player of PLAYERS) {
                // Ensure alliance exists before creating player (though we just seeded them)
                const playerAlliance = player.allianceId ? await prisma.alliance.findUnique({ where: { id: player.allianceId } }) : null;

                await prisma.player.create({
                    data: {
                        id: player.id,
                        name: player.name,
                        allianceId: playerAlliance ? player.allianceId : undefined,
                        role: player.role,
                        power: player.power,
                        x: player.x,
                        y: player.y,
                        status: player.status,
                        avatar: player.avatar,
                        accountId: player.accountId
                    }
                });
            }
        } else {
             const dbPlayers = await prisma.player.findMany();
             PLAYERS = dbPlayers;
        }

        // Clean up stuck statuses on boot
        await prisma.player.updateMany({
            where: {
                OR: [
                    { status: 'RALLYING' },
                    { status: 'MARCHING' }
                ]
            },
            data: { status: 'IDLE' }
        });

        // Load Maps
        const mapCount = await prisma.mapLayout.count();
        if (mapCount === 0) {
            console.log('Seeding Default Map...');
            const defaultMap = await prisma.mapLayout.create({
                data: {
                    name: 'Default 40x40 Map',
                    isActive: true,
                    isDefault: true,
                    size: 40,
                    elements: JSON.stringify([
                        { id: 'castle_1', name: 'Castle', type: 'castle', x: 20, y: 20, width: 4, height: 4, color: '#6b21a8' },
                        { id: 'north_1', name: 'North Turret', type: 'north_turret', x: 15, y: 15, width: 2, height: 2, color: '#7f1d1d' },
                        { id: 'south_1', name: 'South Turret', type: 'south_turret', x: 25, y: 25, width: 2, height: 2, color: '#7f1d1d' },
                        { id: 'east_1', name: 'East Turret', type: 'east_turret', x: 25, y: 15, width: 2, height: 2, color: '#7f1d1d' },
                        { id: 'west_1', name: 'West Turret', type: 'west_turret', x: 15, y: 25, width: 2, height: 2, color: '#7f1d1d' }
                    ]),
                    blockZones: JSON.stringify([])
                }
            });
            ACTIVE_MAP = defaultMap;
            ALL_MAPS = [defaultMap];
        } else {
            ALL_MAPS = await prisma.mapLayout.findMany();
            ACTIVE_MAP = ALL_MAPS.find(m => m.isActive) || ALL_MAPS[0];

            // Ensure backwards compat if a user ran schema before this update
            const defaultMapFound = ALL_MAPS.find(m => m.name === 'Default 40x40 Map');
            if (defaultMapFound && !defaultMapFound.isDefault) {
                await prisma.mapLayout.update({ where: { id: defaultMapFound.id }, data: { isDefault: true }});
                defaultMapFound.isDefault = true;
            }

            if (!ACTIVE_MAP.isActive) {
                 ACTIVE_MAP = await prisma.mapLayout.update({ where: { id: ACTIVE_MAP.id }, data: { isActive: true }});
                 const mapIndex = ALL_MAPS.findIndex(m => m.id === ACTIVE_MAP.id);
                 if (mapIndex !== -1) ALL_MAPS[mapIndex] = ACTIVE_MAP;
            }
        }

        console.log('Database synced.');
    } catch (e) {
        console.error('Seeding error:', e);
    }
}

// --- Helper Functions ---

function isRestricted(x, y) {
  if (!ACTIVE_MAP) return false;

  // Check block zones
  const blockZones = JSON.parse(ACTIVE_MAP.blockZones || '[]');
  if (blockZones.some(pos => pos.x === x && pos.y === y)) return true;

  // Check elements (buildings)
  const elements = JSON.parse(ACTIVE_MAP.elements || '[]');
  for (const el of elements) {
    if (x >= el.x && x < el.x + el.width && y >= el.y && y < el.y + el.height) {
      return true;
    }
  }

  return false;
}

function checkCollision(playerId, x, y) {
  const mapSize = ACTIVE_MAP ? ACTIVE_MAP.size : GRID_SIZE;
  // Check boundaries
  if (x < 0 || y < 0 || x + 2 > mapSize || y + 2 > mapSize) return true; // 2x2 player size

  // Check restricted zones for all 4 cells of the player
  if (isRestricted(x, y) || isRestricted(x+1, y) || isRestricted(x, y+1) || isRestricted(x+1, y+1)) return true;

  // Check overlap with other players
  for (const p of PLAYERS) {
    if (p.id === playerId) continue; // Skip self
    if (p.x === null || p.y === null) continue; // Skip undeployed

    // Simple AABB collision for 2x2 squares
    // Player P is at (p.x, p.y) to (p.x+2, p.y+2)
    // New Position is (x, y) to (x+2, y+2)

    if (x < p.x + 2 && x + 2 > p.x && y < p.y + 2 && y + 2 > p.y) {
      return true; // Overlap
    }
  }
  return false;
}

// --- Socket Handlers ---

io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        return next(new Error("Authentication required"));
    }

    try {
        const user = await prisma.account.findUnique({ where: { sessionToken: token } });
        if (user) {
            socket.data.user = { id: user.id, role: user.role, username: user.username };
            next();
        } else {
            next(new Error("Invalid session"));
        }
    } catch(e) {
        next(new Error("Authentication error"));
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await prisma.account.findUnique({
            where: { username }
        });

        if (user && user.password === password) {
            if (user.isBlocked) {
                res.status(403).json({ success: false, message: 'Account is blocked.' });
            } else {
                if (user.mustChangePassword) {
                     res.json({ success: false, message: 'Password change required', code: 'CHANGE_PASSWORD_REQUIRED', userId: user.id });
                     return;
                }

                // Generate Session Token
                const sessionToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
                await prisma.account.update({
                    where: { id: user.id },
                    data: { sessionToken }
                });

                // Get linked player ID if exists
                const linkedPlayer = await prisma.player.findUnique({
                    where: { accountId: user.id }
                });

                res.json({
                    success: true,
                    user: {
                        id: user.id,
                        username: user.username,
                        role: user.role,
                        isVerified: user.isVerified,
                        playerId: linkedPlayer ? linkedPlayer.id : null
                    },
                    token: sessionToken
                });
            }
        } else {
            res.status(401).json({ success: false, message: 'Invalid credentials.' });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/push-token', async (req, res) => {
    const { sessionToken, expoPushToken } = req.body;
    try {
        if (!sessionToken || !expoPushToken) {
            return res.status(400).json({ success: false, message: 'Missing tokens' });
        }

        const account = await prisma.account.findUnique({ where: { sessionToken } });
        if (!account) {
            return res.status(401).json({ success: false, message: 'Invalid session' });
        }

        await prisma.account.update({
            where: { id: account.id },
            data: { expoPushToken }
        });

        res.json({ success: true });
    } catch (e) {
        console.error("Failed to update push token", e);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/change-password', async (req, res) => {
    const { username, oldPassword, newPassword } = req.body;
    try {
        const user = await prisma.account.findUnique({
            where: { username }
        });

        if (user && user.password === oldPassword) {
             await prisma.account.update({
                 where: { id: user.id },
                 data: {
                     password: newPassword,
                     mustChangePassword: false
                 }
             });
             res.json({ success: true, message: 'Password changed successfully.' });
        } else {
             res.status(401).json({ success: false, message: 'Invalid old password.' });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

io.on('connection', async (socket) => {
  console.log(`User connected: ${socket.id} (${socket.data.user?.username})`);

  // Send initial state
  try {
      const players = await prisma.player.findMany();
      let teams = await prisma.team.findMany({ include: { players: true } });
      teams = getTeamsWithLandings(teams, LANDINGS);
      socket.emit('init_state', {
        players: players,
        teams: teams,
        chat: CHAT_LOGS,
        rallies: RALLIES,
        landings: LANDINGS,
        serverTime: Date.now(),
        chatSilenced: CHAT_SILENCED,
        importantAccounts: Array.from(IMPORTANT_ACCOUNTS),
        activeMap: ACTIVE_MAP,
        presence: getPresenceMap()
      });
  } catch (e) {
      console.error("Error sending init state:", e);
  }

  // --- Presence tracking ---
  const presenceAccountId = socket.data.user?.id;
  if (presenceAccountId) {
    ONLINE_COUNTS.set(presenceAccountId, (ONLINE_COUNTS.get(presenceAccountId) || 0) + 1);
    AWAY_ACCOUNTS.delete(presenceAccountId); // a fresh connection means "online"
    broadcastPresence();
  }

  // Player sets their own availability ('online' | 'away') from web or the companion app.
  socket.on('player:set_availability', (data) => {
    const uid = socket.data.user?.id;
    if (!uid || (ONLINE_COUNTS.get(uid) || 0) <= 0) return;
    if (data && data.status === 'away') AWAY_ACCOUNTS.add(uid);
    else AWAY_ACCOUNTS.delete(uid);
    broadcastPresence();
  });

  socket.on('auth:change_password', async (data) => {
       const { userId, newPassword } = data;
       try {
           await prisma.account.update({
               where: { id: userId },
               data: {
                   password: newPassword,
                   mustChangePassword: false
               }
           });
           socket.emit('auth:password_changed', { message: 'Password updated. Please login.' });
       } catch(e) {
           console.error(e);
           socket.emit('error', { message: 'Failed to update password' });
       }
  });

  // Map Movement
  socket.on('map:move', async (data) => {
    const { playerId, x, y } = data;

    // Permission Check
    const user = socket.data.user;
    if (!user) return;

    try {
        const player = await prisma.player.findUnique({ where: { id: playerId } });
        if (!player) return;

        const canMoveOthers = user.role === 'SUPERADMIN' || user.role === 'ADMIN' || user.role === 'COMMANDER';

        // User can only move their own claimed player unless they are admin/commander
        if (!canMoveOthers && player.accountId !== user.id) {
            socket.emit('error', { message: 'You can only move your own player.' });
            return;
        }

        // Validate Move (We need current players for collision check)
        const allPlayers = await prisma.player.findMany();
        if (checkCollision(playerId, x, y, allPlayers)) {
            socket.emit('error', { message: 'Invalid position: Blocked or Restricted.' });
            return;
        }

        // Update Position
        await prisma.player.update({
            where: { id: playerId },
            data: { x, y }
        });

        // Broadcast Update
        const updatedPlayers = await prisma.player.findMany();
        io.emit('map:update', { players: updatedPlayers });

    } catch(e) { console.error(e); }
  });

  socket.on('map:remove', async (data) => {
    const { playerId } = data;

    const user = socket.data.user;
    if (!user) return;

    try {
        const player = await prisma.player.findUnique({ where: { id: playerId } });
        if (!player) return;

        const canMoveOthers = user.role === 'SUPERADMIN' || user.role === 'ADMIN' || user.role === 'COMMANDER';

        if (!canMoveOthers && player.accountId !== user.id) {
            socket.emit('error', { message: 'You can only remove your own player.' });
            return;
        }

        // Update Position to null (remove from grid)
        await prisma.player.update({
            where: { id: playerId },
            data: { x: null, y: null }
        });

        const updatedPlayers = await prisma.player.findMany();
        io.emit('map:update', { players: updatedPlayers });
    } catch(e) { console.error(e); }
  });

  // Rally Start
  socket.on('rally:start', async (data) => {
    const { initiatorId, target, duration, customMarchTimeMs } = data; // duration in ms
    
    // Enforce 1 active rally per player
    const activeRally = RALLIES.find(r => r.initiatorId === initiatorId);
    if (activeRally) {
      socket.emit('error', { message: 'You already have an active rally.' });
      return;
    }

    const rallyId = Date.now().toString();

    let marchTime = 0;
    let initiatorTeamId = null;
    let initiatorAllianceId = null;
    let initiatorName = "Someone";
    try {
      const player = await prisma.player.findUnique({ where: { id: initiatorId }, include: { team: true } });
      if (player) {
        initiatorTeamId = player.teamId;
        initiatorAllianceId = player.allianceId;
        initiatorName = player.name;
        const t = target.toLowerCase();
        if (t.includes("castle")) marchTime = player.mtCastle || 0;
        else if (t.includes("north")) marchTime = player.mtNorth || 0;
        else if (t.includes("east")) marchTime = player.mtEast || 0;
        else if (t.includes("south")) marchTime = player.mtSouth || 0;
        else if (t.includes("west")) marchTime = player.mtWest || 0;
      }
    } catch (err) {
      console.error("Failed to fetch march time", err);
    }

    // UI expects marchTime in ms for duration matching
    const marchTimeMs = typeof customMarchTimeMs === 'number' ? customMarchTimeMs : marchTime * 1000;
    const marchEndTime = Date.now() + duration + marchTimeMs;

    const rally = {
      id: rallyId,
      initiatorId,
      target,
      startTime: Date.now(),
      endTime: Date.now() + duration,
      marchTime: marchTimeMs,
      marchEndTime: marchEndTime
    };
    RALLIES.push(rally);
    io.emit('rally:update', { rallies: RALLIES });

    // Update Player Status
    try {
        const initiator = await prisma.player.update({
            where: { id: initiatorId },
            data: { status: 'RALLYING' }
        });
        const players = await prisma.player.findMany();
        io.emit('map:update', { players });

        // Push notifications to all users with companion app
        const allPlayers = await prisma.player.findMany({
            include: { account: true, team: true }
        });

        let initiatorData = await prisma.player.findUnique({
            where: { id: initiatorId },
            include: { team: true }
        });

        const messages = [];
        for (const member of allPlayers) {
            if (member.account && member.account.expoPushToken && member.id !== initiatorId) {
                let isAlly = false;
                if (initiatorTeamId && member.teamId === initiatorTeamId) {
                    isAlly = true;
                } else if (initiatorAllianceId && member.allianceId === initiatorAllianceId) {
                    isAlly = true;
                } else if (initiatorData && initiatorData.team && member.team && initiatorData.team.isEnemy === member.team.isEnemy) {
                    isAlly = true;
                }

                const title = isAlly ? 'Ally Launched a Rally!' : 'Enemy Launched a Rally!';
                messages.push({
                    to: member.account.expoPushToken,
                    sound: 'default',
                    title: title,
                    body: `${initiatorName} launched a rally on ${target}!`,
                    data: { rallyId, target, initiator: initiatorName, isAlly }
                });
            }
        }

        if (messages.length > 0) {
            try {
                await fetch('https://exp.host/--/api/v2/push/send', {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Accept-encoding': 'gzip, deflate',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(messages),
                });
            } catch (pushErr) {
                console.error("Error sending push notifications:", pushErr);
            }
        }
    } catch(e) { console.error(e); }

    // Transition to MARCHING when rally duration ends
    setTimeout(async () => {
      // Check if rally wasn't cancelled
      const idx = RALLIES.findIndex(r => r.id === rallyId);
      if (idx !== -1 && marchTimeMs > 0) {
          try {
              await prisma.player.update({
                  where: { id: initiatorId },
                  data: { status: 'MARCHING' }
              });
              const players = await prisma.player.findMany();
              io.emit('map:update', { players });
          } catch(e) { console.error(e); }
      }
    }, duration);

    // Set timeout to automatically end rally
    setTimeout(async () => {
        const rallyIndex = RALLIES.findIndex(r => r.id === rallyId);
        if (rallyIndex !== -1) {
            // Remove Rally
            RALLIES.splice(rallyIndex, 1);
            io.emit('rally:update', { rallies: RALLIES });

            // Update Player Status back to IDLE
            try {
                await prisma.player.update({
                    where: { id: initiatorId },
                    data: { status: 'IDLE' }
                });
                const players = await prisma.player.findMany();
                io.emit('map:update', { players });
            } catch(e) { console.error(e); }
        }
    }, duration + marchTimeMs);
  });

  // Rally Cancel
  socket.on('rally:cancel', async (data) => {
    const { rallyId } = data;
    const rallyIndex = RALLIES.findIndex(r => r.id === rallyId);

    if (rallyIndex === -1) return;

    const rally = RALLIES[rallyIndex];
    const user = socket.data.user;

    if (!user) return;

    try {
        const initiator = await prisma.player.findUnique({ where: { id: rally.initiatorId } });

        // Allow if Superadmin OR if user owns the initiating player
        const isSuperAdmin = user.role === 'SUPERADMIN';
        const isOwner = initiator && initiator.accountId === user.id;

        if (!isSuperAdmin && !isOwner) {
            socket.emit('error', { message: 'Not authorized to cancel this rally.' });
            return;
        }

        // Remove Rally
        RALLIES.splice(rallyIndex, 1);
        io.emit('rally:update', { rallies: RALLIES });

        // Update Player Status
        if (initiator) {
            await prisma.player.update({
                where: { id: initiator.id },
                data: { status: 'IDLE' }
            });
            const players = await prisma.player.findMany();
            io.emit('map:update', { players });
        }
    } catch(e) { console.error(e); }
  });

  socket.on('admin:toggle_player_mute', async (data) => {
    const user = socket.data.user;
    if (!user || (user.role !== 'SUPERADMIN' && user.role !== 'ADMIN' && user.role !== 'COMMANDER')) return;

    const { playerId } = data;
    try {
        const targetPlayer = await prisma.player.findUnique({ where: { id: playerId } });
        if (targetPlayer) {
            await prisma.player.update({
                where: { id: playerId },
                data: { isMuted: !targetPlayer.isMuted }
            });
            const players = await prisma.player.findMany();
            io.emit('map:update', { players });
        }
    } catch(e) { console.error(e); }
  });

  // Landing Creation
  socket.on('landing:create', (data) => {
    const { x, y, time, assignedTo, type, rallyTime, playerOffsets } = data;

    // Defensive time format normalization (e.g. "224312" -> "22:43:12")
    let formattedTime = time;
    if (time && typeof time === 'string') {
      const cleanTime = time.replace(/:/g, '');
      if (cleanTime.length === 6) {
        formattedTime = `${cleanTime.substring(0, 2)}:${cleanTime.substring(2, 4)}:${cleanTime.substring(4, 6)}`;
      }
    }

    const landing = {
      id: Date.now().toString(),
      x,
      y,
      time: formattedTime,
      assignedTo,
      type,
      rallyTime: typeof rallyTime === 'number' ? rallyTime : 300,
      playerOffsets: playerOffsets || {},
      creatorId: socket.id // For reference, though we aren't enforcing perms here strictly
    };
    LANDINGS.push(landing);

    // Broadcast updates
    io.emit('landing:update', { landings: LANDINGS });

    // Broadcast updated teams
    prisma.team.findMany({ include: { players: true } }).then(t => {
        io.emit('admin:teams_data', { teams: getTeamsWithLandings(t, LANDINGS) });
    });

    io.emit('notification', {
      message: `COMMANDER ORDER: LANDING SET AT ${formattedTime} UTC FOR ${assignedTo.toUpperCase()}`
    });
  });

  // Grouping Prepare
  socket.on('grouping:prepare', () => {
    const user = socket.data.user;
    if (!user || (user.role !== 'SUPERADMIN' && user.role !== 'ADMIN' && user.role !== 'COMMANDER')) return;

    const senderName = user.username || 'Commander';
    const alertMsg = 'GROUP ATTACK IS BEING SET UP! PREPARE YOUR RALLIES!';

    io.emit('notification:alert', {
      id: Date.now().toString(),
      message: alertMsg,
      sender: senderName
    });

    io.emit('notification', {
      message: `[ALERT] ${senderName}: ${alertMsg}`
    });
  });

  // Grouping Deploy
  socket.on('grouping:deploy', (data) => {
    const user = socket.data.user;
    if (!user || (user.role !== 'SUPERADMIN' && user.role !== 'ADMIN' && user.role !== 'COMMANDER')) return;

    const { landings: groupLandings } = data || {};
    if (!Array.isArray(groupLandings) || groupLandings.length < 2) {
      socket.emit('error', { message: 'Grouping deployment requires at least 2 target landings.' });
      return;
    }

    // Process and add each landing to global LANDINGS
    groupLandings.forEach(gLanding => {
      // Remove existing landings for this assignedTo or target if any
      LANDINGS = LANDINGS.filter(l => l.assignedTo !== gLanding.assignedTo && l.id !== gLanding.id);

      const newLanding = {
        id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 4),
        x: gLanding.x || 20,
        y: gLanding.y || 20,
        time: gLanding.time,
        assignedTo: gLanding.assignedTo,
        type: gLanding.type,
        rallyTime: gLanding.rallyTime || 300,
        playerOffsets: gLanding.playerOffsets || {},
        creatorId: socket.id
      };
      LANDINGS.push(newLanding);
    });

    // Broadcast updates
    io.emit('landing:update', { landings: LANDINGS });

    prisma.team.findMany({ include: { players: true } }).then(t => {
      io.emit('admin:teams_data', { teams: getTeamsWithLandings(t, LANDINGS) });
    });

    const senderName = user.username || 'Commander';
    const alertMsg = `GROUP ATTACK DEPLOYED ACROSS ${groupLandings.length} TARGETS!`;

    io.emit('notification:alert', {
      id: Date.now().toString(),
      message: alertMsg,
      sender: senderName
    });

    io.emit('notification', {
      message: `COMMANDER ORDER: ${alertMsg}`
    });
  });

  // Landing Cancel
  socket.on('landing:cancel', (data) => {
    const { landingId } = data;
    const cancelledLanding = LANDINGS.find(l => l.id === landingId);
    if (cancelledLanding) {
        LANDINGS = LANDINGS.filter(l => l.id !== landingId);
        io.emit('landing:update', { landings: LANDINGS });

        prisma.team.findMany({ include: { players: true } }).then(t => {
            io.emit('admin:teams_data', { teams: getTeamsWithLandings(t, LANDINGS) });
        });

        io.emit('notification', {
            message: `COMMANDER ORDER: CANCELLED LANDING FOR ${cancelledLanding.assignedTo.toUpperCase()}`
        });
    }
  });

  // Admin Alert
  socket.on('admin:alert', (data) => {
    const user = socket.data.user;
    if (!user || (user.role !== 'SUPERADMIN' && user.role !== 'ADMIN' && user.role !== 'COMMANDER')) return;

    io.emit('notification:alert', {
      id: Date.now().toString(),
      message: data.message,
      sender: user.username
    });

    // Also inject into chat
    const msg = {
      id: Date.now(),
      sender: 'SYSTEM',
      message: `[ALERT] ${data.message}`,
      timestamp: Date.now(),
      role: 'SYSTEM',
      senderId: null,
      isImportant: true,
      isFromImportantAccount: false
    };
    CHAT_LOGS.push(msg);
    if (CHAT_LOGS.length > 50) CHAT_LOGS.shift(); // Keep last 50
    io.emit('chat:update', { chat: CHAT_LOGS });
  });

  // Chat Message
  socket.on('chat:message', async (data) => {
    const sessionUser = socket.data.user;
    if (!sessionUser) {
        socket.emit('error', { message: 'Authentication required to chat.' });
        return;
    }

    const { message } = data;
    const sender = sessionUser.username;
    const role = sessionUser.role;

    // Check if user is blocked directly from DB
    let user;
    try {
        user = await prisma.account.findUnique({ where: { id: sessionUser.id } });
    } catch(e) { console.error(e); }

    if (user && user.isBlocked) {
      socket.emit('error', { message: 'You are blocked from chatting.' });
      return;
    }

    // Check if chat is silenced (only admins/commanders can bypass)
    if (CHAT_SILENCED && role !== 'ADMIN' && role !== 'SUPERADMIN' && role !== 'COMMANDER') {
        socket.emit('error', { message: 'Chat is currently silenced.' });
        return;
    }

    // Command Parsing
    if (message.startsWith('/')) {
        const isAdmin = role === 'ADMIN' || role === 'SUPERADMIN' || role === 'COMMANDER';
        if (!isAdmin) {
             socket.emit('error', { message: 'Commands are restricted to authorized personnel.' });
             return;
        }

        const args = message.trim().split(' ');
        const cmd = args[0].toLowerCase();

        let systemResponse = null;

        if (cmd === '/help') {
            systemResponse = "Available commands: /help, /alert <msg>, /silence, /clear, /block <username>, /importantuser <username>, /importantmsg <id>";
        } else if (cmd === '/alert' && args.length > 1) {
            const alertMsg = args.slice(1).join(' ');
            const senderName = user ? user.username : sender;
            io.emit('notification:alert', { id: Date.now().toString(), message: alertMsg, sender: senderName });
            CHAT_LOGS.push({
                id: Date.now(), sender: 'SYSTEM', message: `[ALERT] ${alertMsg}`, timestamp: Date.now(), role: 'SYSTEM', senderId: null, isImportant: true, isFromImportantAccount: false
            });
            io.emit('chat:update', { chat: CHAT_LOGS });
            return; // Handled directly
        } else if (cmd === '/silence') {
            CHAT_SILENCED = !CHAT_SILENCED;
            io.emit('chat:silence_update', { chatSilenced: CHAT_SILENCED });
            systemResponse = `Chat has been ${CHAT_SILENCED ? 'SILENCED' : 'UNSILENCED'}.`;
        } else if (cmd === '/clear') {
            CHAT_LOGS = [];
            io.emit('chat:update', { chat: CHAT_LOGS });
            systemResponse = "Chat history cleared.";
        } else if (cmd === '/block' && args.length > 1) {
            const targetName = args[1];
            try {
                const targetAccount = await prisma.account.findUnique({ where: { username: targetName } });
                if (targetAccount) {
                    const newBlockedStatus = !targetAccount.isBlocked;
                    await prisma.account.update({ where: { id: targetAccount.id }, data: { isBlocked: newBlockedStatus } });
                    systemResponse = `User ${targetName} block status toggled.`;
                    // Update global USERS array
                    const idx = USERS.findIndex(u => u.username === targetName);
                    if (idx !== -1) USERS[idx].isBlocked = newBlockedStatus;
                } else {
                    systemResponse = `User ${targetName} not found.`;
                }
            } catch(e) { console.error("Error blocking user via slash command:", e); }
        } else if (cmd === '/importantuser' && args.length > 1) {
            const targetName = args[1];
            let targetAccount;
            try {
                targetAccount = await prisma.account.findUnique({ where: { username: targetName } });
            } catch(e) { console.error(e); }

            if (targetAccount) {
                if (IMPORTANT_ACCOUNTS.has(targetAccount.id)) {
                    IMPORTANT_ACCOUNTS.delete(targetAccount.id);
                    systemResponse = `User ${targetName} marked UNIMPORTANT.`;
                } else {
                    IMPORTANT_ACCOUNTS.add(targetAccount.id);
                    systemResponse = `User ${targetName} marked IMPORTANT.`;
                }
                io.emit('chat:important_accounts_update', { importantAccounts: Array.from(IMPORTANT_ACCOUNTS) });
            } else {
                systemResponse = `User ${targetName} not found.`;
            }
        } else if (cmd === '/importantmsg' && args.length > 1) {
            const targetId = parseInt(args[1], 10);
            const msg = CHAT_LOGS.find(m => m.id === targetId);
            if (msg) {
                msg.isImportant = !msg.isImportant;
                io.emit('chat:update', { chat: CHAT_LOGS });
                systemResponse = `Message ${targetId} important status toggled.`;
            } else {
                systemResponse = `Message ${targetId} not found.`;
            }
        } else {
            systemResponse = "Unknown command or missing arguments. Type /help for a list of commands.";
        }

        if (systemResponse) {
             // Send private response to sender
             socket.emit('chat:update', {
                 chat: [...CHAT_LOGS, { id: Date.now(), sender: 'SYSTEM', message: systemResponse, timestamp: Date.now(), role: 'SYSTEM', senderId: null }]
             });
        }
        return; // Don't broadcast the command string itself
    }

    const msg = {
      id: Date.now(),
      sender,
      message,
      timestamp: Date.now(),
      role,
      senderId: user ? user.id : null,
      isImportant: false,
      isFromImportantAccount: user ? IMPORTANT_ACCOUNTS.has(user.id) : false
    };
    CHAT_LOGS.push(msg);
    if (CHAT_LOGS.length > 50) CHAT_LOGS.shift(); // Keep last 50
    io.emit('chat:update', { chat: CHAT_LOGS });
  });

  socket.on('chat:clear', () => {
    CHAT_LOGS = [];
    io.emit('chat:update', { chat: CHAT_LOGS });
  });

  // Chat Control
  socket.on('admin:toggle_chat_silence', () => {
      const user = socket.data.user;
      if (!user || (user.role !== 'SUPERADMIN' && user.role !== 'ADMIN' && user.role !== 'COMMANDER')) return;
      CHAT_SILENCED = !CHAT_SILENCED;
      io.emit('chat:silence_update', { chatSilenced: CHAT_SILENCED });
  });

  socket.on('admin:mark_message_important', (data) => {
      const user = socket.data.user;
      if (!user || (user.role !== 'SUPERADMIN' && user.role !== 'ADMIN' && user.role !== 'COMMANDER')) return;

      const { messageId } = data;
      const msg = CHAT_LOGS.find(m => m.id === messageId);
      if (msg) {
          msg.isImportant = !msg.isImportant;
          io.emit('chat:update', { chat: CHAT_LOGS });
      }
  });

  socket.on('admin:toggle_important_account', (data) => {
      const user = socket.data.user;
      if (!user || (user.role !== 'SUPERADMIN' && user.role !== 'ADMIN' && user.role !== 'COMMANDER')) return;

      const { accountId } = data;
      if (IMPORTANT_ACCOUNTS.has(accountId)) {
          IMPORTANT_ACCOUNTS.delete(accountId);
      } else {
          IMPORTANT_ACCOUNTS.add(accountId);
      }
      io.emit('chat:important_accounts_update', { importantAccounts: Array.from(IMPORTANT_ACCOUNTS) });
  });

  // --- Admin Handlers ---

  socket.on('admin:add_player', async (data) => {
    const { name, power, allianceId, role } = data;
    try {
        // Ensure alliance exists
        const alliance = await prisma.alliance.findUnique({ where: { id: allianceId } });

        await prisma.player.create({
            data: {
                name,
                power: parseInt(power),
                allianceId: alliance ? allianceId : undefined,
                role,
                status: 'IDLE',
                avatar: `https://ui-avatars.com/api/?name=${name}`
            }
        });
        const players = await prisma.player.findMany();
        io.emit('map:update', { players });
    } catch(e) { console.error(e); }
  });

  socket.on('admin:delete_player', async (data) => {
    const { playerId } = data;
    try {
        await prisma.player.delete({ where: { id: playerId } });
        const players = await prisma.player.findMany();
        io.emit('map:update', { players });
    } catch(e) { console.error(e); }
  });

  socket.on('user:claim_player', async (data) => {
    const user = socket.data.user;
    if (!user) return;

    const { name } = data;

    try {
        const existing = await prisma.player.findFirst({ where: { accountId: user.id } });
        if (existing) {
            socket.emit('error', { message: 'You already have a player.' });
            return;
        }

        // Create player with status PENDING
        const newPlayer = await prisma.player.create({
            data: {
                name: name || user.username,
                allianceId: 'ally',
                role: ROLES.REINFORCER,
                power: 10000000,
                x: null,
                y: null,
                status: 'PENDING', // Needs admin approval
                accountId: user.id,
                avatar: `https://ui-avatars.com/api/?name=${name || user.username}`
            }
        });

        // Notify admins of new pending player (or just update map/lists)
        const players = await prisma.player.findMany();
        io.emit('map:update', { players });
        socket.emit('user:player_claimed', { player: newPlayer });
    } catch(e) { console.error(e); }
  });

  socket.on('player:update_march_times', async (data) => {
      const user = socket.data.user;
      if (!user) return;

      const { playerId, mtCastle, mtNorth, mtEast, mtSouth, mtWest, customMarchTimes } = data;

      try {
          // Find player
          const playerToUpdate = await prisma.player.findUnique({ where: { id: playerId } });
          if (!playerToUpdate) return;

          // Auth check: Must be owner, admin, superadmin, or commander
          const isOwner = playerToUpdate.accountId === user.id;
          const isAdmin = user.role === 'ADMIN' || user.role === 'SUPERADMIN' || user.role === 'COMMANDER';

          if (!isOwner && !isAdmin) {
              socket.emit('error', { message: 'Unauthorized to update march times for this player.' });
              return;
          }

          // Update times
          const parseTime = (val, currentVal) => {
              // If undefined was passed, it means it was not updated, keep current value.
              // BUT our client sends ALL values, even unchanged ones (as their current state).
              // If current state is null, client sends null.
              if (val === undefined) return currentVal;
              if (val === null || val === '') return null;
              const parsed = parseInt(val, 10);
              return isNaN(parsed) ? null : parsed;
          };

          await prisma.player.update({
              where: { id: playerId },
              data: {
                  mtCastle: parseTime(mtCastle, playerToUpdate.mtCastle),
                  mtNorth: parseTime(mtNorth, playerToUpdate.mtNorth),
                  mtEast: parseTime(mtEast, playerToUpdate.mtEast),
                  mtSouth: parseTime(mtSouth, playerToUpdate.mtSouth),
                  mtWest: parseTime(mtWest, playerToUpdate.mtWest),
                  customMarchTimes: customMarchTimes !== undefined ? JSON.stringify(customMarchTimes) : playerToUpdate.customMarchTimes,
              }
          });

          // Broadcast updated player to everyone
          const players = await prisma.player.findMany();
          io.emit('map:update', { players });

          // Also broadcast updated teams so companion app gets updated player march times inside team!
          let teams = await prisma.team.findMany({ include: { players: true } });
          teams = getTeamsWithLandings(teams, LANDINGS);
          io.emit('admin:teams_data', { teams });

      } catch (e) {
          console.error('Error updating march times:', e);
      }
  });

  socket.on('admin:verify_player', async (data) => {
      const { playerId } = data;
      // Admin check
      const user = socket.data.user;

      // Fix: Check socket.data.user which is set on auth:login.
      // If admin connects via a new socket (in test flow) but hasn't logged in on THAT socket, it fails.
      // But in our test flow, socket (admin) IS logged in.
      // Let's add debug log.
      console.log('Admin verify request from:', user ? user.username : 'Unknown');

      if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPERADMIN')) {
          console.log('Unauthorized verify attempt');
          return;
      }

      try {
          await prisma.player.update({
              where: { id: playerId },
              data: { status: 'IDLE' }
          });
          const players = await prisma.player.findMany();
          io.emit('map:update', { players });
      } catch(e) { console.error(e); }
  });

  socket.on('admin:import_players', (data) => {
    // Merge new players or replace? Let's merge/update by ID
    const newPlayers = data.players || [];
    newPlayers.forEach(np => {
      const idx = PLAYERS.findIndex(p => p.id === np.id);
      if (idx !== -1) {
        PLAYERS[idx] = { ...PLAYERS[idx], ...np };
      } else {
        PLAYERS.push({ ...np, x: null, y: null, status: 'IDLE', accountId: null });
      }
    });
    io.emit('map:update', { players: PLAYERS });
  });

  socket.on('admin:get_users', async () => {
    const user = socket.data.user;
    console.log(`admin:get_users called by ${user?.username} (${user?.role})`);
    if (!user || (user.role !== 'SUPERADMIN' && user.role !== 'ADMIN')) {
        console.log('Access denied');
        return;
    }

    try {
        const users = await prisma.account.findMany();
        console.log(`Fetched ${users.length} users`);
        socket.emit('admin:users_data', { users });
    } catch (e) {
        console.error("Error fetching users:", e);
    }
  });

  socket.on('admin:toggle_block', async (data) => {
    const user = socket.data.user;
    if (!user || (user.role !== 'SUPERADMIN' && user.role !== 'ADMIN')) return;

    const { userId } = data;
    try {
        const targetUser = await prisma.account.findUnique({ where: { id: userId } });
        if (targetUser) {
            await prisma.account.update({
                where: { id: userId },
                data: { isBlocked: !targetUser.isBlocked }
            });
            const users = await prisma.account.findMany();
            io.emit('admin:users_data', { users });
        }
    } catch(e) { console.error(e); }
  });

  socket.on('admin:add_user', async (data) => {
    const user = socket.data.user;
    if (!user || (user.role !== 'SUPERADMIN' && user.role !== 'ADMIN')) return;

    const { username, password, role } = data;
    try {
        await prisma.account.create({
            data: {
                username,
                password,
                role,
                mustChangePassword: true
            }
        });
        const users = await prisma.account.findMany();
        io.emit('admin:users_data', { users });
    } catch(e) {
        console.error(e);
        socket.emit('error', { message: 'Failed to create user (username taken?)' });
    }
  });

  socket.on('admin:delete_user', async (data) => {
    const user = socket.data.user;
    if (!user || (user.role !== 'SUPERADMIN' && user.role !== 'ADMIN')) return;

    const { userId } = data;
    try {
        await prisma.account.delete({ where: { id: userId } });
        const users = await prisma.account.findMany();
        io.emit('admin:users_data', { users });
    } catch(e) { console.error(e); }
  });

  socket.on('admin:generate_otp', async (data) => {
    const user = socket.data.user;
    if (!user || (user.role !== 'SUPERADMIN' && user.role !== 'ADMIN')) return;

    const { userId } = data;
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    console.log(`OTP generated for user ${userId}: ${otp}`);

    try {
        await prisma.account.update({
            where: { id: userId },
            data: { otp, isVerified: false }
        });
        socket.emit('admin:otp_generated', { userId, otp });
    } catch(e) { console.error(e); }
  });

  socket.on('auth:verify_otp', async (data) => {
    const { otp } = data;
    try {
        const user = await prisma.account.findFirst({ where: { otp } });

        if (user) {
            await prisma.account.update({
                where: { id: user.id },
                data: { isVerified: true, otp: null }
            });

            socket.emit('auth:success', {
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    isVerified: true
                }
            });
            // Notify admin
            const users = await prisma.account.findMany();
            io.emit('admin:users_data', { users });
        } else {
             socket.emit('auth:error', { message: 'Invalid OTP' });
        }
    } catch(e) { console.error(e); }
  });

  socket.on('admin:update_password', async (data) => {
      const { userId, newPassword } = data;
      // Should verify admin perms here, but rely on UI protection for prototype or add explicit check
      const user = socket.data.user;
      if (!user || user.role !== 'SUPERADMIN') {
          socket.emit('error', { message: 'Unauthorized' });
          return;
      }

      try {
          await prisma.account.update({
              where: { id: userId },
              data: { password: newPassword }
          });
          socket.emit('admin:success', { message: 'User password updated' });
      } catch(e) {
          console.error(e);
          socket.emit('error', { message: 'Failed to update password' });
      }
  });


  // --- Map Layout Management ---
  socket.on('admin:get_maps', async () => {
    try {
        const maps = await prisma.mapLayout.findMany({
             orderBy: { createdAt: 'desc' }
        });
        socket.emit('admin:maps_data', { maps, activeMap: ACTIVE_MAP });
    } catch(e) { console.error("Error fetching maps:", e); }
  });

  socket.on('admin:save_map', async (data) => {
    const user = socket.data.user;
    if (!user || (user.role !== 'SUPERADMIN' && user.role !== 'ADMIN')) return;

    try {
        let savedMap;
        if (data.id) {
            // Update
            const existing = await prisma.mapLayout.findUnique({ where: { id: data.id }});
            if (existing?.isDefault) {
                socket.emit('error', { message: 'Cannot edit the default map.' });
                return;
            }

            savedMap = await prisma.mapLayout.update({
                where: { id: data.id },
                data: {
                    name: data.name,
                    size: data.size,
                    elements: data.elements,
                    blockZones: data.blockZones
                }
            });
        } else {
            // Create
            savedMap = await prisma.mapLayout.create({
                data: {
                    name: data.name,
                    size: data.size,
                    elements: data.elements,
                    blockZones: data.blockZones,
                    isActive: false,
                    isDefault: false
                }
            });
            socket.emit('admin:map_created', { map: savedMap });
        }

        ALL_MAPS = await prisma.mapLayout.findMany();
        if (ACTIVE_MAP?.id === savedMap.id) {
             ACTIVE_MAP = savedMap;
             io.emit('map_layout:update', { activeMap: ACTIVE_MAP });
        }

        io.emit('admin:maps_data', { maps: ALL_MAPS, activeMap: ACTIVE_MAP });
    } catch(e) { console.error("Error saving map:", e); }
  });

  socket.on('admin:delete_map', async (data) => {
    const user = socket.data.user;
    if (!user || (user.role !== 'SUPERADMIN' && user.role !== 'ADMIN')) return;

    try {
        const { id } = data;
        const mapToDelete = await prisma.mapLayout.findUnique({ where: { id }});

        if (mapToDelete?.isDefault) {
             socket.emit('error', { message: 'Cannot delete the default map.' });
             return;
        }

        if (mapToDelete?.isActive) {
             socket.emit('error', { message: 'Cannot delete the active map. Set another map as active first.' });
             return;
        }

        await prisma.mapLayout.delete({ where: { id } });
        ALL_MAPS = await prisma.mapLayout.findMany();
        io.emit('admin:maps_data', { maps: ALL_MAPS, activeMap: ACTIVE_MAP });
    } catch(e) { console.error("Error deleting map:", e); }
  });

  socket.on('admin:set_active_map', async (data) => {
    const user = socket.data.user;
    if (!user || (user.role !== 'SUPERADMIN' && user.role !== 'ADMIN')) return;

    try {
        const { id } = data;

        // Deactivate all
        await prisma.mapLayout.updateMany({ data: { isActive: false } });

        // Activate target
        const active = await prisma.mapLayout.update({
            where: { id },
            data: { isActive: true }
        });

        ACTIVE_MAP = active;
        ALL_MAPS = await prisma.mapLayout.findMany();

        io.emit('admin:maps_data', { maps: ALL_MAPS, activeMap: ACTIVE_MAP });
        io.emit('map_layout:update', { activeMap: ACTIVE_MAP });

        // Clear all placed players to avoid out of bounds on map change
        await prisma.player.updateMany({
             data: { x: null, y: null }
        });
        const players = await prisma.player.findMany();
        io.emit('map:update', { players });

    } catch(e) { console.error("Error setting active map:", e); }
  });

  // --- Team Management ---
  socket.on('admin:get_teams', async () => {
    try {
        let teams = await prisma.team.findMany({ include: { players: true } });
      teams = getTeamsWithLandings(teams, LANDINGS);
        socket.emit('admin:teams_data', { teams });
    } catch(e) { console.error("Error fetching teams:", e); }
  });

  socket.on('admin:create_team', async (data) => {
    const user = socket.data.user;
    if (!user || (user.role !== 'SUPERADMIN' && user.role !== 'ADMIN' && user.role !== 'COMMANDER')) return;

    const { name, isEnemy } = data;
    try {
        await prisma.team.create({ data: { name, isEnemy: isEnemy || false } });
        let teams = await prisma.team.findMany({ include: { players: true } });
      teams = getTeamsWithLandings(teams, LANDINGS);
        io.emit('admin:teams_data', { teams });
    } catch(e) { console.error("Error creating team:", e); }
  });

  socket.on('admin:delete_team', async (data) => {
    const user = socket.data.user;
    if (!user || (user.role !== 'SUPERADMIN' && user.role !== 'ADMIN' && user.role !== 'COMMANDER')) return;

    const { teamId } = data;
    try {
        // Unlink players first
        await prisma.player.updateMany({
            where: { teamId },
            data: { teamId: null }
        });
        await prisma.team.delete({ where: { id: teamId } });

        let teams = await prisma.team.findMany({ include: { players: true } });
      teams = getTeamsWithLandings(teams, LANDINGS);
        const players = await prisma.player.findMany();
        io.emit('admin:teams_data', { teams });
        io.emit('map:update', { players });
    } catch(e) { console.error("Error deleting team:", e); }
  });

  socket.on('admin:assign_player_to_team', async (data) => {
    const user = socket.data.user;
    if (!user || (user.role !== 'SUPERADMIN' && user.role !== 'ADMIN' && user.role !== 'COMMANDER')) return;

    const { playerId, teamId } = data;
    try {
        await prisma.player.update({
            where: { id: playerId },
            data: { teamId: teamId || null }
        });
        let teams = await prisma.team.findMany({ include: { players: true } });
      teams = getTeamsWithLandings(teams, LANDINGS);
        const players = await prisma.player.findMany();
        io.emit('admin:teams_data', { teams });
        io.emit('map:update', { players });
    } catch(e) { console.error("Error assigning player to team:", e); }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    const uid = socket.data.user?.id;
    if (uid) {
      const c = (ONLINE_COUNTS.get(uid) || 0) - 1;
      if (c <= 0) { ONLINE_COUNTS.delete(uid); AWAY_ACCOUNTS.delete(uid); }
      else ONLINE_COUNTS.set(uid, c);
      broadcastPresence();
    }
  });
});

const PORT = 3001;
server.listen(PORT, async () => {
  console.log(`Socket server running on port ${PORT}`);
  await seedDatabase();
});
