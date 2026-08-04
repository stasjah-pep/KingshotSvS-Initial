import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { notify } from '../lib/toast';

export interface Player {
  id: string;
  name: string;
  allianceId: string;
  role: string;
  power: number;
  x: number | null;
  y: number | null;
  status: 'IDLE' | 'MARCHING' | 'RALLYING' | 'PENDING';
  avatar: string;
  accountId?: string | null;
  teamId?: string | null;
  mtCastle?: number | null;
  mtNorth?: number | null;
  mtEast?: number | null;
  mtSouth?: number | null;
  mtWest?: number | null;
  customMarchTimes?: string | null;
  isMuted?: boolean;
}

export interface User {
  id: string;
  username: string;
  role: string;
  isVerified: boolean;
}

export interface ChatMessage {
  id: number;
  sender: string;
  message: string;
  timestamp: number;
  role: string;
  senderId?: string;
  isImportant?: boolean;
  isFromImportantAccount?: boolean;
}

export interface Rally {
  id: string;
  initiatorId: string;
  target: string;
  startTime: number;
  endTime: number;
  marchTime?: number;
  marchEndTime?: number;
}


export interface Team {
  id: string;
  name: string;
  isEnemy: boolean;
  players: Player[];
  selectedTarget?: string;
  landingTime?: string;
  rallyTime?: number;
  playerOffsets?: Record<string, number>;
}

export interface MapElement {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export interface MapLayout {
  id: string;
  name: string;
  isActive: boolean;
  isDefault: boolean;
  size: number;
  elements: string;
  blockZones: string;
}

export interface Landing {
  id: string;
  x: number;
  y: number;
  time: string;
  assignedTo: string;
  type?: string;
  rallyTime?: number;
  playerOffsets?: Record<string, number>;
}

interface GameState {
  socket: Socket | null;
  isConnected: boolean;
  players: Player[];
  chatLogs: ChatMessage[];
  rallies: Rally[];
  landings: Landing[];
  selectedTarget: { x: number; y: number } | null;
  selectedPlayerId: string | null;
  selectedBuilding: string | null;
  tickerMsg: string;
  serverTimeOffset: number; // Client Time - Server Time
  authError: string | null;
  user: User | null;
  users: User[];
  teams: Team[];
  alerts: { id: string; message: string; sender: string }[];
  isChatSilenced: boolean;
  importantAccounts: string[];
  maps: MapLayout[];
  activeMap: MapLayout | null;
  presence: Record<string, string>; // accountId -> 'online' | 'away' (absent = offline)

  soundVolume: number;
  soundMuted: boolean;

  setSoundVolume: (vol: number) => void;
  setSoundMuted: (muted: boolean) => void;
  togglePlayerMute: (playerId: string) => void;
  setAvailability: (status: 'online' | 'away') => void;

  connect: (token?: string) => void;
  disconnect: () => void;
  movePlayer: (playerId: string, x: number, y: number) => void;
  removePlayerFromMap: (playerId: string) => void;
  startRally: (initiatorId: string, target: string, duration: number) => void;
  sendMessage: (sender: string, message: string, role: string) => void;
  clearChat: () => void;

  selectTarget: (x: number, y: number) => void;
  setSelectedPlayerId: (id: string | null) => void;
  selectBuilding: (building: string | null) => void;
  createLanding: (x: number, y: number, time: string, assignedTo: string, type?: string, rallyTime?: number, playerOffsets?: Record<string, number>) => void;
  cancelLanding: (id: string) => void;
  isGroupingOpen: boolean;
  setGroupingOpen: (open: boolean) => void;
  sendGroupingPrepare: () => void;
  deployGroupingAttack: (landings: any[]) => void;
  setTickerMsg: (msg: string) => void;
  sendAlert: (msg: string) => void;
  removeAlert: (id: string) => void;
  toggleChatSilence: () => void;
  markMessageImportant: (messageId: number) => void;
  toggleImportantAccount: (accountId: string) => void;
  verifyOtp: (otp: string) => Promise<{success: boolean, user?: any, message?: string}>;
  fetchUsers: () => void;
  changePassword: (data: { username: string, oldPassword: string, newPassword: string }) => Promise<{ success: boolean; message?: string }>;

