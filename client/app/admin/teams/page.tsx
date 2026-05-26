'use client';
import { useState, useEffect } from 'react';
import Layout from '../../../components/Layout';
import { useGameStore, Player } from '../../../store/useGameStore';
import { Trash, Users, UserPlus, Search, UserCheck, Move, Plus, X } from 'lucide-react';

export default function TeamManagement() {
  const { teams, players, fetchTeams, createTeam, deleteTeam, assignPlayerToTeam } = useGameStore();
  const [newTeamName, setNewTeamName] = useState('');
  const [isEnemyTeam, setIsEnemyTeam] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'unassigned' | 'assigned'>('all');
  const [activeDragOverTeamId, setActiveDragOverTeamId] = useState<string | null>(null);
  const [isDragOverPool, setIsDragOverPool] = useState(false);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  const handleCreateTeam = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTeamName.trim()) {
      createTeam(newTeamName.trim(), isEnemyTeam);
      setNewTeamName('');
      setIsEnemyTeam(false);
    }
  };

  // Drag & Drop Handlers
  const handleDragStart = (e: React.DragEvent, playerId: string) => {
    e.dataTransfer.setData('playerId', playerId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOverTeam = (e: React.DragEvent, teamId: string) => {
    e.preventDefault();
    setActiveDragOverTeamId(teamId);
  };

  const handleDragLeaveTeam = () => {
    setActiveDragOverTeamId(null);
  };

  const handleDropOnTeam = (e: React.DragEvent, teamId: string) => {
    e.preventDefault();
    setActiveDragOverTeamId(null);
    const playerId = e.dataTransfer.getData('playerId');
    if (playerId) {
      assignPlayerToTeam(playerId, teamId);
    }
  };

  const handleDragOverPool = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverPool(true);
  };

  const handleDragLeavePool = () => {
    setIsDragOverPool(false);
  };

  const handleDropOnPool = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverPool(false);
    const playerId = e.dataTransfer.getData('playerId');
    if (playerId) {
      assignPlayerToTeam(playerId, null);
    }
  };

  // Filtered Players Pool
  const filteredPlayers = players.filter(p => {
    // 1. Search Query match
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          p.role.toLowerCase().includes(searchQuery.toLowerCase());
    
    // 2. Tab Filter match
    const hasTeam = p.teamId && p.teamId !== 'null' && p.teamId !== '';
    if (filterTab === 'unassigned') return matchesSearch && !hasTeam;
    if (filterTab === 'assigned') return matchesSearch && hasTeam;
    return matchesSearch;
  });

  return (
    <Layout>
      <div className="p-6 text-white h-full overflow-hidden flex flex-col font-sans">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-black tracking-wider text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.3)]">
            TEAM &amp; ROSTER MANAGEMENT
          </h1>
          <div className="text-xs text-gray-500 font-mono">
            DRAG &amp; DROP PLAYERS TO INSTANTLY ORCHESTRATE WAVES
          </div>
        </div>

        {/* Two Column Grid */}
        <div className="flex-1 grid grid-cols-1 xl:grid-cols-3 gap-6 overflow-hidden">
          
          {/* LEFT COLUMN: Searchable Player Assigner Pool */}
          <div 
            onDragOver={handleDragOverPool}
            onDragLeave={handleDragLeavePool}
            onDrop={handleDropOnPool}
            className={`xl:col-span-1 bg-black/60 border rounded-xl p-4 flex flex-col overflow-hidden transition-all duration-300
              ${isDragOverPool ? 'border-red-500 bg-red-950/10 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'border-gray-800'}
            `}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-300 uppercase tracking-widest flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-cyan-400" /> Player Directory
              </h2>
              {isDragOverPool && (
                <span className="text-[10px] text-red-400 animate-pulse font-bold font-mono">DROP HERE TO UNASSIGN</span>
              )}
            </div>

            {/* Quick Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search by player name or role..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-gray-900/50 border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex bg-gray-900/80 p-0.5 rounded-lg border border-gray-800 mb-4 text-xs font-bold">
              <button 
                onClick={() => setFilterTab('all')} 
                className={`flex-1 py-1.5 rounded-md text-center transition-colors ${filterTab === 'all' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                All ({players.length})
              </button>
              <button 
                onClick={() => setFilterTab('unassigned')} 
                className={`flex-1 py-1.5 rounded-md text-center transition-colors ${filterTab === 'unassigned' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                Unassigned ({players.filter(p => !p.teamId).length})
              </button>
              <button 
                onClick={() => setFilterTab('assigned')} 
                className={`flex-1 py-1.5 rounded-md text-center transition-colors ${filterTab === 'assigned' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                Assigned ({players.filter(p => p.teamId).length})
              </button>
            </div>

            {/* Player Cards Pool Scrollable List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
              {filteredPlayers.length === 0 ? (
                <div className="text-center py-8 text-gray-600 text-xs italic">
                  No players match search filters.
                </div>
              ) : (
                filteredPlayers.map(p => {
                  const assignedTeam = teams.find(t => t.id === p.teamId);
                  
                  return (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, p.id)}
                      className={`
                        flex items-center justify-between p-2.5 rounded-lg border bg-gray-950/40 hover:bg-white/5 cursor-grab active:cursor-grabbing transition-all group
                        ${assignedTeam ? (assignedTeam.isEnemy ? 'border-red-900/30' : 'border-cyan-900/30') : 'border-gray-800'}
                      `}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative">
                          <img 
                            src={p.avatar || `https://ui-avatars.com/api/?name=${p.name}`} 
                            alt="" 
                            className={`w-8 h-8 rounded-full border ${assignedTeam?.isEnemy ? 'border-red-500' : 'border-cyan-500'}`} 
                          />
                          <div className="absolute -bottom-1 -right-1 p-0.5 bg-black rounded-full text-[8px]" title="Draggable character card">
                            <Move className="w-2.5 h-2.5 text-gray-500 group-hover:text-cyan-400" />
                          </div>
                        </div>
                        <div className="flex flex-col min-w-0 leading-tight">
                          <span className="text-xs font-bold text-gray-200 truncate">{p.name}</span>
                          <span className="text-[9px] text-gray-500">{p.role} • {(p.power / 1000000).toFixed(1)}M PWR</span>
                        </div>
                      </div>

                      {/* Quick Actions / Indicators */}
                      <div className="flex items-center gap-1.5 flex-none">
                        {assignedTeam ? (
                          <div 
                            onClick={() => assignPlayerToTeam(p.id, null)}
                            className={`text-[9px] font-mono px-2 py-0.5 rounded cursor-pointer border hover:bg-red-600 hover:text-black hover:border-red-400 transition-colors
                              ${assignedTeam.isEnemy ? 'bg-red-950/60 text-red-400 border-red-900' : 'bg-cyan-950/60 text-cyan-400 border-cyan-900'}
                            `}
                            title="Click to instantly unassign"
                          >
                            {assignedTeam.name.toUpperCase()} ✕
                          </div>
                        ) : (
                          <div className="relative group/btn">
                            <button 
                              className="p-1 bg-gray-900 border border-gray-800 text-gray-400 hover:text-cyan-400 hover:border-cyan-500 rounded-md transition-all"
                              title="Assign to wave team"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            {/* Hover Quick Select list */}
                            <div className="absolute right-0 bottom-full mb-1 bg-black border border-gray-700 rounded shadow-xl hidden group-hover/btn:block z-50 w-32 py-1">
                              {teams.filter(t => !t.isEnemy).map(t => (
                                <button
                                  key={t.id}
                                  onClick={() => assignPlayerToTeam(p.id, t.id)}
                                  className="block w-full text-left px-2.5 py-1 text-[10px] text-gray-400 hover:bg-white/10 hover:text-white truncate"
                                >
                                  + {t.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Interactive Teams Drag/Drop Grid */}
          <div className="xl:col-span-2 flex flex-col overflow-hidden">
            
            {/* Create Team Form & Stats */}
            <div className="mb-4 p-4 bg-gray-900/30 border border-gray-800 rounded-xl flex items-center justify-between flex-wrap gap-4">
              <form onSubmit={handleCreateTeam} className="flex gap-3 items-center flex-wrap">
                <input
                  type="text"
                  placeholder="Enter New Wave/Team Name..."
                  required
                  value={newTeamName}
                  onChange={e => setNewTeamName(e.target.value)}
                  className="bg-black/50 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 w-48 font-mono"
                />
                <div className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    id="isEnemy"
                    checked={isEnemyTeam}
                    onChange={(e) => setIsEnemyTeam(e.target.checked)}
                    className="w-3.5 h-3.5 accent-red-500"
                  />
                  <label htmlFor="isEnemy" className="text-xs font-bold text-red-400 cursor-pointer select-none">ENEMY TEAM</label>
                </div>
                <button 
                  type="submit" 
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-black font-extrabold text-xs tracking-wider transition-all shadow shadow-cyan-900/50"
                >
                  CREATE TEAM
                </button>
              </form>

              <div className="text-[11px] text-gray-500 font-mono">
                TEAMS: <span className="text-cyan-400 font-bold">{teams.filter(t => !t.isEnemy).length} Allied</span> | 
                <span className="text-red-400 font-bold ml-1">{teams.filter(t => t.isEnemy).length} Enemy</span>
              </div>
            </div>

            {/* Teams Grid Scrollable Container */}
            <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4 pr-1 scrollbar-thin">
              {teams.map(team => {
                const isDragOver = activeDragOverTeamId === team.id;
                
                return (
                  <div
                    key={team.id}
                    onDragOver={(e) => handleDragOverTeam(e, team.id)}
                    onDragLeave={handleDragLeaveTeam}
                    onDrop={(e) => handleDropOnTeam(e, team.id)}
                    className={`
                      border rounded-xl p-4 flex flex-col bg-gray-950/20 backdrop-blur-sm transition-all duration-300 relative
                      ${isDragOver 
                        ? 'border-cyan-400 bg-cyan-950/20 scale-[1.02] shadow-[0_0_20px_rgba(6,182,212,0.3)] z-10' 
                        : team.isEnemy 
                        ? 'border-red-900/50 hover:border-red-800 bg-red-950/5' 
                        : 'border-gray-800 hover:border-gray-700 bg-gray-950/10'
                      }
                    `}
                  >
                    {/* Header */}
                    <div className="flex justify-between items-start mb-3 border-b border-white/5 pb-2">
                      <div className="flex flex-col min-w-0">
                        <h3 className={`text-base font-extrabold flex items-center gap-1.5 truncate ${team.isEnemy ? 'text-red-400' : 'text-cyan-300 font-black'}`}>
                          <Users className="w-4 h-4 flex-none" /> {team.name}
                        </h3>
                        {team.landingTime ? (
                          <span className="text-[10px] text-yellow-500 font-mono font-bold mt-0.5 animate-pulse">
                            HIT: {team.landingTime} • {team.selectedTarget}
                          </span>
                        ) : (
                          <span className="text-[9px] text-gray-600 font-mono mt-0.5">STANDBY</span>
                        )}
                      </div>
                      
                      <button
                        onClick={() => deleteTeam(team.id)}
                        className="p-1.5 bg-red-950/20 text-red-500 hover:text-white hover:bg-red-900/50 rounded-lg border border-red-900/30 transition-all text-xs"
                        title="Delete this team"
                      >
                        <Trash size={13} />
                      </button>
                    </div>

                    {/* Quick Assign Dropdown selector inside Team Card */}
                    <div className="flex gap-2 mb-3">
                      <select
                        className="flex-1 bg-black border border-gray-700 rounded-lg px-2 py-1 text-xs outline-none text-gray-300 focus:border-cyan-500"
                        onChange={(e) => {
                          if (e.target.value) {
                            assignPlayerToTeam(e.target.value, team.id);
                            e.target.value = ""; // reset
                          }
                        }}
                        defaultValue=""
                      >
                        <option value="" disabled>-- Assign Unassigned Player --</option>
                        {players.filter(p => !p.teamId).map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.role})</option>
                        ))}
                      </select>
                    </div>

                    {/* Members List Drop-Target Zone */}
                    <div className="flex-1 min-h-[100px] flex flex-col justify-start">
                      <div className="flex justify-between items-center text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">
                        <span>Members ({team.players?.length || 0})</span>
                        {isDragOver && (
                          <span className="text-cyan-400 animate-pulse font-mono">DROP PLAYER HERE</span>
                        )}
                      </div>

                      {(!team.players || team.players.length === 0) ? (
                        <div className="flex-1 border border-dashed border-gray-800 rounded-lg flex items-center justify-center py-6">
                          <span className="text-xs text-gray-600 italic">Drag players here</span>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {team.players.map(p => (
                            <div 
                              key={p.id} 
                              draggable
                              onDragStart={(e) => handleDragStart(e, p.id)}
                              className="flex justify-between items-center bg-black/40 hover:bg-black/60 px-2.5 py-1.5 rounded-lg border border-gray-800/80 cursor-grab active:cursor-grabbing transition-all group/member"
                              title="Drag player to move teams or unassign"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={p.avatar || `https://ui-avatars.com/api/?name=${p.name}`} alt="" className="w-5 h-5 rounded-full" />
                                <span className="text-xs font-bold text-gray-300 truncate">{p.name}</span>
                                <span className="text-[9px] bg-cyan-950 text-cyan-400 px-1 rounded flex-none font-bold uppercase tracking-wider">{p.role}</span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-none opacity-50 group-hover/member:opacity-100 transition-opacity">
                                <Move className="w-3 h-3 text-gray-500" />
                                <button
                                  onClick={() => assignPlayerToTeam(p.id, null)}
                                  className="text-red-500 hover:text-red-400 p-0.5"
                                  title="Unassign player"
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        </div>
      </div>
    </Layout>
  );
}
