'use client';
import { useState, useEffect } from 'react';
import Layout from '../../../components/Layout';
import { useGameStore } from '../../../store/useGameStore';
import { Trash, Users, UserPlus } from 'lucide-react';

export default function TeamManagement() {
  const { teams, players, fetchTeams, createTeam, deleteTeam, assignPlayerToTeam } = useGameStore();
  const [newTeamName, setNewTeamName] = useState('');
  const [isEnemyTeam, setIsEnemyTeam] = useState(false);

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

  return (
    <Layout>
      <div className="p-8 text-white h-full overflow-y-auto">
        <h1 className="text-3xl font-bold mb-8 text-cyan-400">TEAM MANAGEMENT</h1>

        {/* Create Team Form */}
        <div className="mb-8 p-4 bg-gray-900/50 border border-gray-700 rounded-lg max-w-xl">
            <h2 className="text-xl font-bold mb-4 text-cyan-200">CREATE NEW TEAM</h2>
            <form onSubmit={handleCreateTeam} className="flex gap-4 items-end flex-wrap">
                <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">TEAM NAME</label>
                    <input
                        type="text"
                        required
                        value={newTeamName}
                        onChange={e => setNewTeamName(e.target.value)}
                        className="w-full bg-black/40 border border-gray-600 rounded px-3 py-2 text-sm focus:border-cyan-500 outline-none"
                    />
                </div>
                <div className="flex items-center gap-2 pb-2">
                    <input
                        type="checkbox"
                        id="isEnemy"
                        checked={isEnemyTeam}
                        onChange={(e) => setIsEnemyTeam(e.target.checked)}
                        className="w-4 h-4 accent-red-500"
                    />
                    <label htmlFor="isEnemy" className="text-sm font-bold text-red-400">ENEMY TEAM</label>
                </div>
                <button type="submit" className="px-4 py-2 bg-cyan-700 hover:bg-cyan-600 rounded text-white font-bold text-sm">
                    CREATE TEAM
                </button>
            </form>
        </div>

        {/* Teams List */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {teams.map(team => (
            <div key={team.id} className={`bg-gray-800/50 border rounded-lg p-4 ${team.isEnemy ? 'border-red-900/50 shadow-[0_0_15px_rgba(220,38,38,0.1)]' : 'border-gray-700'}`}>
              <div className="flex justify-between items-center mb-4 border-b border-gray-700 pb-2">
                <div className="flex flex-col">
                  <h3 className={`text-xl font-bold flex items-center gap-2 ${team.isEnemy ? 'text-red-400' : 'text-cyan-300'}`}>
                    <Users className="w-5 h-5" /> {team.name}
                  </h3>
                  {team.isEnemy && <span className="text-[10px] font-bold text-red-500 tracking-wider">ENEMY FORCES</span>}
                </div>
                <button
                  onClick={() => deleteTeam(team.id)}
                  className="bg-red-900/30 hover:bg-red-900/50 text-red-400 px-3 py-1 rounded text-sm border border-red-800/50 flex items-center gap-1"
                >
                  <Trash size={14} /> DELETE TEAM
                </button>
              </div>

              {/* Assign Player */}
              <div className="flex gap-2 mb-4">
                <select
                  className="flex-1 bg-black/40 border border-gray-600 rounded px-3 py-1 text-sm focus:border-cyan-500 outline-none text-gray-300"
                  onChange={(e) => {
                    if (e.target.value) {
                      assignPlayerToTeam(e.target.value, team.id);
                      e.target.value = ""; // reset
                    }
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>-- Assign Player --</option>
                  {players.filter(p => p.teamId !== team.id).map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.role})</option>
                  ))}
                </select>
                <button className="bg-green-700/50 text-green-300 px-3 py-1 rounded border border-green-700" title="Select a player to assign them to this team">
                    <UserPlus size={16} />
                </button>
              </div>

              {/* Team Members */}
              <div className="space-y-2">
                <h4 className="text-xs text-gray-500 uppercase font-bold mb-2">Members ({team.players?.length || 0})</h4>
                {(!team.players || team.players.length === 0) ? (
                  <p className="text-sm text-gray-600 italic">No members assigned.</p>
                ) : (
                  team.players.map(p => (
                    <div key={p.id} className="flex justify-between items-center bg-black/30 p-2 rounded border border-gray-700/50">
                      <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.avatar || `https://ui-avatars.com/api/?name=${p.name}`} alt="" className="w-6 h-6 rounded-full" />
                        <span className="text-sm font-bold text-gray-300">{p.name}</span>
                        <span className="text-[10px] bg-cyan-900/30 text-cyan-400 px-1 rounded">{p.role}</span>
                      </div>
                      <button
                        onClick={() => assignPlayerToTeam(p.id, null)}
                        className="text-red-500 hover:text-red-400 p-1"
                        title="Remove from team"
                      >
                        <Trash size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