  // Admin & User Actions
  addUser: (data: any) => void;
  deleteUser: (userId: string) => void;
  addPlayer: (data: any) => void;
  deletePlayer: (playerId: string) => void;
  claimPlayer: (name: string) => Promise<{success: boolean, player?: any, message?: string}>;
  verifyPlayer: (playerId: string) => void;
  cancelRally: (rallyId: string) => void;
  toggleBlockUser: (userId: string) => void;
  updateMarchTimes: (playerId: string, mtCastle?: number | null, mtNorth?: number | null, mtEast?: number | null, mtSouth?: number | null, mtWest?: number | null, customMarchTimes?: Record<string, number | null>) => void;
  fetchTeams: () => void;
  createTeam: (name: string, isEnemy: boolean) => void;
  deleteTeam: (teamId: string) => void;
  assignPlayerToTeam: (playerId: string, teamId: string | null) => void;

  // Map actions
  fetchMaps: () => void;
  saveMap: (mapData: any) => void;
  deleteMap: (mapId: string) => void;
  setActiveMap: (mapId: string) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  socket: null,
  isConnected: false,
  players: [],
  chatLogs: [],
  rallies: [],
  landings: [],
  selectedTarget: null,
  selectedPlayerId: null,
  selectedBuilding: null,
  tickerMsg: 'ATTENTION: Enemy forces spotted near sector 7. Prepare defenses.',
  serverTimeOffset: 0,
  authError: null,
  user: null,
  users: [],
  teams: [],
  alerts: [],
  isChatSilenced: false,
  importantAccounts: [],
  maps: [],
  activeMap: null,
  presence: {},
  isGroupingOpen: false,

  setGroupingOpen: (open: boolean) => set({ isGroupingOpen: open }),

  soundVolume: typeof window !== 'undefined' && localStorage.getItem('soundVolume') ? parseFloat(localStorage.getItem('soundVolume')!) : 0.5,
  soundMuted: typeof window !== 'undefined' && localStorage.getItem('soundMuted') === 'true',

  setSoundVolume: (vol) => {
      set({ soundVolume: vol });
      if (typeof window !== 'undefined') localStorage.setItem('soundVolume', vol.toString());
  },

  setSoundMuted: (muted) => {
      set({ soundMuted: muted });
      if (typeof window !== 'undefined') localStorage.setItem('soundMuted', muted.toString());
  },

  togglePlayerMute: (playerId) => {
      get().socket?.emit('admin:toggle_player_mute', { playerId });
  },

  setAvailability: (status) => {
      get().socket?.emit('player:set_availability', { status });
  },

  connect: (token?: string) => {
    // If no token provided, try to find in args or local storage,
    // but typically connect is called with token now.
    // If socket exists, check if connected.

    let socket = get().socket;
    if (socket && socket.connected) return;

    if (!token) {
        // If no token, we can't authenticate.
        console.warn("Connect called without token");
        return;
    }

    if (!socket) {
        const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `http://${window.location.hostname}:3001` : 'http://localhost:3001');
        socket = io(socketUrl, {
            transports: ['websocket'],
            autoConnect: true,
            reconnection: true,
            auth: { token }
        });
        set({ socket });
    } else {
        // Update auth token if reused
        socket.auth = { token };
        socket.connect();
    }

    socket.on('connect', () => {
      console.log('Connected to socket server');
      set({ isConnected: true });
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from socket server');
      set({ isConnected: false });
    });

    socket.on('init_state', (data: any) => {
      const serverTime = data.serverTime;
      const clientTime = Date.now();
      const offset = clientTime - serverTime;

      set({
        players: data.players || [],
        teams: data.teams || [],
        chatLogs: data.chat || [],
        rallies: data.rallies || [],
        landings: data.landings || [],
        serverTimeOffset: offset,
        isChatSilenced: data.chatSilenced || false,
        importantAccounts: data.importantAccounts || [],
        activeMap: data.activeMap || null,
        presence: data.presence || {}
      });
    });

    socket.on('presence:update', (data: any) => {
        set({ presence: data.presence || {} });
    });

