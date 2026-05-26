import React, { useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { Megaphone, Swords, Target, UserPlus, ShieldCheck, Volume2, VolumeX } from 'lucide-react';

export default function TopBar() {
  const { startRally, selectedTarget, selectedBuilding, createLanding, cancelLanding, tickerMsg, claimPlayer, players, user, teams, landings, soundVolume, soundMuted, setSoundVolume, setSoundMuted } = useGameStore();
  const [landingTime, setLandingTime] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [rallyDurationSec, setRallyDurationSec] = useState(300); // 5 min default
  const [playerOffsets, setPlayerOffsets] = useState<Record<string, number>>({});
  const [showSequencePlanner, setShowSequencePlanner] = useState(false);
  const [copiedTeamId, setCopiedTeamId] = useState<string | null>(null);

  const myPlayer = user ? players.find(p => p.accountId === user.id) : null;


  const calculateStartTime = (landingTimeString: string, marchTimeSeconds: number | null | undefined, rallyTimeSeconds: number = 300, offsetSeconds: number = 0) => {
    if (!landingTimeString || marchTimeSeconds == null) return '--:--:--';

    // Parse HH:MM:SS from string into current UTC date
    const parts = landingTimeString.split(':').map(Number);
    const hh = parts[0] || 0;
    const mm = parts[1] || 0;
    const ss = parts[2] || 0;
    const now = new Date();

    // Set target time today
    const targetTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm, ss));

    // If target time is before now, assume it's for tomorrow (or within 10m buffer)
    if (targetTime.getTime() < now.getTime() - 600 * 1000) {
       targetTime.setUTCDate(targetTime.getUTCDate() + 1);
    }

    // Launch Time = Target Hit Time + playerOffset - marchTime - rallyTime
    const startTimeMs = targetTime.getTime() + (offsetSeconds * 1000) - (marchTimeSeconds * 1000) - (rallyTimeSeconds * 1000);
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

          // Minimum required time is maxMarchTime + rallyDurationSec
          const totalRequiredSeconds = maxMarchTime + rallyDurationSec;

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

      createLanding(
        selectedTarget.x,
        selectedTarget.y,
        landingTime,
        assignedTo,
        selectedBuilding || 'Custom Target',
        rallyDurationSec,
        playerOffsets
      );
      setShowSequencePlanner(false);
    } else {
      alert("Please select a target, time, and assignee.");
    }
  };

  const hasClaimedPlayer = user && players.some(p => p.accountId === user.id);

  const handleClaim = async () => {
      await claimPlayer(user?.username || 'Unknown');
  };

  const handleCopyPlan = (team: any, teamLanding: any) => {
    const targetTimeStr = teamLanding ? teamLanding.time : (assignedTo === team.name ? landingTime : null);
    let buildingType = teamLanding ? teamLanding.type : (assignedTo === team.name ? (selectedBuilding || 'Custom Target') : 'Custom Target');
    // Simplify building names to keep characters short
    if (buildingType === 'north_turret') buildingType = 'North Turret';
    else if (buildingType === 'east_turret') buildingType = 'East Turret';
    else if (buildingType === 'south_turret') buildingType = 'South Turret';
    else if (buildingType === 'west_turret') buildingType = 'West Turret';
    else if (buildingType === 'castle') buildingType = 'Castle';

    const rallyTimeSec = teamLanding ? (team.rallyTime || 300) : rallyDurationSec;

    if (!targetTimeStr) return;

    // Helper to build text with varying levels of detail/truncation to ensure it fits under 500 chars
    const buildPlanText = (truncateNameLen?: number) => {
      let text = `⚔️ SVS PLAN: ${team.name.toUpperCase()} ⚔️\n`;
      text += `🎯 Target: ${buildingType.toUpperCase()} | Hit: ${targetTimeStr} UTC\n`;
      text += `⏱️ Rally: ${rallyTimeSec / 60}m (${rallyTimeSec}s)\n`;
      text += `------------------------------------\n`;

      const playersList = [...(team.players || [])];
      playersList.sort((a, b) => {
         const offsetA = teamLanding ? (team.playerOffsets?.[a.id] || 0) : (playerOffsets[a.id] || 0);
         const offsetB = teamLanding ? (team.playerOffsets?.[b.id] || 0) : (playerOffsets[b.id] || 0);
         return offsetA - offsetB;
      });

      playersList.forEach((p, idx) => {
        const mt = getMarchTime(p);
        const activePlayerOffset = teamLanding ? (team.playerOffsets?.[p.id] || 0) : (playerOffsets[p.id] || 0);
        const launchStr = mt > 0 ? calculateStartTime(targetTimeStr, mt, rallyTimeSec, activePlayerOffset) : '--:--:--';
        let displayName = p.name;
        if (truncateNameLen && displayName.length > truncateNameLen) {
          displayName = displayName.substring(0, truncateNameLen) + '..';
        }
        text += `${idx + 1}. [${displayName}] => LAUNCH: ${launchStr} UTC (M: ${mt}s | D: +${activePlayerOffset}s)\n`;
      });

      text += `------------------------------------\n`;
      text += `⚡ Launch EXACTLY at 0.0s countdown!`;
      return text;
    };

    let planText = buildPlanText();

    // If it exceeds 500 chars, try progressively truncating player names
    if (planText.length > 500) {
      planText = buildPlanText(12); // Try truncating to 12 chars
    }
    if (planText.length > 500) {
      planText = buildPlanText(8);  // Try truncating to 8 chars
    }
    if (planText.length > 500) {
      // Emergency extreme compression if still too long
      const playersList = [...(team.players || [])];
      playersList.sort((a, b) => {
         const offsetA = teamLanding ? (team.playerOffsets?.[a.id] || 0) : (playerOffsets[a.id] || 0);
         const offsetB = teamLanding ? (team.playerOffsets?.[b.id] || 0) : (playerOffsets[b.id] || 0);
         return offsetA - offsetB;
      });
      let text = `⚔️ SVS: ${team.name.toUpperCase()} | Hit: ${targetTimeStr}\n`;
      playersList.forEach((p, idx) => {
        const mt = getMarchTime(p);
        const activePlayerOffset = teamLanding ? (team.playerOffsets?.[p.id] || 0) : (playerOffsets[p.id] || 0);
        const launchStr = mt > 0 ? calculateStartTime(targetTimeStr, mt, rallyTimeSec, activePlayerOffset) : '--:--:--';
        text += `${idx + 1}. [${p.name.substring(0, 8)}] L: ${launchStr} (M:${mt}s/D:+${activePlayerOffset}s)\n`;
      });
      planText = text;
    }

    navigator.clipboard.writeText(planText).then(() => {
      setCopiedTeamId(team.id);
      setTimeout(() => setCopiedTeamId(null), 1500);
    }).catch(err => {
      console.error('Failed to copy plan:', err);
    });
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
      <div className="flex flex-wrap gap-4 items-center justify-between px-6 py-3 bg-[var(--primary)] border-b border-white/5">

        {/* User Info */}
        <div className="flex items-center gap-2 pr-4 flex-wrap">
            <div className="flex flex-col items-end">
                <span className="text-[10px] text-cyan-500 font-bold uppercase tracking-widest">{user?.role || 'UNKNOWN'}</span>
                <span className="text-sm text-white font-mono font-bold">{user?.username || 'Guest'}</span>
            </div>
            {/* Audio Controls */}
            <div className="ml-2 flex items-center gap-2 pl-2 border-l border-white/10">
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
        <div className="flex items-center gap-2 flex-wrap">
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
                       
                       const activeRallyTime = teamLanding ? (team.rallyTime || 300) : rallyDurationSec;
                       const activePlayerOffset = teamLanding ? (team.playerOffsets?.[p.id] || 0) : (playerOffsets[p.id] || 0);

                       const startTimeStr = (targetTimeStr && mt > 0) ? calculateStartTime(targetTimeStr, mt, activeRallyTime, activePlayerOffset) : '';

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

                {/* Copy Plan Clipboard Trigger */}
                {(teamLanding || (isSelected && landingTime)) ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyPlan(team, teamLanding);
                    }}
                    className={`mt-2 w-full py-1 text-[9px] font-black rounded border transition-all active:scale-95 flex items-center justify-center gap-1 ${
                      copiedTeamId === team.id
                        ? 'bg-green-950 border-green-500 text-green-400 shadow-[0_0_8px_rgba(34,197,94,0.3)]'
                        : 'bg-cyan-950/60 border-cyan-800/80 hover:border-cyan-400 text-cyan-400 hover:text-white'
                    }`}
                    title="Copy launch schedule to clipboard"
                  >
                    {copiedTeamId === team.id ? '✓ COPIED!' : '📋 COPY PLAN'}
                  </button>
                ) : (
                  <div className="text-[8px] text-gray-600 text-center italic mt-2 border-t border-white/5 pt-1.5 w-full">
                    Awaiting Schedule
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Rally Controls (Commander Only - mocked) */}
        <div className="flex items-center gap-4 flex-wrap">

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

          {/* Rally Duration Selector */}
          <div className="flex flex-col">
             <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Rally Time</label>
             <select
               value={rallyDurationSec}
               onChange={(e) => setRallyDurationSec(parseInt(e.target.value))}
               className="bg-black/50 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:border-cyan-500 outline-none font-mono w-24"
             >
                 <option value={60}>1 Min</option>
                 <option value={120}>2 Min</option>
                 <option value={300}>5 Min</option>
                 <option value={600}>10 Min</option>
             </select>
          </div>

          {/* Assignee Input */}
          <div className="flex flex-col relative">
             <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Assign To</label>
             <div className="flex items-center gap-1">
                 <select
                   value={assignedTo}
                   onChange={(e) => {
                       setAssignedTo(e.target.value);
                       setPlayerOffsets({});
                   }}
                   className="bg-black/50 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:border-cyan-500 outline-none font-mono w-32"
                 >
                     <option value="">-- Select Team --</option>
                     {teams.filter(t => !t.isEnemy).map(t => (
                         <option key={t.id} value={t.name}>{t.name}</option>
                     ))}
                 </select>
                 {assignedTo && (
                     <button
                       onClick={() => setShowSequencePlanner(!showSequencePlanner)}
                       className={`p-1.5 rounded transition-all text-xs font-bold border ${showSequencePlanner ? 'bg-cyan-600 border-cyan-400 text-white shadow-[0_0_10px_rgba(6,182,212,0.4)]' : 'bg-black/40 border-gray-700 text-cyan-400 hover:bg-cyan-900/20'}`}
                       title="Configure Hit Order Sequence"
                     >
                         ⚡ Seq
                     </button>
                 )}
             </div>

             {/* Sequence Planner Popover */}
             {showSequencePlanner && assignedTo && (
                 <div className="absolute top-12 left-0 w-64 bg-black/95 border border-cyan-500/50 p-3 rounded shadow-2xl z-50 backdrop-blur-md animate-in fade-in slide-in-from-top-2">
                     <div className="flex justify-between items-center mb-2">
                         <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">Hit Order Offsets</span>
                         <button onClick={() => setShowSequencePlanner(false)} className="text-gray-400 hover:text-white text-xs">✕</button>
                     </div>
                     <p className="text-[9px] text-gray-500 mb-2">Set target landing delay (seconds) for each player to hit in a specific order.</p>
                     
                     <div className="flex flex-col gap-3 max-h-60 overflow-y-auto pr-1">
                          {teams.find(t => t.name === assignedTo)?.players?.map(p => {
                              const currentOffset = playerOffsets[p.id] || 0;
                              const mt = getMarchTime(p);
                              const launchStr = (landingTime && mt > 0) ? calculateStartTime(landingTime, mt, rallyDurationSec, currentOffset) : '--:--:--';
                              
                              return (
                                  <div key={p.id} className="flex flex-col gap-1.5 text-xs border-b border-white/5 pb-2">
                                      <div className="flex items-center justify-between">
                                          <span className="text-white font-bold truncate max-w-[120px]">{p.name}</span>
                                          <span className="text-[10px] text-gray-500 font-mono">March: {mt}s</span>
                                      </div>
                                      <div className="flex items-center justify-between gap-2">
                                          <div className="flex items-center gap-1">
                                              <span className="text-[10px] text-gray-500 font-mono">Delay:</span>
                                              <input
                                                  type="number"
                                                  min="0"
                                                  max="60"
                                                  value={currentOffset === 0 ? '' : currentOffset}
                                                  onChange={(e) => {
                                                      const val = e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value));
                                                      setPlayerOffsets(prev => ({
                                                          ...prev,
                                                          [p.id]: val
                                                      }));
                                                  }}
                                                  placeholder="+0s"
                                                  className="w-12 h-6 bg-black border border-gray-700 text-yellow-400 text-center font-mono text-[11px] rounded focus:outline-none focus:border-yellow-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                              />
                                              <span className="text-yellow-400 text-[10px] font-mono">s</span>
                                          </div>
                                          <div className="flex items-center gap-1">
                                              <span className="text-[9px] text-gray-500 uppercase">Launch:</span>
                                              <span className="text-[10px] font-mono text-cyan-300 font-bold bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-800/30">
                                                  {launchStr}
                                              </span>
                                          </div>
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                 </div>
             )}
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
