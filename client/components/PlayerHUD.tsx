import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useGameStore } from '../store/useGameStore';
import { Swords, Target, Clock, AlertTriangle, ShieldCheck, UserPlus, X, Play, Minus } from 'lucide-react';
import { launchMsFromLanding, formatUtcHMS } from '../lib/launchTime';

export default function PlayerHUD() {
  const { 
    players, 
    user, 
    teams, 
    landings, 
    startRally, 
    cancelRally,
    serverTimeOffset, 
    soundVolume, 
    soundMuted, 
    claimPlayer 
  } = useGameStore();

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [urgency, setUrgency] = useState<'standby' | 'warning' | 'urgent' | 'launch'>('standby');
  const [isMinimized, setIsMinimized] = useState(false);

  // Audio trigger locks
  const played10sRef = useRef(false);
  const played5sRef = useRef(false);
  const played4sRef = useRef(false);
  const played3sRef = useRef(false);
  const played2sRef = useRef(false);
  const played1sRef = useRef(false);
  const played0sRef = useRef(false);

  // Mapped logged in player
  const myPlayer = useMemo(() => {
    return user ? players.find(p => p.accountId === user.id) : null;
  }, [user, players]);

  // Player's allied team
  const myTeam = useMemo(() => {
    if (!myPlayer) return null;
    return teams.find(t => t.players.some(p => p.id === myPlayer.id));
  }, [myPlayer, teams]);

  // Landing assigned to team or player
  const myLanding = useMemo(() => {
    if (!myPlayer) return null;
    // 1. Check direct player landing or player offset
    const directLanding = landings.find(l => l.assignedTo === myPlayer.name || (l.playerOffsets && l.playerOffsets[myPlayer.id] !== undefined));
    if (directLanding) return directLanding;

    // 2. Check team landing
    if (myTeam) {
      const teamLanding = landings.find(l => l.assignedTo === myTeam.name);
      if (teamLanding) return teamLanding;
    }

    return null;
  }, [myPlayer, myTeam, landings]);

  const getMarchTime = (player: any, buildingType: string | undefined) => {
    if (!buildingType) return 0;
    const bt = buildingType.toLowerCase().replace(/ /g, '_');
    if (bt.includes('castle')) return player.mtCastle || 0;
    if (bt.includes('north')) return player.mtNorth || 0;
    if (bt.includes('east')) return player.mtEast || 0;
    if (bt.includes('south')) return player.mtSouth || 0;
    if (bt.includes('west')) return player.mtWest || 0;
    return 0;
  };

  const playTone = (type: 'beep' | 'launch') => {
    if (soundMuted || typeof window === 'undefined') return;
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      gainNode.gain.value = soundVolume * 1.5; // Boost slightly for warnings

      const now = ctx.currentTime;
      if (type === 'beep') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now); // A5 note
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'launch') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1000, now);
        osc.frequency.exponentialRampToValueAtTime(1500, now + 0.5);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
      }
    } catch (e) {
      console.warn("HUD audio context failed:", e);
    }
  };

  // Launch timing math (shared calculator — client/lib/launchTime.ts)
  const launchTimeMs = useMemo(() => {
    if (!myLanding || !myPlayer) return null;

    const marchTimeSec = getMarchTime(myPlayer, myLanding.type || 'castle');
    const rallyTimeSec = myLanding.rallyTime || (myTeam?.rallyTime) || 300;
    const offsetSec = (myLanding.playerOffsets?.[myPlayer.id]) || (myTeam?.playerOffsets?.[myPlayer.id]) || 0;

    // Returns null when this player's march time is missing.
    return launchMsFromLanding(myLanding.time, { marchSec: marchTimeSec, rallySec: rallyTimeSec, offsetSec });
  }, [myLanding, myPlayer, myTeam]);

  // High precision timer loop (100ms)
  useEffect(() => {
    if (!launchTimeMs) {
      setTimeLeft(null);
      setUrgency('standby');
      played10sRef.current = false;
      played5sRef.current = false;
      played4sRef.current = false;
      played3sRef.current = false;
      played2sRef.current = false;
      played1sRef.current = false;
      played0sRef.current = false;
      return;
    }

    const update = () => {
      const currentServerTime = Date.now() - serverTimeOffset;
      const diff = launchTimeMs - currentServerTime;
      setTimeLeft(diff);

      if (diff <= 0) {
        setUrgency('launch');
        if (!played0sRef.current && diff > -5000) {
          played0sRef.current = true;
          playTone('launch');
        }
      } else if (diff <= 10000) {
        setUrgency('urgent');
        
        // precise count beeps
        const sec = Math.ceil(diff / 1000);
        if (sec === 10 && !played10sRef.current) { played10sRef.current = true; playTone('beep'); }
        else if (sec === 5 && !played5sRef.current) { played5sRef.current = true; playTone('beep'); }
        else if (sec === 4 && !played4sRef.current) { played4sRef.current = true; playTone('beep'); }
        else if (sec === 3 && !played3sRef.current) { played3sRef.current = true; playTone('beep'); }
        else if (sec === 2 && !played2sRef.current) { played2sRef.current = true; playTone('beep'); }
        else if (sec === 1 && !played1sRef.current) { played1sRef.current = true; playTone('beep'); }
      } else if (diff <= 60000) {
        setUrgency('warning');
      } else {
        setUrgency('standby');
      }
    };

    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [launchTimeMs, serverTimeOffset]);

  const formatCountdown = (ms: number) => {
    const isNeg = ms < 0;
    const absMs = Math.abs(ms);
    
    if (isNeg && absMs > 10000) return 'LAUNCH OVERDUE';
    if (isNeg) return 'LAUNCH NOW!';

    const totalSeconds = Math.floor(absMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const tenths = Math.floor((absMs % 1000) / 100);

    const mStr = String(minutes).padStart(2, '0');
    const sStr = String(seconds).padStart(2, '0');
    return `${mStr}:${sStr}.${tenths}`;
  };

  const getLaunchTimeStr = () => {
    if (!launchTimeMs) return '';
    return `${formatUtcHMS(launchTimeMs)} UTC`;
  };

  const handleQuickLaunch = () => {
    if (!myPlayer || !myLanding || !myTeam) return;
    const rallyDurationMs = (myTeam.rallyTime || 300) * 1000;
    startRally(myPlayer.id, myLanding.type || 'castle', rallyDurationMs);
  };

  const handleClaimProfile = async () => {
    await claimPlayer(user?.username || 'Player');
  };

  // Border and Shadow Glow classes based on urgency
  const getGlowStyles = () => {
    // Urgency reads through colour, not a blinking card — only the countdown number animates.
    switch (urgency) {
      case 'launch':
        return 'border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.4)] bg-green-950/85 text-white';
      case 'urgent':
        return 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)] bg-red-950/80 text-white';
      case 'warning':
        return 'border-yellow-500/70 shadow-[0_0_12px_rgba(234,179,8,0.25)] bg-yellow-950/40 text-gray-100';
      case 'standby':
      default:
        return 'border-cyan-500/40 shadow-[0_0_16px_rgba(6,182,212,0.12)] bg-black/85 text-gray-200';
    }
  };

  const activeRally = useMemo(() => {
    if (!myPlayer) return null;
    return useGameStore.getState().rallies.find(r => r.initiatorId === myPlayer.id);
  }, [myPlayer]);

  // If not logged in as a player yet
  if (!myPlayer) {
    if (isMinimized) {
      return (
        <div 
          onClick={() => setIsMinimized(false)}
          className="absolute bottom-4 right-4 z-40 border border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.4)] bg-black/90 text-white rounded-full px-4 py-2 flex items-center gap-3 cursor-pointer hover:bg-yellow-950/40 hover:scale-105 transition-all select-none font-sans"
        >
          <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
          <span className="text-xs font-bold text-yellow-500 uppercase tracking-widest text-[10px]">UNREGISTERED PROFILE</span>
          <span className="text-[10px] text-yellow-400 bg-yellow-950/60 border border-yellow-800/50 px-1.5 py-0.5 rounded font-mono font-bold hover:text-white">
            EXPAND ≫
          </span>
        </div>
      );
    }
    return (
      <div className="absolute bottom-4 right-4 z-40 bg-black/90 border border-yellow-500/50 rounded-lg p-4 w-72 backdrop-blur-md shadow-2xl flex flex-col gap-3 font-sans">
        <div className="flex items-center justify-between text-yellow-500">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-xs font-bold uppercase tracking-wider">Unregistered Profile</span>
          </div>
          <button
            onClick={() => setIsMinimized(true)}
            className="text-gray-400 hover:text-white p-0.5 rounded transition-colors"
            title="Minimize HUD"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[11px] text-gray-400">You must claim a battle profile to configure launch buffers and dynamic countdown calculations.</p>
        <button
          onClick={handleClaimProfile}
          className="bg-yellow-600 hover:bg-yellow-500 text-black text-xs font-bold py-2 rounded flex items-center justify-center gap-1 transition-all shadow shadow-yellow-900/50"
        >
          <UserPlus className="w-3.5 h-3.5" /> CLAIM BATTLE PROFILE
        </button>
      </div>
    );
  }

  // If no target has been set for the team
  if (!myLanding) {
    if (isMinimized) {
      return (
        <div 
          onClick={() => setIsMinimized(false)}
          className="absolute bottom-4 right-4 z-40 border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.4)] bg-black/90 text-white rounded-full px-4 py-2 flex items-center gap-3 cursor-pointer hover:bg-cyan-950/40 hover:scale-105 transition-all select-none font-sans"
        >
          <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest text-[10px]">HUD IDLE: {myPlayer.name}</span>
          <span className="text-[10px] text-cyan-400 bg-cyan-950 border border-cyan-800/50 px-1.5 py-0.5 rounded font-mono font-bold hover:text-white">
            EXPAND ≫
          </span>
        </div>
      );
    }
    return (
      <div className="absolute bottom-4 right-4 z-40 bg-black/85 border border-cyan-500/30 rounded-lg p-4 w-72 backdrop-blur-md shadow-lg flex flex-col gap-3 font-sans">
        <div className="flex items-center justify-between text-xs text-cyan-400 border-b border-white/10 pb-2">
          <div className="flex items-center gap-1.5 font-bold uppercase tracking-widest">
            <ShieldCheck className="w-4 h-4" /> Deployed Profile
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 font-mono">IDLE</span>
            <button
              onClick={() => setIsMinimized(true)}
              className="text-gray-500 hover:text-white p-0.5 rounded transition-colors"
              title="Minimize HUD"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-bold text-white truncate">{myPlayer.name}</span>
          <span className="text-[10px] text-gray-500">{myPlayer.role}</span>
        </div>
        <div className="h-px bg-white/5 w-full" />
        <p className="text-[11px] text-gray-500 text-center italic">Awaiting commander landing order... Standby.</p>
      </div>
    );
  }

  // Active landing exists
  const marchTime = getMarchTime(myPlayer, myLanding.type || 'castle');
  const sequenceDelay = myTeam?.playerOffsets?.[myPlayer.id] || 0;
  const rallyTime = myTeam?.rallyTime || 300;

  // Guard: a missing march time silently computes as 0 and yields a wrong launch time.
  if (marchTime <= 0) {
    return (
      <div className="absolute bottom-4 right-4 z-40 bg-black/90 border border-yellow-500/60 rounded-lg p-4 w-72 backdrop-blur-md shadow-2xl flex flex-col gap-3 font-sans">
        <div className="flex items-center gap-2 text-yellow-500">
          <AlertTriangle className="w-5 h-5" />
          <span className="text-xs font-bold uppercase tracking-wider">March Time Missing</span>
        </div>
        <p className="text-[11px] text-gray-400 leading-relaxed">
          A landing on <span className="text-yellow-400 font-bold uppercase">{myLanding.type || 'Castle'}</span> is set for <span className="text-white font-mono">{myLanding.time} UTC</span>, but your march time to this target isn&apos;t set — so your launch time can&apos;t be calculated. Set it on the map building or in your profile.
        </p>
      </div>
    );
  }

  if (isMinimized) {
    const pillGlowStyle = 
      urgency === 'launch' ? 'border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.6)] bg-green-950/95' :
      urgency === 'urgent' ? 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)] bg-red-950/95 animate-pulse' :
      urgency === 'warning' ? 'border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.4)] bg-yellow-950/90' :
      'border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.3)] bg-black/95';

    return (
      <div 
        onClick={() => setIsMinimized(false)}
        className={`absolute bottom-4 right-4 z-40 border px-4 py-2.5 rounded-full flex items-center gap-3 cursor-pointer hover:scale-105 transition-all select-none font-sans text-white ${pillGlowStyle}`}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${urgency === 'launch' ? 'bg-green-400 animate-ping' : urgency === 'urgent' ? 'bg-red-500 animate-ping' : urgency === 'warning' ? 'bg-yellow-400' : 'bg-cyan-400 animate-pulse'}`} />
        <div className="flex items-center gap-2 text-xs">
          <span className="font-bold text-cyan-400 uppercase tracking-widest text-[9px] truncate max-w-[80px]">{myLanding.type || 'Castle'}:</span>
          {timeLeft !== null ? (
            <div className="flex flex-col items-start leading-none">
              <span className="font-mono font-black text-sm tracking-wider text-white">
                {formatCountdown(timeLeft)}
              </span>
              <span className="text-[8px] text-cyan-300/80 font-mono mt-0.5 whitespace-nowrap">
                Launch: {getLaunchTimeStr().replace(' UTC', '')}
              </span>
            </div>
          ) : (
            <span className="text-[10px] text-gray-400 italic">--:--.-</span>
          )}
        </div>
        <span className="text-[9px] text-cyan-400 bg-cyan-950 border border-cyan-800/50 px-1.5 py-0.5 rounded font-mono font-bold hover:text-white shrink-0">
          EXPAND ≫
        </span>
      </div>
    );
  }

  const countdownColor =
    urgency === 'launch' ? 'text-green-400' :
    urgency === 'urgent' ? 'text-red-400' :
    urgency === 'warning' ? 'text-yellow-300' : 'text-white';

  return (
    <div className={`absolute bottom-4 right-4 z-40 border rounded-xl p-4 w-72 backdrop-blur-md transition-colors duration-300 flex flex-col gap-3 font-sans ${getGlowStyles()}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-400">
          <Target className="w-4 h-4" /> Tactical HUD
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-cyan-950/70 text-cyan-300 border border-cyan-800/60 px-2 py-0.5 rounded-full font-mono font-bold tracking-wide">
            {myPlayer.status}
          </span>
          <button
            onClick={() => setIsMinimized(true)}
            className="text-gray-400 hover:text-white p-0.5 rounded transition-colors"
            title="Minimize HUD"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Who */}
      <div className="flex flex-col leading-tight">
        <span className="text-base font-bold text-white truncate">{myPlayer.name}</span>
        <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">{myTeam?.name || 'NO TEAM'} • {myPlayer.role}</span>
      </div>

      {/* Hero countdown */}
      <div className="flex flex-col items-center gap-0.5 py-3 rounded-lg bg-black/50 border border-white/10">
        <span className="text-[10px] text-gray-400 uppercase tracking-[0.2em] font-bold flex items-center gap-1">
          <Clock className="w-3 h-3" /> Launch in
        </span>
        <span className={`font-mono font-black leading-none tabular-nums tracking-tight text-[2.75rem] ${countdownColor}`}>
          {timeLeft !== null ? formatCountdown(timeLeft) : '--:--.-'}
        </span>
        <span className="text-[10px] text-cyan-300/90 font-mono">
          Launch window {getLaunchTimeStr()}
        </span>
      </div>

      {/* Details */}
      <div className="rounded-lg border border-white/10 bg-black/40 divide-y divide-white/5 text-[12px]">
        <div className="flex justify-between items-center px-3 py-1.5">
          <span className="text-gray-400">Target</span>
          <span className="text-yellow-400 font-bold uppercase font-mono">{myLanding.type || 'Castle'}</span>
        </div>
        <div className="flex justify-between items-center px-3 py-1.5">
          <span className="text-gray-400">Hit time</span>
          <span className="text-white font-mono">{myLanding.time} UTC</span>
        </div>
        <div className="flex justify-between items-center px-3 py-2 bg-cyan-500/10">
          <span className="text-cyan-300 font-semibold">Your launch</span>
          <span className="text-cyan-200 font-mono font-bold text-[13px]">{getLaunchTimeStr()}</span>
        </div>
        <div className="flex justify-between items-center px-3 py-1.5">
          <span className="text-gray-400">March · delay · rally</span>
          <span className="text-gray-200 font-mono tabular-nums">{`${marchTime}s · +${sequenceDelay}s · ${Math.floor(rallyTime / 60)}:${String(rallyTime % 60).padStart(2, '0')}`}</span>
        </div>
      </div>

      {/* Action */}
      {myPlayer.status === 'IDLE' ? (
        <button
          onClick={handleQuickLaunch}
          disabled={urgency === 'standby'}
          className={`w-full py-2.5 rounded-lg font-black text-sm flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
            urgency === 'standby'
              ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700'
              : urgency === 'launch'
              ? 'bg-green-600 hover:bg-green-500 text-black border border-green-400 animate-[pulse_1.4s_ease-in-out_infinite]'
              : 'bg-red-600 hover:bg-red-500 text-white border border-red-400'
          }`}
        >
          <Swords className="w-4 h-4" />
          {urgency === 'launch' ? 'LAUNCH RALLY NOW' : 'LAUNCH CO-OP RALLY'}
        </button>
      ) : activeRally ? (
        <button
          onClick={() => cancelRally(activeRally.id)}
          className="w-full py-2 bg-red-950 border border-red-800 hover:bg-red-900 text-red-200 font-bold text-xs rounded-lg transition-all"
        >
          CANCEL ACTIVE RALLY
        </button>
      ) : (
        <div className="text-[11px] text-gray-500 text-center italic py-2">
          Rally in progress — watch the map indicators.
        </div>
      )}
    </div>
  );
}