    socket.on('chat:silence_update', (data: any) => {
        set({ isChatSilenced: data.chatSilenced });
    });

    socket.on('chat:important_accounts_update', (data: any) => {
        set({ importantAccounts: data.importantAccounts });
    });

    socket.on('map:update', (data: any) => {
      if (data.players) set({ players: data.players });
    });

    socket.on('rally:update', (data: any) => {
      if (data.rallies) set({ rallies: data.rallies });
    });

    socket.on('landing:update', (data: any) => {
      if (data.landings) set({ landings: data.landings });
    });

    socket.on('notification', (data: any) => {
      if (data.message) set({ tickerMsg: data.message });
    });

    socket.on('notification:alert', (data: any) => {
        if (data.message) {
            set((state) => ({
                alerts: [...state.alerts, data],
                tickerMsg: `[ALERT] ${data.sender}: ${data.message}`
            }));
        }
    });

    socket.on('chat:update', (data: any) => {
      if (data.chat) set({ chatLogs: data.chat });
    });

    socket.on('admin:users_data', (data: any) => {
      if (data.users) set({ users: data.users });
    });

    socket.on('admin:teams_data', (data: any) => {
      if (data.teams) set({ teams: data.teams });
    });

    socket.on('admin:maps_data', (data: any) => {
      set({ maps: data.maps, activeMap: data.activeMap });
    });

    socket.on('map_layout:update', (data: any) => {
      set({ activeMap: data.activeMap });
    });

    socket.on('admin:map_created', (data: any) => {
        // We handle selection setting in the map component by watching maps list,
        // but we can also trigger a custom event or just let the maps_data update handle it.
    });

