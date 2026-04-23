import React, { useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { Megaphone, Swords, Target, UserPlus, ShieldCheck, Volume2, VolumeX } from 'lucide-react';

export default function TopBar() {
  const { startRally, selectedTarget, selectedBuilding, createLanding, cancelLanding, tickerMsg, claimPlayer, players, user, teams, landings, soundVolume, soundMuted, setSoundVolume, setSoundMuted } = useGameStore();
  const [landingTime, setLandingTime] = useState('');
  const [assignedTo, setAssignedTo] = useState('');

  const myPlayer = user ? players.find(p => p.accountId === user.id) : null;


  const calculateStartTime = (landingTimeString: string, marchTimeSeconds: number | null | undefined) => {
    if (!landingTimeString || marchTimeSeconds == null) return '--:--:--';

    // Parse HH:MM:SS from string into current UTC date
    const parts = landingTimeString.split(':').map(Number);
    const hh = parts[0] || 0;
    const mm = parts[1] || 0;
    const ss = parts[2] || 0;
    const now = new Date();

    // Set target time today
    const targetTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm, ss));

    // If target time is before now, assume it's for tomorrow
    if (targetTime.getTime() < now.getTime()) {
       targetTime.setUTCDate(targetTime.getUTCDate() + 1);
    }

    // Subtract march time and 5 min rally (300s)
    const startTimeMs = targetTime.getTime() - (marchTimeSeconds * 1000) - (300 * 1000);
    const startDate = new Date(startTimeMs);

    const sHH = String(startDate.getUTCHours()).padStart(2, '0');
    const sMM = String(startDate.getUTCMinutes()).padStart(2, '0');
    const sSS = String(startDate.getUTCSeconds()).padStart(2, '0');

    return `${sHH}:${sMM}:${sSS}`;
  };

  const getMarchTime = (player: any) => {
      if (!selectedBuilding) return 0;
      switch(selectedBuilding) {
          case 'castle': return player.mtCastle || 0;
          case 'north_turret': return player.mtNorth || 0;
          case 'east_turret': return player.mtEast || 0;
          case 'south_turret': return player.mtSouth || 0;
          case 'west_turret': return player.mtWest || 0;
          default: return 0;
      }
  };

  const handleStartRally = () => {
    if (selectedBuilding && myPlayer) {
      startRally(myPlayer.id, selectedBuilding, 300000); // 5 mins
    } else if (!myPlayer) {
      alert("You must join the battle to start a rally.");
    } else {
      alert("Please select a building (Castle or Turret) to rally against.");
    }
  };


  const handleSetLanding = () => {
    if (selectedTarget && landingTime && assignedTo) {
      // Validate time
      const team = teams.find(t => t.name === assignedTo);
      if (team && team.players && team.players.length > 0) {
          const maxMarchTime = Math.max(...team.players.map(p => getMarchTime(p)));


          // Minimum required time is maxMarchTime + 5 mins (300s)
          const totalRequiredSeconds = maxMarchTime + 300;

          const now = new Date();
          const parts = landingTime.split(':').map(Number);
          const hh = parts[0] || 0;
          const mm = parts[1] || 0;
          const ss = parts[2] || 0;
          const targetTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm, ss));

          // Let's assume the user means "next available occurrence" of HH:MM
          // So if target is in the past TODAY, check if difference + 24h is enough
          let timeDiffMs = targetTime.getTime() - now.getTime();
          if (timeDiffMs < 0) {
              timeDiffMs += 24 * 60 * 60 * 1000;
          }

          if (timeDiffMs < totalRequiredSeconds * 1000) {
              alert(`Impossible landing time. Earliest possible landing requires ${totalRequiredSeconds} seconds from now.`);
              return;
          }
      }

      createLanding(selectedTarget.x, selectedTarget.y, landingTime, assignedTo, selectedBuilding || 'Custom Target');
      // Optional: Clear fields or give feedback
    } else {
      alert("Please select a target, time, and assignee.");
    }
  };

  const hasClaimedPlayer = user && players.some(p => p.accountId === user.id);

  const handleClaim = async () => {
      await claimPlayer(user?.username || 'Unknown');
  };



  return (
    <div className="flex flex-col w-full bg-black/80 border-b border-[var(--grid)] z-20">

      {/* Ticker */}
      <div className="bg-red-900/20 border-b border-red-900/30 py-1 px-4 flex items-center gap-2 overflow-hidden">
        <Megaphone className="w-4 h-4 text-red-500 animate-pulse flex-none" />
        <div className="whitespace-nowrap animate-[marquee_20s_linear_infinite] text-red-300 text-xs font-mono">
          {tickerMsg}
        </div>
      </div>

      {/* Control Panel */}
      <div className="flex items-center justify-between px-6 py-2 bg-[var(--primary)]">

        {/* User Info */}
        <div className="flex items-center gap-2 border-r border-white/10 pr-6 mr-6">
            <div className="flex flex-col items-end">
                <span className="text-[10px] text-cyan-500 font-bold uppercase tracking-widest">{user?.role || 'UNKNOWN'}</span>
                <span className="text-sm text-white font-mono font-bold">{user?.username || 'Guest'}</span>
            </div>
            {/* Audio Controls */}
            <div className="ml-4 flex items-center gap-2 pl-4 border-l border-white/10">
                <button
                  onClick={() => setSoundMuted(!soundMuted)}
                  className={`p-1 rounded transition-colors ${soundMuted ? 'text-red-500 hover:bg-red-900/20' : 'text-cyan-400 hover:bg-cyan-900/20'}`}
                  title={soundMuted ? "Unmute sounds" : "Mute sounds"}
                >
                  {soundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={soundVolume}
                  onChange={(e) => setSoundVolume(parseFloat(e.target.value))}
                  className="w-16 accent-cyan-500 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  title="Volume"
                />
            </div>
        </div>


        {/* Team Cards */}
        <div className="flex items-center gap-2">
          {teams.map(team => {
            const isSelected = assignedTo === team.name;
            const teamLanding = landings.find(l => l.assignedTo === team.name);
            const status = teamLanding ? 'RALLYING' : 'IDLE';

            return (
              <div
                key={team.id}
                onClick={() => setAssignedTo(isSelected ? '' : team.name)}
                className={`
                  flex flex-col items-center justify-center p-2 rounded border cursor-pointer transition-all
                  ${isSelected ? 'ring-2 ring-yellow-400 scale-105' : 'hover:bg-white/5'}
                  ${status === 'RALLYING'
                      ? 'border-yellow-500 bg-yellow-900/20'
                      : (team.isEnemy ? 'border-red-500/50 bg-red-900/10' : 'border-cyan-500/30 bg-cyan-900/10')}
                `}
              >
                <span className="text-[10px] text-gray-400 font-bold uppercase whitespace-nowrap">{team.name}</span>
                <span className={`text-[9px] font-mono ${status === 'RALLYING' ? 'text-yellow-400 animate-pulse' : (team.isEnemy ? 'text-red-400' : 'text-cyan-400')}`}>
                  {status}
                </span>
                {/* Player Start Times */}
                <div className="flex flex-col mt-1 w-full border-t border-white/10 pt-1 px-1">
                    {team.players?.map(p => {
                       // Use set landing time if exists, else the current input value for preview
                       const targetTimeStr = teamLanding ? teamLanding.time : (isSelected ? landingTime : null);
                       const mt = getMarchTime(p);
                       const startTimeStr = (targetTimeStr && mt > 0) ? calculateStartTime(targetTimeStr, mt) : '';

                       return (
                         <div key={p.id} className="flex justify-between items-center text-[9px] w-full gap-2">
                             <span className="text-gray-300 truncate max-w-[50px]">{p.name}</span>
                             <span className={`font-mono ${teamLanding ? 'text-yellow-400 font-bold' : 'text-gray-500'}`}>
                                 {startTimeStr}
                             </span>
                         </div>
                       );
                    })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Rally Controls (Commander Only - mocked) */}
        <div className="flex items-center gap-4 border-l border-white/10 pl-6">

          {/* Target Display */}
          <div className="flex flex-col min-w-[100px]">
             {/* Target coordinates display logic was here but it seems nested incorrectly or missing container in original broken file */}
          </div>

          {/* Claim Player Button if not claimed */}
          {!hasClaimedPlayer && (
              <button
                onClick={handleClaim}
                className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white font-bold text-sm rounded transition-all shadow-[0_0_15px_rgba(202,138,4,0.3)] active:scale-95"
              >
                  <UserPlus className="w-4 h-4" /> JOIN BATTLE
              </button>
          )}

          {hasClaimedPlayer && myPlayer && (
              <div className="flex items-center gap-2 px-4 py-1 bg-cyan-900/20 border border-cyan-800 rounded">
                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                  <div className="flex flex-col">
                      <span className="text-[10px] text-cyan-500 uppercase">Deployed As</span>
                      <span className="text-xs font-bold text-cyan-200">{myPlayer.name}</span>
                      {myPlayer.status === 'PENDING' && (
                           <span className="text-[10px] text-yellow-500 font-bold animate-pulse">PENDING APPROVAL</span>
                      )}
                  </div>
              </div>
          )}

          <div className="w-px h-8 bg-white/10 mx-2" />

          <div className="flex flex-col">
             <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1">
               <Target className="w-3 h-3" /> Target
             </label>
             <span className="text-xs font-mono text-yellow-400">
               {selectedTarget ? `[${selectedTarget.x}, ${selectedTarget.y}]` : 'NO TARGET'}
             </span>
          </div>

          {/* Time Input */}
          <div className="flex flex-col">
             <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Time</label>
             <input
               type="time"
               step="1"
               value={landingTime}
               onChange={(e) => setLandingTime(e.target.value)}
               className="bg-black/50 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:border-cyan-500 outline-none font-mono w-24"
             />
          </div>

          {/* Assignee Input */}
          <div className="flex flex-col">
             <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Assign To</label>
             <input
               type="text"
               value={assignedTo}
               onChange={(e) => setAssignedTo(e.target.value)}
               placeholder="Team/Player"
               className="bg-black/50 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:border-cyan-500 outline-none font-mono w-32"
             />
          </div>


          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleSetLanding}
              disabled={!selectedTarget || !landingTime || !assignedTo}
              className={`
                flex items-center gap-2 px-3 py-2 text-white font-bold text-xs rounded transition-all shadow-lg active:scale-95
                ${(!selectedTarget || !landingTime || !assignedTo)
                  ? 'bg-gray-700 cursor-not-allowed opacity-50'
                  : 'bg-yellow-600 hover:bg-yellow-500 shadow-yellow-900/50'}
              `}
            >
              <Target className="w-3 h-3" />
              SET LANDING
            </button>

            {assignedTo && landings.find(l => l.assignedTo === assignedTo) && (
                <button
                  onClick={() => {
                      const l = landings.find(l => l.assignedTo === assignedTo);
                      if (l) cancelLanding(l.id);
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-red-900 hover:bg-red-800 border border-red-500 text-red-200 font-bold text-xs rounded transition-all shadow-lg active:scale-95"
                >
                  CANCEL
                </button>
            )}

            <button
              onClick={handleStartRally}
              disabled={!selectedBuilding || !myPlayer}
              className={`flex items-center gap-2 px-3 py-2 font-bold text-xs rounded transition-all shadow-lg active:scale-95 ${(!selectedBuilding || !myPlayer) ? 'bg-gray-700 cursor-not-allowed opacity-50 text-gray-400' : 'bg-red-600 hover:bg-red-500 text-white shadow-[0_0_15px_rgba(220,38,38,0.5)]'}`}
              title={selectedBuilding ? `Start rally against ${selectedBuilding}` : "Select a building to rally"}
            >
              <Swords className="w-3 h-3" />
              RALLY
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
