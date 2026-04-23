import React, { useEffect, useState } from 'react';
import { useGameStore, Player } from '../store/useGameStore';
import { Shield, Sword, Activity, Settings, VolumeX, Volume2, Megaphone } from 'lucide-react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import TopBar from './TopBar';
import PlayerModal from './PlayerModal';
import { Swords } from 'lucide-react';

const PlayerCard = ({ player, isEnemy }: { player: Player; isEnemy: boolean }) => {
  const { setSelectedPlayerId, selectedBuilding, startRally, user, togglePlayerMute } = useGameStore();
  const statusColor = player.status === 'RALLYING' ? 'text-red-500 animate-pulse' :
                      player.status === 'MARCHING' ? 'text-yellow-500' : 'text-gray-400';

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('playerId', player.id);
    e.dataTransfer.effectAllowed = 'move';
    // Optional: Set drag image
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className={`
      relative flex items-center gap-3 p-3 mb-2 rounded border
      ${isEnemy ? 'border-danger/30 bg-danger/5' : 'border-accent/30 bg-accent/5'}
      hover:bg-white/5 transition-colors cursor-grab active:cursor-grabbing group
    `}>
      <div className="relative">
        <div className={`w-10 h-10 rounded-full overflow-hidden border-2 ${isEnemy ? 'border-danger' : 'border-accent'}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={player.avatar || `https://ui-avatars.com/api/?name=${player.name}`} alt={player.name} className="w-full h-full object-cover" />
        </div>
        {player.status !== 'IDLE' && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full animate-ping" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center">
          <span className={`font-bold text-sm truncate ${isEnemy ? 'text-red-200' : 'text-cyan-200'} ${player.isMuted ? 'line-through opacity-50' : ''}`}>
            {player.name}
          </span>
          <div className="flex items-center gap-1">
            {(user?.role === 'SUPERADMIN' || user?.role === 'ADMIN' || user?.role === 'COMMANDER') && (
                <button
                  onClick={(e) => { e.stopPropagation(); togglePlayerMute(player.id); }}
                  className={`p-0.5 rounded transition-colors ${player.isMuted ? 'text-red-500 bg-red-900/30 hover:bg-red-800/50' : 'text-gray-500 hover:text-white hover:bg-white/10'}`}
                  title={player.isMuted ? "Unmute Player" : "Mute Player"}
                >
                  {player.isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                </button>
            )}
            <span className="text-[10px] bg-black/40 px-1 rounded text-gray-400">{player.role}</span>
          </div>
        </div>
        <div className="flex justify-between items-center text-xs mt-1">
          <span className="text-gray-500">{player.power.toLocaleString()} PWR</span>
          <div className="flex items-center gap-1">
             {player.status === 'RALLYING' && <Sword className="w-3 h-3 text-red-500 animate-spin" />}
             <span className={`font-mono ${statusColor}`}>{player.status}</span>
          </div>
        </div>
      </div>

      {/* Rally Button */}
      <button
        onClick={() => {
          if (selectedBuilding) {
            startRally(player.id, selectedBuilding, 300000); // 5 minutes standard rally
          } else {
            setSelectedPlayerId(player.id);
          }
        }}
        className={`ml-2 p-1 rounded border transition-colors ${
          isEnemy
            ? 'bg-red-900/50 hover:bg-red-600 text-red-200 border-red-800'
            : 'bg-cyan-900/50 hover:bg-cyan-600 text-cyan-200 border-cyan-800'
        }`}
        title={selectedBuilding ? `Start Rally against ${selectedBuilding}` : "Open Commander Actions"}
      >
        <Swords size={16} />
      </button>
    </div>
  );
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const { players, connect, isConnected, user, selectTarget, alerts, removeAlert } = useGameStore();
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(288);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(288);

  const handleLeftResize = (e: React.MouseEvent) => {
    // Only resize if primary button is held
    if (e.buttons !== 1) return;
    const newWidth = e.clientX;
    if (newWidth > 150 && newWidth < 600) {
      setLeftSidebarWidth(newWidth);
    }
  };

  const handleRightResize = (e: React.MouseEvent) => {
     if (e.buttons !== 1) return;
     // Right sidebar width = Window Width - Mouse X
     const newWidth = window.innerWidth - e.clientX;
     if (newWidth > 150 && newWidth < 600) {
       setRightSidebarWidth(newWidth);
     }
  };

  const [utcTime, setUtcTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hh = String(now.getUTCHours()).padStart(2, '0');
      const mm = String(now.getUTCMinutes()).padStart(2, '0');
      const ss = String(now.getUTCSeconds()).padStart(2, '0');
      setUtcTime(`${hh}:${mm}:${ss}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const { socket } = useGameStore();

  useEffect(() => {
    // Skip check for login/otp pages
    if (pathname === '/login' || pathname === '/otp') {
      setAuthorized(true);
      return;
    }

    const userStr = localStorage.getItem('user');
    const token = localStorage.getItem('session_token');

    if (!userStr || !token) {
      router.push('/login');
    } else {
      // Restore user state immediately to avoid "Guest" flash
      try {
          useGameStore.setState({ user: JSON.parse(userStr) });
      } catch (e) { console.error(e); }

      setAuthorized(true);
      connect(token);
    }
  }, [connect, router, pathname]);

  useEffect(() => {
      if (socket) {
          socket.on('auth:change_password_required', () => {
              setMustChangePassword(true);
          });
          socket.on('auth:password_changed', () => {
              setMustChangePassword(false);
              alert('Password changed successfully.');
          });
      }
      return () => {
          socket?.off('auth:change_password_required');
          socket?.off('auth:password_changed');
      }
  }, [socket]);

  const handleSubmitNewPassword = () => {
      if (socket && user && newPassword) {
          socket.emit('auth:change_password', { userId: user.id, newPassword });
      }
  };

  const allies = players.filter(p => p.allianceId === 'ally');
  const enemies = players.filter(p => p.allianceId === 'enemy');

  // If on login page, render children only (skip layout chrome)
  if (pathname === '/login' || pathname === '/otp') {
    return <>{children}</>;
  }

  // Prevent flash of content
  if (!authorized) {
    return <div className="flex items-center justify-center h-screen w-screen bg-black text-cyan-500 font-mono animate-pulse">AUTHENTICATING...</div>;
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-[var(--background)] text-[var(--foreground)] overflow-hidden font-sans">
      {mustChangePassword && (
          <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center">
              <div className="bg-gray-900 border border-red-500 p-8 rounded shadow-2xl max-w-md w-full">
                  <h2 className="text-xl font-bold text-red-500 mb-4 flex items-center gap-2"><Shield className="w-5 h-5"/> SECURITY ALERT</h2>
                  <p className="text-gray-300 mb-6 text-sm">System policy requires you to change your password upon first login.</p>
                  <input
                      type="password"
                      placeholder="New Password"
                      className="w-full bg-black border border-gray-700 p-2 text-white mb-4 rounded focus:border-red-500 outline-none"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button
                      onClick={handleSubmitNewPassword}
                      className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-2 rounded"
                  >
                      UPDATE PASSWORD
                  </button>
              </div>
          </div>
      )}

      {/* Alerts Toast Overlay */}
      <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none">
        {alerts.map(alert => (
          <div key={alert.id} className="pointer-events-auto bg-red-900 border-2 border-red-500 text-white p-4 rounded shadow-2xl flex items-center gap-4 animate-in fade-in slide-in-from-top-4">
            <Megaphone className="w-6 h-6 text-red-500 animate-pulse" />
            <div className="flex flex-col">
              <span className="text-xs text-red-300 font-bold uppercase tracking-widest">{alert.sender}</span>
              <span className="font-mono text-lg">{alert.message}</span>
            </div>
            <button onClick={() => removeAlert(alert.id)} className="ml-4 text-red-400 hover:text-white">✕</button>
          </div>
        ))}
      </div>

      {/* Top Bar */}
      <header className="h-16 flex-none border-b border-[var(--grid)] bg-[var(--primary)] flex items-center px-6 justify-between shadow-lg z-50">
        <div className="flex items-center gap-4">
          <Shield className="w-8 h-8 text-accent animate-pulse" />
          <h1 className="text-xl font-black tracking-[0.2em] text-accent drop-shadow-[0_0_5px_rgba(0,240,255,0.5)]">
            COMMAND HUB <span className="text-xs font-normal opacity-50 ml-2 mr-4">v1.0.0</span>
            <span className="text-sm font-mono text-cyan-300 bg-black/50 px-3 py-1 rounded border border-cyan-800 shadow-[0_0_10px_rgba(0,255,255,0.2)]">
              {utcTime} UTC
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-6">
          {/* Navigation */}
          <nav className="flex items-center gap-4 text-sm font-bold text-gray-400">
            <Link href="/" className="hover:text-accent transition-colors">DASHBOARD</Link>
            {(user?.role === 'ADMIN' || user?.role === 'SUPERADMIN') && (
              <div className="group relative">
                <button className="flex items-center gap-1 hover:text-accent transition-colors py-4">
                  <Settings className="w-3 h-3" /> ADMIN
                </button>
                <div className="absolute top-full right-0 w-48 bg-gray-900 border border-gray-700 rounded shadow-xl hidden group-hover:block z-50">
                  <div className="absolute -top-2 left-0 w-full h-2 bg-transparent" /> {/* Bridge for hover */}
                  <Link href="/admin/users" className="block px-4 py-2 hover:bg-white/10 text-gray-300 hover:text-white">User Management</Link>
                  <Link href="/admin/players" className="block px-4 py-2 hover:bg-white/10 text-gray-300 hover:text-white">Player Management</Link>
                  <Link href="/admin/teams" className="block px-4 py-2 hover:bg-white/10 text-gray-300 hover:text-white">Team Management</Link>
                  <Link href="/admin/maps" className="block px-4 py-2 hover:bg-white/10 text-gray-300 hover:text-white">Map Builder</Link>
                </div>
              </div>
            )}
            <button
              onClick={() => {
                localStorage.removeItem('user');
                window.location.href = '/login';
              }}
              className="hover:text-red-400 transition-colors"
            >
              LOGOUT
            </button>
          </nav>

          {/* Status Indicator */}
          <div className="flex items-center gap-2 px-3 py-1 rounded bg-black/20 border border-[var(--grid)]">
            <Activity className={`w-4 h-4 ${isConnected ? 'text-green-500' : 'text-red-500'}`} />
            <span className={`text-xs font-mono ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
              {isConnected ? 'SYSTEM ONLINE' : 'DISCONNECTED'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden relative" onMouseUp={() => { /* Stop dragging could happen globally but mousemove handles it cleanly via e.buttons check */ }}>
        {/* Left Sidebar (Enemies) */}
        <aside
          style={{ width: leftSidebarWidth }}
          className="flex-none border-r border-[var(--grid)] bg-[var(--primary)] flex flex-col z-10 shadow-xl relative"
        >
          <div className="p-3 border-b border-[var(--grid)] bg-danger/10">
            <h2 className="text-sm font-bold text-danger tracking-widest flex items-center gap-2">
              <Sword className="w-4 h-4" /> ENEMY FORCES ({enemies.length})
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
            {enemies.map(p => (
              <PlayerCard key={p.id} player={p} isEnemy={true} />
            ))}
          </div>
          {/* Resizer Handle */}
          <div
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-cyan-500/50 z-50"
            onMouseMove={(e) => {
                // If parent has mousemove, we might not need it here, but usually we attach move to window or a larger container
            }}
            onMouseDown={(e) => {
               e.preventDefault();
               const moveHandler = (moveEvent: MouseEvent) => {
                   if (moveEvent.buttons !== 1) {
                       window.removeEventListener('mousemove', moveHandler);
                       return;
                   }
                   const newWidth = moveEvent.clientX;
                   if (newWidth > 150 && newWidth < 600) {
                     setLeftSidebarWidth(newWidth);
                   }
               };
               window.addEventListener('mousemove', moveHandler);
               window.addEventListener('mouseup', () => window.removeEventListener('mousemove', moveHandler), { once: true });
            }}
          />
        </aside>

        {/* Center Content (Map) */}
        <main className="flex-1 relative bg-[radial-gradient(circle_at_center,_#2c1221_0%,_#1a0b14_100%)] overflow-hidden flex flex-col">
          {/* Top Bar Overlay or Integrated */}
          <TopBar />
          <div className="flex-1 relative overflow-hidden">
             {children}
          </div>
        </main>

        {/* Right Sidebar (Allies) */}
        <aside
          style={{ width: rightSidebarWidth }}
          className="flex-none border-l border-[var(--grid)] bg-[var(--primary)] flex flex-col z-10 shadow-xl relative"
        >
           {/* Resizer Handle (Left side of this sidebar) */}
           <div
            className="absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-cyan-500/50 z-50"
            onMouseDown={(e) => {
               e.preventDefault();
               const moveHandler = (moveEvent: MouseEvent) => {
                   if (moveEvent.buttons !== 1) {
                       window.removeEventListener('mousemove', moveHandler);
                       return;
                   }
                   const newWidth = window.innerWidth - moveEvent.clientX;
                   if (newWidth > 150 && newWidth < 600) {
                     setRightSidebarWidth(newWidth);
                   }
               };
               window.addEventListener('mousemove', moveHandler);
               window.addEventListener('mouseup', () => window.removeEventListener('mousemove', moveHandler), { once: true });
            }}
          />

          <div className="p-3 border-b border-[var(--grid)] bg-accent/10">
            <h2 className="text-sm font-bold text-accent tracking-widest flex items-center gap-2">
              <Shield className="w-4 h-4" /> ALLIED FORCES ({allies.length})
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
            {allies.map(p => (
              <PlayerCard key={p.id} player={p} isEnemy={false} />
            ))}
          </div>
        </aside>
      </div>
      <PlayerModal />
    </div>
  );
}