    socket.on('error', (data: any) => {
        console.error(data.message);
        notify(data.message, 'error');
    });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
    }
    set({ socket: null, isConnected: false });
  },

  movePlayer: (playerId: string, x: number, y: number) => {
    const { socket } = get();
    if (socket) {
      socket.emit('map:move', { playerId, x, y });
    }
  },

  removePlayerFromMap: (playerId: string) => {
    const { socket } = get();
    if (socket) {
      socket.emit('map:remove', { playerId });
    }
  },

  startRally: (initiatorId: string, target: string, duration: number) => {
    const { socket } = get();
    if (socket) {
      socket.emit('rally:start', { initiatorId, target, duration });
    }
  },

  sendMessage: (sender: string, message: string, role: string) => {
    const { socket } = get();
    if (socket) {
      socket.emit('chat:message', { sender, message, role });
    }
  },

  selectTarget: (x: number, y: number) => {
    set({ selectedTarget: { x, y } });
  },

  setSelectedPlayerId: (id: string | null) => {
    set({ selectedPlayerId: id });
  },

  selectBuilding: (building: string | null) => {
    set({ selectedBuilding: building });
  },

  createLanding: (x: number, y: number, time: string, assignedTo: string, type?: string, rallyTime?: number, playerOffsets?: Record<string, number>) => {
    const { socket } = get();
    if (socket) {
      socket.emit('landing:create', { x, y, time, assignedTo, type, rallyTime, playerOffsets });
    }
  },

  cancelLanding: (id: string) => {
    const { socket } = get();
    if (socket) {
      socket.emit('landing:cancel', { landingId: id });
    }
  },

  sendGroupingPrepare: () => {
    const { socket } = get();
    if (socket) {
      socket.emit('grouping:prepare');
    }
  },

  deployGroupingAttack: (landings: any[]) => {
    const { socket } = get();
    if (socket) {
      socket.emit('grouping:deploy', { landings });
    }
  },

  setTickerMsg: (msg: string) => {
    set({ tickerMsg: msg });
  },

  sendAlert: (msg: string) => {
    const { socket } = get();
    if (socket) {
      socket.emit('admin:alert', { message: msg });
    }
  },

  removeAlert: (id: string) => {
    set((state) => ({ alerts: state.alerts.filter((a) => a.id !== id) }));
  },

  toggleChatSilence: () => {
    const { socket } = get();
    if (socket) {
        socket.emit('admin:toggle_chat_silence');
    }
  },

  markMessageImportant: (messageId: number) => {
    const { socket } = get();
    if (socket) {
        socket.emit('admin:mark_message_important', { messageId });
    }
  },

  toggleImportantAccount: (accountId: string) => {
    const { socket } = get();
    if (socket) {
        socket.emit('admin:toggle_important_account', { accountId });
    }
  },

  clearChat: () => {
    const { socket } = get();
    if (socket) {
        socket.emit('chat:clear');
    }
  },

  verifyOtp: (otp: string) => {
      return new Promise((resolve) => {
          const { socket } = get();
          if (!socket) return resolve({ success: false, message: 'No connection' });

          const successHandler = (data: any) => {
            socket.off('auth:success', successHandler);
            socket.off('auth:error', errorHandler);
            set({ user: data.user }); // Update user in store
            resolve({ success: true, user: data.user });
          };

          const errorHandler = (data: any) => {
            socket.off('auth:success', successHandler);
            socket.off('auth:error', errorHandler);
            resolve({ success: false, message: data.message });
          };

          socket.on('auth:success', successHandler);
          socket.on('auth:error', errorHandler);

          socket.emit('auth:verify_otp', { otp });
      });
  },

  fetchUsers: () => {
      get().socket?.emit('admin:get_users');
  },

  changePassword: async (data) => {
      try {
          const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `http://${window.location.hostname}:3001` : 'http://localhost:3001');
          const response = await fetch(`${API_URL}/api/change-password`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
          });
          return await response.json();
      } catch (e) {
          return { success: false, message: 'Connection error' };
      }
  },

  addUser: (data) => {
      get().socket?.emit('admin:add_user', data);
  },

  deleteUser: (userId) => {
      get().socket?.emit('admin:delete_user', { userId });
  },

  addPlayer: (data) => {
      get().socket?.emit('admin:add_player', data);
  },

  deletePlayer: (playerId) => {
      get().socket?.emit('admin:delete_player', { playerId });
  },

  claimPlayer: (name) => {
      return new Promise((resolve) => {
          const { socket } = get();
          if (!socket) return resolve({ success: false, message: 'No connection' });

          const successHandler = (data: any) => {
              socket.off('user:player_claimed', successHandler);
              socket.off('error', errorHandler);
              resolve({ success: true, player: data.player });
          };

          const errorHandler = (data: any) => {
              socket.off('user:player_claimed', successHandler);
              socket.off('error', errorHandler);
              resolve({ success: false, message: data.message });
          };

          socket.on('user:player_claimed', successHandler);
          socket.on('error', errorHandler);

          socket.emit('user:claim_player', { name });
      });
  },

  verifyPlayer: (playerId) => {
      get().socket?.emit('admin:verify_player', { playerId });
  },

  cancelRally: (rallyId) => {
      get().socket?.emit('rally:cancel', { rallyId });
  },

  toggleBlockUser: (userId) => {
      get().socket?.emit('admin:toggle_block', { userId });
  },

  updateMarchTimes: (playerId, mtCastle, mtNorth, mtEast, mtSouth, mtWest, customMarchTimes) => {
      get().socket?.emit('player:update_march_times', {
          playerId, mtCastle, mtNorth, mtEast, mtSouth, mtWest, customMarchTimes
      });
  },

  fetchTeams: () => {
      get().socket?.emit('admin:get_teams');
  },

  createTeam: (name: string, isEnemy: boolean) => {
      get().socket?.emit('admin:create_team', { name, isEnemy });
  },

  deleteTeam: (teamId: string) => {
      get().socket?.emit('admin:delete_team', { teamId });
  },

  assignPlayerToTeam: (playerId: string, teamId: string | null) => {
      get().socket?.emit('admin:assign_player_to_team', { playerId, teamId });
  },

  fetchMaps: () => {
      get().socket?.emit('admin:get_maps');
  },

  saveMap: (mapData) => {
      get().socket?.emit('admin:save_map', mapData);
  },

  deleteMap: (mapId) => {
      get().socket?.emit('admin:delete_map', { id: mapId });
  },

  setActiveMap: (mapId) => {
      get().socket?.emit('admin:set_active_map', { id: mapId });
  }
}));
