import React, { useState, useEffect, useMemo } from 'react';
import { useGameStore, Player, Team } from '../store/useGameStore';
import { Shield, Swords, Target, Clock, AlertTriangle, X, Check, Copy, AlertCircle, Plus, Minus, Send, Users, UserCheck, ChevronRight, Search } from 'lucide-react';
import { launchMsFromTarget } from '../lib/launchTime';
import { notify } from '../lib/toast';

interface TargetSectionData {
  id: string; // 'west_turret', 'north_turret', 'castle', 'east_turret', 'south_turret'
  name: string;
  type: string;
  players: Player[];
  team: Team | null;
}

export default function GroupingPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { players, teams, user, sendGroupingPrepare, deployGroupingAttack } = useGameStore();

  // 5 Target Sections (Castle MUST BE MIDDLE SECTION at index 2!)
  const [sections, setSections] = useState<TargetSectionData[]>([
    { id: 'west_turret', name: 'West Turret', type: 'west_turret', players: [], team: null },
    { id: 'north_turret', name: 'North Turret', type: 'north_turret', players: [], team: null },
    { id: 'castle', name: 'Castle (Middle Target)', type: 'castle', players: [], team: null }, // MIDDLE SECTION
    { id: 'east_turret', name: 'East Turret', type: 'east_turret', players: [], team: null },
    { id: 'south_turret', name: 'South Turret', type: 'south_turret', players: [], team: null }
  ]);

  // Castle Offset (in seconds)
  const [castleOffset, setCastleOffset] = useState<number>(0);

  // Prep Delay for Suggested Time (in seconds)
  const [prepDelaySec, setPrepDelaySec] = useState<number>(30);

  // Search filter for available forces sidebar
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Time Input: HH, MM, SS
  const [hours, setHours] = useState<string>('');
  const [minutes, setMinutes] = useState<string>('');
  const [seconds, setSeconds] = useState<string>('');

  const [copiedPlan, setCopiedPlan] = useState<boolean>(false);
  const [prepareSent, setPrepareSent] = useState<boolean>(false);

  // Auto initialize time input to UTC now + 10 minutes on open
  useEffect(() => {
    if (isOpen && !hours && !minutes && !seconds) {
      const future = new Date(Date.now() + 10 * 60 * 1000);
      setHours(String(future.getUTCHours()).padStart(2, '0'));
      setMinutes(String(future.getUTCMinutes()).padStart(2, '0'));
      setSeconds(String(future.getUTCSeconds()).padStart(2, '0'));
    }
  }, [isOpen, hours, minutes, seconds]);

  // Role check
  const isAuthorized = Boolean(user && (user.role === 'ADMIN' || user.role === 'SUPERADMIN' || user.role === 'COMMANDER'));

  const getMarchTimeForTarget = (player: Player, targetType: string) => {
    const t = targetType.toLowerCase();
    if (t.includes('castle')) return player.mtCastle || 0;
    if (t.includes('north')) return player.mtNorth || 0;
    if (t.includes('east')) return player.mtEast || 0;
    if (t.includes('south')) return player.mtSouth || 0;
    if (t.includes('west')) return player.mtWest || 0;
    return 0;
  };

  // Helper to format HH:MM:SS string
  const formatTimeString = () => {
    const hh = hours.padStart(2, '0');
    const mm = minutes.padStart(2, '0');
    const ss = seconds.padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  };

  // Parse time input into UTC Timestamp
  const getBaseTargetTimestampMs = () => {
    const hh = parseInt(hours, 10);
    const mm = parseInt(minutes, 10);
    const ss = parseInt(seconds, 10);

    if (isNaN(hh) || isNaN(mm) || isNaN(ss)) return null;

    const now = new Date();
    const targetDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm, ss));

    // Handle day rollover if set time was earlier today
    if (targetDate.getTime() < now.getTime() - 600 * 1000) {
      targetDate.setUTCDate(targetDate.getUTCDate() + 1);
    }
    return targetDate.getTime();
  };

  const baseTimestampMs = getBaseTargetTimestampMs();

  // Validate 5-minute minimum rule
  const isTimeAtLeast5MinLater = baseTimestampMs !== null && baseTimestampMs >= Date.now() + 300 * 1000;

  // Feasibility & March Time Calculations per player
  const playerFeasibility = useMemo(() => {
    const now = Date.now();
    const result: Record<string, { player: Player; targetType: string; launchMs: number; isPossible: boolean; requiredSecFromNow: number }> = {};

    sections.forEach(sec => {
      const activePlayers = sec.team ? sec.team.players : sec.players;
      const targetOffsetSec = sec.id === 'castle' ? castleOffset : 0;
      const secTargetTimestamp = baseTimestampMs ? baseTimestampMs + (targetOffsetSec * 1000) : null;

      activePlayers.forEach(p => {
        const mt = getMarchTimeForTarget(p, sec.type);
        const rallyDurationSec = 300; // 5 min standard
        const requiredTotalSec = mt + rallyDurationSec;

        let launchMs = 0;
        let isPossible = true;

        if (secTargetTimestamp) {
          const raw = launchMsFromTarget(secTargetTimestamp, { marchSec: mt, rallySec: rallyDurationSec, offsetSec: 0 });
          // Missing march (raw == null) is advisory, not blocking — those players are just left out
          // of the plan text. Only a genuinely impossible time (raw < now) blocks deploy.
          isPossible = raw == null ? true : raw >= now;
          launchMs = raw ?? 0;
        }

        result[p.id] = {
          player: p,
          targetType: sec.type,
          launchMs,
          isPossible,
          requiredSecFromNow: requiredTotalSec - targetOffsetSec
        };
      });
    });

    return result;
  }, [sections, baseTimestampMs, castleOffset]);

  // Early return after all hooks have been invoked
  if (!isOpen || !isAuthorized) return null;

  // Check if any player cannot make the set time
  const hasFeasibilityError = Object.values(playerFeasibility).some(f => !f.isPossible);

  // Overall Panel Red Alert State
  const isPanelRed = !isTimeAtLeast5MinLater || hasFeasibilityError;

  // Count assigned sections
  const activeSectionsCount = sections.filter(s => (s.team && s.team.players.length > 0) || s.players.length > 0).length;
  const canDeploy = activeSectionsCount >= 2 && !isPanelRed && baseTimestampMs !== null;

  // Calculate Suggested Landing Time
  const calculateSuggestedLandingTime = () => {
    const now = Date.now();
    const rallyTimeSec = 300; // 5 min

    let maxRequiredFromNowSec = 300; // Minimum 5 minutes later

    sections.forEach(sec => {
      const activePlayers = sec.team ? sec.team.players : sec.players;
      const targetOffsetSec = sec.id === 'castle' ? castleOffset : 0;

      activePlayers.forEach(p => {
        const mt = getMarchTimeForTarget(p, sec.type);
        // Required base landing time from now = RallyDuration + MarchTime - CastleOffset
        const reqBaseSec = rallyTimeSec + mt - targetOffsetSec;
        if (reqBaseSec > maxRequiredFromNowSec) {
          maxRequiredFromNowSec = reqBaseSec;
        }
      });
    });

    // Add user-defined prep delay X
    const suggestedTimeMs = now + (maxRequiredFromNowSec * 1000) + (prepDelaySec * 1000);
    const suggestedDate = new Date(suggestedTimeMs);

    setHours(String(suggestedDate.getUTCHours()).padStart(2, '0'));
    setMinutes(String(suggestedDate.getUTCMinutes()).padStart(2, '0'));
    setSeconds(String(suggestedDate.getUTCSeconds()).padStart(2, '0'));
  };

  // Helper: Assign Team to Section
  const assignTeamToSection = (teamId: string, targetSectionId: string) => {
    const teamObj = teams.find(t => t.id === teamId);
    if (!teamObj) return;

    setSections(prevSections => {
      const newSections = prevSections.map(sec => ({
        ...sec,
        players: [...sec.players],
        team: sec.team
      }));

      // Remove team's players from all other sections
      const teamPlayerIds = new Set(teamObj.players.map(p => p.id));
      newSections.forEach(sec => {
        sec.players = sec.players.filter(p => !teamPlayerIds.has(p.id));
        if (sec.team?.id === teamId) sec.team = null;
      });

      // Set team on target section
      const targetSec = newSections.find(s => s.id === targetSectionId);
      if (targetSec) {
        targetSec.team = teamObj;
        targetSec.players = []; // Clear individual players if team set
      }
      return newSections;
    });
  };

  // Helper: Assign Player to Section
  const assignPlayerToSection = (playerId: string, targetSectionId: string) => {
    const playerObj = players.find(p => p.id === playerId);
    if (!playerObj) return;

    setSections(prevSections => {
      const newSections = prevSections.map(sec => ({
        ...sec,
        players: [...sec.players],
        team: sec.team
      }));

      // Check if player is part of any assigned team in a section
      const isPlayerInAnyTeam = newSections.some(s => s.team?.players.some(tp => tp.id === playerId));
      if (isPlayerInAnyTeam) {
        notify(`${playerObj.name} is part of an assigned team and can't be moved individually.`, 'info');
        return prevSections;
      }

      // Remove player from all sections first (Uniqueness guarantee!)
      newSections.forEach(sec => {
        sec.players = sec.players.filter(p => p.id !== playerId);
      });

      // Add player to target section
      const targetSec = newSections.find(s => s.id === targetSectionId);
      if (targetSec) {
        targetSec.team = null; // Clear team to allow individual player additions
        if (!targetSec.players.some(p => p.id === playerId)) {
          targetSec.players.push(playerObj);
        }
      }
      return newSections;
    });
  };

  // Drag and Drop Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropOnSection = (e: React.DragEvent, targetSectionId: string) => {
    e.preventDefault();
    const playerId = e.dataTransfer.getData('playerId');
    const teamId = e.dataTransfer.getData('teamId');

    if (teamId) {
      assignTeamToSection(teamId, targetSectionId);
    } else if (playerId) {
      assignPlayerToSection(playerId, targetSectionId);
    }
  };

  const handleRemoveFromSection = (sectionId: string, playerId?: string) => {
    setSections(prev => prev.map(sec => {
      if (sec.id !== sectionId) return sec;
      if (playerId) {
        return { ...sec, players: sec.players.filter(p => p.id !== playerId) };
      }
      // Remove team
      return { ...sec, team: null };
    }));
  };

  // Button Action: Prepare
  const handlePrepare = () => {
    sendGroupingPrepare();
    setPrepareSent(true);
    setTimeout(() => setPrepareSent(false), 3000);
  };

  // Button Action: Deploy
  const handleDeploy = () => {
    if (!canDeploy || !baseTimestampMs) return;

    const landingsToDeploy: any[] = [];

    sections.forEach(sec => {
      const activePlayers = sec.team ? sec.team.players : sec.players;
      if (activePlayers.length === 0) return;

      const offsetSec = sec.id === 'castle' ? castleOffset : 0;
      const targetTimeMs = baseTimestampMs + (offsetSec * 1000);
      const targetDate = new Date(targetTimeMs);
      const targetTimeStr = `${String(targetDate.getUTCHours()).padStart(2, '0')}:${String(targetDate.getUTCMinutes()).padStart(2, '0')}:${String(targetDate.getUTCSeconds()).padStart(2, '0')}`;

      const assigneeLabel = sec.team ? sec.team.name : (activePlayers.length === 1 ? activePlayers[0].name : `${sec.name} Squad`);

      landingsToDeploy.push({
        x: sec.id === 'castle' ? 20 : (sec.id === 'north_turret' ? 15 : (sec.id === 'south_turret' ? 25 : (sec.id === 'east_turret' ? 25 : 15))),
        y: sec.id === 'castle' ? 20 : (sec.id === 'north_turret' ? 15 : (sec.id === 'south_turret' ? 25 : (sec.id === 'east_turret' ? 15 : 25))),
        time: targetTimeStr,
        assignedTo: assigneeLabel,
        type: sec.type,
        rallyTime: 300,
        playerOffsets: {}
      });
    });

    deployGroupingAttack(landingsToDeploy);
    onClose();
  };

  // Button Action: Battle Plan (Copy to Clipboard <= 500 chars STRICTLY)
  const handleCopyBattlePlan = () => {
    const timeStr = formatTimeString();

    const generateText = (nameTruncateLen?: number) => {
      let text = `⚔️ GROUP ATTACK PLAN\n`;

      sections.forEach(sec => {
        const activePlayers = sec.team ? sec.team.players : sec.players;
        if (activePlayers.length === 0) return;

        const secTitle = sec.name.replace(' (Middle Target)', '').toUpperCase();
        text += `🎯 ${secTitle} | LAUNCH:\n`;

        let lineNo = 0;
        activePlayers.forEach((p) => {
          const feas = playerFeasibility[p.id];
          // Skip players we can't compute (no march time) — never broadcast a placeholder time.
          if (!feas || feas.launchMs <= 0) return;
          lineNo++;
          const ld = new Date(feas.launchMs);
          const launchStr = `${String(ld.getUTCHours()).padStart(2, '0')}:${String(ld.getUTCMinutes()).padStart(2, '0')}:${String(ld.getUTCSeconds()).padStart(2, '0')}`;

          let pName = p.name;
          if (nameTruncateLen && pName.length > nameTruncateLen) {
            pName = pName.substring(0, nameTruncateLen) + '..';
          }
          text += `${lineNo} ${pName} @ ${launchStr}\n`;
        });
        text += `\n`;
      });

      text += `--- HIT : ${timeStr} UTC`;
      return text;
    };

    let planText = generateText();

    // Progressive dynamic compression if > 500 chars
    if (planText.length > 500) planText = generateText(12);
    if (planText.length > 500) planText = generateText(8);
    if (planText.length > 500) planText = generateText(5);

    if (planText.length > 500) {
      // Emergency extreme compression
      let text = `⚔️ GROUP: ${timeStr} UTC\n`;
      sections.forEach(sec => {
        const activePlayers = sec.team ? sec.team.players : sec.players;
        if (activePlayers.length === 0) return;
        text += `${sec.name.split(' ')[0]}: `;
        text += activePlayers.map((p, idx) => {
          const feas = playerFeasibility[p.id];
          const ld = feas?.launchMs ? new Date(feas.launchMs) : null;
          const lStr = ld ? `${String(ld.getUTCHours()).padStart(2, '0')}:${String(ld.getUTCMinutes()).padStart(2, '0')}` : '--:--';
          return `${idx + 1} ${p.name.substring(0, 5)} @ ${lStr}`;
        }).join(', ') + `\n`;
      });
      planText = text;
    }

    navigator.clipboard.writeText(planText).then(() => {
      setCopiedPlan(true);
      setTimeout(() => setCopiedPlan(false), 2000);
    });
  };

  // Allied Players and Teams lists
  const alliedPlayers = players.filter(p => p.allianceId === 'ally');
  const alliedTeams = teams.filter(t => !t.isEnemy);

  // Helper to check where a player is currently assigned
  const getPlayerAssignmentLabel = (playerId: string) => {
    for (const sec of sections) {
      if (sec.team && sec.team.players.some(p => p.id === playerId)) {
        return `Team ${sec.team.name} (${sec.name.replace(' (Middle Target)', '')})`;
      }
      if (sec.players.some(p => p.id === playerId)) {
        return sec.name.replace(' (Middle Target)', '');
      }
    }
    return null;
  };

  const getTeamAssignmentLabel = (teamId: string) => {
    const sec = sections.find(s => s.team?.id === teamId);
    return sec ? sec.name.replace(' (Middle Target)', '') : null;
  };

  const filteredPlayers = alliedPlayers.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredTeams = alliedTeams.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-md flex flex-col items-center justify-start p-4 pt-24 overflow-y-auto pointer-events-auto animate-in fade-in zoom-in-95">
      <div className={`
        relative w-full max-w-6xl max-h-[82vh] rounded-xl border-2 p-5 shadow-2xl transition-all duration-300 flex flex-col gap-4 overflow-hidden border-cyan-500/50 bg-gray-950/95 shadow-[0_0_50px_rgba(0,0,0,0.9)]
        ${isPanelRed
          ? 'bg-red-950/95 border-red-500 shadow-[0_0_40px_rgba(239,68,68,0.5)]'
          : 'bg-gray-950/95 border-cyan-500/50 shadow-[0_0_30px_rgba(6,182,212,0.2)]'}
      `}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3 flex-none">
          <div className="flex items-center gap-3">
            <Swords className={`w-7 h-7 ${isPanelRed ? 'text-red-400' : 'text-cyan-400'}`} />
            <div>
              <h2 className="text-xl font-black tracking-widest text-white uppercase flex items-center gap-2">
                GROUPING ATTACK PLANNER
                {isPanelRed && (
                  <span className="text-xs bg-red-600 text-white px-2 py-0.5 rounded font-mono font-bold">
                    ⚠️ INVALID TIME / IMPOSSIBLE MARCH
                  </span>
                )}
              </h2>
              <p className="text-xs text-gray-400 font-mono">Synchronized 5-target rally assault matrix</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-300 hover:text-white bg-gray-800 hover:bg-red-600 rounded-lg border border-gray-600 hover:border-red-400 transition-colors shadow-lg cursor-pointer flex items-center justify-center shrink-0"
            title="Close Grouping Panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Control Bar */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-black/60 p-3 rounded-lg border border-white/10 items-center flex-none">
          {/* UTC Landing Time Input (Fixed ':' separators) */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> Landing Time (UTC)
            </label>
            <div className="flex items-center gap-1 font-mono text-base font-bold text-white bg-black border border-gray-700 px-2 py-1 rounded focus-within:border-cyan-400">
              <input
                type="text"
                maxLength={2}
                value={hours}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setHours(val);
                  if (val.length === 2) {
                    const next = e.target.nextElementSibling?.nextElementSibling as HTMLInputElement;
                    next?.focus();
                  }
                }}
                placeholder="HH"
                className="w-7 bg-transparent text-center text-yellow-400 outline-none"
              />
              <span className="text-cyan-400 select-none">:</span>
              <input
                type="text"
                maxLength={2}
                value={minutes}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setMinutes(val);
                  if (val.length === 2) {
                    const next = e.target.nextElementSibling?.nextElementSibling as HTMLInputElement;
                    next?.focus();
                  }
                }}
                placeholder="MM"
                className="w-7 bg-transparent text-center text-yellow-400 outline-none"
              />
              <span className="text-cyan-400 select-none">:</span>
              <input
                type="text"
                maxLength={2}
                value={seconds}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setSeconds(val);
                }}
                placeholder="SS"
                className="w-7 bg-transparent text-center text-yellow-400 outline-none"
              />
              <span className="text-xs text-gray-500 ml-1">UTC</span>
            </div>
            {!isTimeAtLeast5MinLater && (
              <span className="text-[9px] text-red-400 font-mono">Must be ≥ 5 minutes from now</span>
            )}
          </div>

          {/* Castle Target Landing Offset */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1">
              <Target className="w-3.5 h-3.5" /> Castle Hit Offset (Sec)
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCastleOffset(prev => prev - 1)}
                className="p-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded border border-gray-600 active:scale-95 text-xs"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <input
                type="number"
                value={castleOffset}
                onChange={(e) => setCastleOffset(parseInt(e.target.value) || 0)}
                className="w-16 bg-black border border-gray-700 text-center text-yellow-400 font-mono font-bold p-1 rounded outline-none focus:border-cyan-400 text-xs"
              />
              <button
                onClick={() => setCastleOffset(prev => prev + 1)}
                className="p-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded border border-gray-600 active:scale-95 text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs text-gray-400 font-mono">{castleOffset >= 0 ? `+${castleOffset}s` : `${castleOffset}s`}</span>
            </div>
          </div>

          {/* Prep Delay Buffer for Suggested Time */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">Rally Prep Delay Buffer (X sec)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={300}
                value={prepDelaySec}
                onChange={(e) => setPrepDelaySec(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-20 bg-black border border-gray-700 text-center text-cyan-300 font-mono p-1 rounded outline-none text-xs"
              />
              <span className="text-xs text-gray-400">sec</span>
            </div>
          </div>

          {/* Suggested Landing Time Button */}
          <div className="flex flex-col justify-end">
            <button
              onClick={calculateSuggestedLandingTime}
              className="w-full py-1.5 px-3 bg-cyan-900/60 hover:bg-cyan-600 border border-cyan-500 text-cyan-200 hover:text-white font-bold text-xs rounded transition-all flex items-center justify-center gap-2 shadow-[0_0_10px_rgba(6,182,212,0.3)] active:scale-95"
            >
              <Clock className="w-3.5 h-3.5" />
              SUGGESTED LANDING TIME
            </button>
          </div>
        </div>

        {/* Action Buttons Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-black/40 p-2.5 rounded-lg border border-white/5 flex-none">
          <div className="flex items-center gap-3">
            {/* Prepare Button */}
            <button
              onClick={handlePrepare}
              className={`px-4 py-2 font-bold text-xs rounded flex items-center gap-2 transition-all active:scale-95 ${
                prepareSent
                  ? 'bg-green-600 text-white shadow-[0_0_15px_rgba(34,197,94,0.5)]'
                  : 'bg-yellow-600 hover:bg-yellow-500 text-black shadow-[0_0_15px_rgba(202,138,4,0.4)]'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              {prepareSent ? 'NOTIFIED ALL PLAYERS!' : 'PREPARE (NOTIFY ALL)'}
            </button>

            {/* Battle Plan Button */}
            <button
              onClick={handleCopyBattlePlan}
              className={`px-4 py-2 font-bold text-xs rounded flex items-center gap-2 transition-all active:scale-95 ${
                copiedPlan
                  ? 'bg-green-700 text-green-200 border border-green-400 shadow-[0_0_15px_rgba(34,197,94,0.5)]'
                  : 'bg-indigo-900/70 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-500'
              }`}
            >
              <Copy className="w-3.5 h-3.5" />
              {copiedPlan ? 'COPIED TO CLIPBOARD!' : 'COPY BATTLE PLAN (<=500 CHARS)'}
            </button>
          </div>

          {/* Deploy Button */}
          <button
            onClick={handleDeploy}
            disabled={!canDeploy}
            className={`px-6 py-2 font-extrabold text-sm rounded flex items-center gap-2 transition-all shadow-xl active:scale-95 ${
              canDeploy
                ? 'bg-red-600 hover:bg-red-500 text-white shadow-[0_0_20px_rgba(220,38,38,0.6)]'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700'
            }`}
          >
            <Swords className="w-4 h-4" />
            DEPLOY GROUP ATTACK
          </button>
        </div>

        {/* Main Content Area: 5 Sections (Left) + Available Forces Drawer (Right) */}
        <div className="flex-1 flex gap-4 overflow-hidden min-h-0">
          
          {/* 5 Target Sections Grid (Castle MUST be Middle Section index 2) */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-2.5 overflow-y-auto pr-1">
            {sections.map((sec) => {
              const isCastle = sec.id === 'castle';
              const activePlayers = sec.team ? sec.team.players : sec.players;
              const hasItems = activePlayers.length > 0;

              return (
                <div
                  key={sec.id}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDropOnSection(e, sec.id)}
                  className={`
                    flex flex-col rounded-lg border-2 p-2.5 transition-all min-h-[280px] relative
                    ${isCastle
                      ? 'border-yellow-500/80 bg-yellow-950/20 shadow-[0_0_15px_rgba(234,179,8,0.2)]'
                      : 'border-cyan-500/30 bg-black/60 hover:border-cyan-400/60'}
                  `}
                >
                  {/* Section Header */}
                  <div className={`p-2 rounded border mb-2 text-center ${isCastle ? 'bg-yellow-900/40 border-yellow-500/50' : 'bg-cyan-950/40 border-cyan-800/40'}`}>
                    <h3 className={`text-xs font-black uppercase tracking-wider ${isCastle ? 'text-yellow-400' : 'text-cyan-300'}`}>
                      {sec.name}
                    </h3>
                    {isCastle && (
                      <span className="text-[9px] text-yellow-300 font-mono block">
                        Offset: {castleOffset >= 0 ? `+${castleOffset}s` : `${castleOffset}s`}
                      </span>
                    )}
                  </div>

                  {/* Section Quick Add Selectors */}
                  <div className="flex flex-col gap-1 mb-2">
                    {/* Add Team Dropdown */}
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) assignTeamToSection(e.target.value, sec.id);
                      }}
                      className="bg-black/80 border border-gray-700 text-yellow-400 font-bold text-[10px] rounded px-1.5 py-1 outline-none focus:border-yellow-400"
                    >
                      <option value="">+ Add Team...</option>
                      {alliedTeams.map(t => (
                        <option key={t.id} value={t.id}>{t.name} ({t.players.length} players)</option>
                      ))}
                    </select>

                    {/* Add Player Dropdown */}
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) assignPlayerToSection(e.target.value, sec.id);
                      }}
                      className="bg-black/80 border border-gray-700 text-cyan-300 font-bold text-[10px] rounded px-1.5 py-1 outline-none focus:border-cyan-400"
                    >
                      <option value="">+ Add Player...</option>
                      {alliedPlayers.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.power.toLocaleString()} PWR)</option>
                      ))}
                    </select>
                  </div>

                  {/* Drop Zone Content */}
                  <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto max-h-[240px] scrollbar-thin pr-1">
                    {!hasItems && (
                      <div className="flex-1 border-2 border-dashed border-gray-700/60 rounded flex flex-col items-center justify-center p-3 text-center">
                        <Target className="w-6 h-6 text-gray-600 mb-1" />
                        <span className="text-[9px] text-gray-500 font-mono uppercase">Drop or Select Player / Team</span>
                      </div>
                    )}

                    {/* If Team Assigned */}
                    {sec.team && (
                      <div className="bg-yellow-950/40 border border-yellow-500/60 rounded p-2 flex flex-col gap-1 relative">
                        <div className="flex justify-between items-center border-b border-yellow-500/30 pb-1">
                          <span className="text-xs font-bold text-yellow-300 truncate">{sec.team.name}</span>
                          <button
                            onClick={() => handleRemoveFromSection(sec.id)}
                            className="text-red-400 hover:text-white p-0.5 rounded"
                            title="Remove Team"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex flex-col gap-1 mt-1">
                          {sec.team.players.map(p => {
                            const feas = playerFeasibility[p.id];
                            const isFeasible = feas ? feas.isPossible : true;
                            const mt = getMarchTimeForTarget(p, sec.type);

                            return (
                              <div
                                key={p.id}
                                className={`flex justify-between items-center text-[10px] p-1 rounded border ${
                                  isFeasible ? 'bg-black/60 border-gray-700 text-gray-200' : 'bg-red-900/80 border-red-500 text-red-200 font-bold'
                                }`}
                              >
                                <span className="truncate max-w-[70px]">{p.name}</span>
                                <span className="font-mono text-[9px]">{mt}s M</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Individual Players Assigned */}
                    {!sec.team && sec.players.map(p => {
                      const feas = playerFeasibility[p.id];
                      const isFeasible = feas ? feas.isPossible : true;
                      const mt = getMarchTimeForTarget(p, sec.type);

                      return (
                        <div
                          key={p.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('playerId', p.id);
                          }}
                          className={`
                            flex items-center justify-between p-1.5 rounded border cursor-grab active:cursor-grabbing transition-all
                            ${isFeasible
                              ? 'bg-cyan-950/30 border-cyan-800/50 hover:bg-cyan-900/40 text-cyan-100'
                              : 'bg-red-900/90 border-red-500 text-white font-bold shadow-[0_0_10px_rgba(239,68,68,0.6)]'}
                          `}
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-bold truncate">{p.name}</span>
                            <span className="text-[9px] text-gray-400 font-mono">March: {mt}s</span>
                          </div>

                          <button
                            onClick={() => handleRemoveFromSection(sec.id, p.id)}
                            className="text-gray-400 hover:text-red-400 p-1 rounded"
                            title="Remove Player"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Sidebar: Available Forces & Teams Drawer */}
          <div className="w-72 flex-none bg-black/80 border border-cyan-500/30 rounded-lg p-3 flex flex-col gap-3 overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-xs uppercase tracking-wider">
                <Users className="w-4 h-4" /> Available Forces
              </div>
              <span className="text-[10px] text-gray-400 font-mono">{alliedPlayers.length} Players</span>
            </div>

            {/* Search Filter */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2 top-2" />
              <input
                type="text"
                placeholder="Search player or team..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-black border border-gray-700 pl-7 pr-2 py-1 text-xs text-white rounded outline-none focus:border-cyan-400 font-mono"
              />
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col gap-3 scrollbar-thin pr-1">
              {/* TEAMS SECTION */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-yellow-400 font-bold uppercase tracking-wider">Allied Teams ({alliedTeams.length})</span>
                {filteredTeams.map(t => {
                  const assignmentLabel = getTeamAssignmentLabel(t.id);

                  return (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('teamId', t.id);
                      }}
                      className={`
                        p-2 rounded border transition-all cursor-grab active:cursor-grabbing flex flex-col gap-1
                        ${assignmentLabel
                          ? 'border-yellow-500/70 bg-yellow-950/40 text-yellow-200'
                          : 'border-yellow-500/30 bg-yellow-900/10 hover:bg-yellow-900/20 text-gray-200'}
                      `}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-xs truncate">{t.name}</span>
                        <span className="text-[9px] bg-black/60 px-1.5 py-0.5 rounded text-gray-300 font-mono">{t.players.length} Players</span>
                      </div>

                      {assignmentLabel ? (
                        <span className="text-[9px] text-yellow-400 font-mono font-bold flex items-center gap-1">
                          <UserCheck className="w-3 h-3" /> ASSIGNED TO {assignmentLabel.toUpperCase()}
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1 mt-1 border-t border-white/5 pt-1">
                          <span className="text-[9px] text-gray-400 self-center">Assign:</span>
                          {sections.map(s => (
                            <button
                              key={s.id}
                              onClick={() => assignTeamToSection(t.id, s.id)}
                              className="text-[9px] bg-cyan-950 border border-cyan-800 hover:border-cyan-400 text-cyan-300 px-1 rounded hover:bg-cyan-900"
                            >
                              +{s.name.substring(0, 4)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* INDIVIDUAL PLAYERS SECTION */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">Individual Players ({alliedPlayers.length})</span>
                {filteredPlayers.map(p => {
                  const assignmentLabel = getPlayerAssignmentLabel(p.id);

                  return (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('playerId', p.id);
                      }}
                      className={`
                        p-2 rounded border transition-all cursor-grab active:cursor-grabbing flex flex-col gap-1
                        ${assignmentLabel
                          ? 'border-cyan-500/60 bg-cyan-950/40 text-cyan-200'
                          : 'border-cyan-900/40 bg-black/50 hover:bg-cyan-950/20 text-gray-300'}
                      `}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-xs truncate">{p.name}</span>
                        <span className="text-[9px] text-gray-500 font-mono">{p.power.toLocaleString()} PWR</span>
                      </div>

                      {assignmentLabel ? (
                        <span className="text-[9px] text-cyan-300 font-mono font-bold flex items-center gap-1">
                          <Check className="w-3 h-3 text-cyan-400" /> {assignmentLabel.toUpperCase()}
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1 mt-1 border-t border-white/5 pt-1">
                          <span className="text-[9px] text-gray-400 self-center">Assign:</span>
                          {sections.map(s => (
                            <button
                              key={s.id}
                              onClick={() => assignPlayerToSection(p.id, s.id)}
                              className="text-[9px] bg-cyan-950 border border-cyan-800 hover:border-cyan-400 text-cyan-300 px-1 rounded hover:bg-cyan-900"
                            >
                              +{s.name.substring(0, 4)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
