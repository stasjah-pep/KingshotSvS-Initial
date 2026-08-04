import React, { useEffect, useState } from 'react';
import { useGameStore, Rally } from '../store/useGameStore';
import { Timer, X } from 'lucide-react';

const RallyItem = ({ rally, isEnemy }: { rally: Rally, isEnemy: boolean }) => {
  const [timeLeft, setTimeLeft] = useState(0);
  const [isMarching, setIsMarching] = useState(false);
  const { serverTimeOffset, cancelRally, user, players } = useGameStore();

  useEffect(() => {
    const update = () => {
      // Calculate current server time
      const currentServerTime = Date.now() - serverTimeOffset;
      // Calculate time remaining based on server time

      if (currentServerTime <= rally.endTime) {
         // We are in rally phase
         setIsMarching(false);
         const left = Math.max(0, rally.endTime - currentServerTime);
         setTimeLeft(left);
      } else if (rally.marchEndTime && currentServerTime > rally.endTime && currentServerTime <= rally.marchEndTime) {
         // We are in marching phase
         setIsMarching(true);
         const left = Math.max(0, rally.marchEndTime - currentServerTime);
         setTimeLeft(left);
      } else {
         // Event over
         setIsMarching(false);
         setTimeLeft(0);
      }
    };
    update(); // Initial
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [rally.endTime, rally.marchEndTime, serverTimeOffset]);

  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getLandingTimeStr = () => {
     if (!rally.marchEndTime && !rally.endTime) return '';

     // The target time is marchEndTime if it exists, otherwise endTime
     const targetTimestamp = rally.marchEndTime || rally.endTime;

     // Convert to UTC time string
     const d = new Date(targetTimestamp);
     const hh = d.getUTCHours().toString().padStart(2, '0');
     const mm = d.getUTCMinutes().toString().padStart(2, '0');
     const ss = d.getUTCSeconds().toString().padStart(2, '0');
     return `${hh}:${mm}:${ss}`;
  };

  if (timeLeft <= 0) return null;

  // Check if current user can cancel
  const initiator = players.find(p => p.id === rally.initiatorId);
  const canCancel = user?.role === 'SUPERADMIN' || (initiator && initiator.accountId === user?.id);

  const baseBorderColor = isEnemy ? 'border-red-500/50' : 'border-cyan-500/50';
  const baseShadowColor = isEnemy ? 'shadow-[0_0_10px_rgba(255,0,0,0.3)]' : 'shadow-[0_0_10px_rgba(0,255,255,0.3)]';
  const baseIconBg = isEnemy ? 'bg-red-500/20' : 'bg-cyan-500/20';
  const baseIconColor = isEnemy ? 'text-red-400' : 'text-cyan-400';
  const baseTextColor = isEnemy ? 'text-red-300' : 'text-cyan-300';
  const baseDropShadow = isEnemy ? 'drop-shadow-[0_0_5px_rgba(255,0,0,1)]' : 'drop-shadow-[0_0_5px_rgba(0,255,255,1)]';

  const borderColor = isMarching ? 'border-yellow-500' : baseBorderColor;
  const shadowColor = isMarching ? 'shadow-[0_0_20px_rgba(255,255,0,0.5)]' : baseShadowColor;
  const iconBg = isMarching ? 'bg-yellow-500/20' : baseIconBg;
  const iconColor = isMarching ? 'text-yellow-400' : baseIconColor;
  const textColor = isMarching ? 'text-yellow-300' : baseTextColor;
  const dropShadow = isMarching ? 'drop-shadow-[0_0_8px_rgba(255,255,0,1)]' : baseDropShadow;
  const scaleEffect = isMarching ? 'scale-105 transition-transform duration-500' : '';
  const pulseEffect = isMarching ? 'animate-[pulse_1.6s_ease-in-out_infinite]' : '';

  return (
    <div className={`flex items-center justify-between gap-4 p-2 bg-black/60 border ${borderColor} rounded backdrop-blur-sm ${shadowColor} ${pulseEffect} ${scaleEffect}`}>
      <div className="flex items-center gap-2">
        <div className={`p-1 ${iconBg} rounded`}>
          <Timer className={`w-4 h-4 ${iconColor}`} />
        </div>
        <div className="flex flex-col leading-tight">
          <span className={`text-[10px] ${textColor} font-bold uppercase tracking-wider`}>
            {isMarching ? `MARCHING TO ${rally.target}` : `RALLY VS ${rally.target}`}
          </span>
          <span className="text-[10px] text-gray-400">Lead: {initiator?.name || 'Unknown'}</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-end">
            <span className={`text-[10px] ${textColor} uppercase tracking-widest font-bold`}>
                LANDING: {getLandingTimeStr()}
            </span>
            <span className={`text-xl font-mono font-black text-white ${dropShadow} tracking-widest leading-none mt-1`}>
              {formatTime(timeLeft)}
            </span>
        </div>
        {canCancel && (
            <button
              onClick={() => cancelRally(rally.id)}
              className="p-1 hover:bg-white/20 rounded-full transition-colors pointer-events-auto"
              title="Cancel Rally"
            >
                <X className={`w-4 h-4 ${iconColor} hover:text-white`} />
            </button>
        )}
      </div>
    </div>
  );
};

export default function RallyTimers() {
  const { rallies, players } = useGameStore();

  if (rallies.length === 0) return null;

  const enemyRallies = rallies.filter(r => {
      const p = players.find(p => p.id === r.initiatorId);
      return p?.allianceId === 'enemy';
  });

  const alliedRallies = rallies.filter(r => {
      const p = players.find(p => p.id === r.initiatorId);
      return p?.allianceId !== 'enemy';
  });

  return (
    <>
      <div className="absolute top-4 left-4 z-30 flex flex-col gap-2 pointer-events-none">
         {enemyRallies.map((r, i) => (
           <div key={`enemy-${i}`} className="pointer-events-auto">
             <RallyItem rally={r} isEnemy={true} />
           </div>
         ))}
      </div>

      <div className="absolute top-4 right-4 z-30 flex flex-col gap-2 pointer-events-none">
         {alliedRallies.map((r, i) => (
           <div key={`ally-${i}`} className="pointer-events-auto">
             <RallyItem rally={r} isEnemy={false} />
           </div>
         ))}
      </div>
    </>
  );
}
