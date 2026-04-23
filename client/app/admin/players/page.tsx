'use client';
import { useState, useEffect } from 'react';
import Layout from '../../../components/Layout';
import { useGameStore } from '../../../store/useGameStore';
import { CheckCircle, ShieldAlert, Trash } from 'lucide-react';

export default function PlayerManagement() {
  const { players, users, verifyPlayer, deletePlayer, addPlayer, fetchUsers } = useGameStore();
  const [filter, setFilter] = useState<'ALL' | 'PENDING'>('ALL');

  const [formData, setFormData] = useState({
    name: '',
    power: 10000000,
    role: 'REINFORCER',
    allianceId: 'ally',
    accountId: ''
  });

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const pendingPlayers = players.filter(p => p.status === 'PENDING' as any);
  const displayedPlayers = filter === 'ALL' ? players : pendingPlayers;

  const handleCreatePlayer = (e: React.FormEvent) => {
    e.preventDefault();
    addPlayer(formData);
    setFormData({ name: '', power: 10000000, role: 'REINFORCER', allianceId: 'ally', accountId: '' });
  };

  return (
    <Layout>
      <div className="p-8 text-white h-full overflow-y-auto">
        <h1 className="text-3xl font-bold mb-8 text-cyan-400">PLAYER MANAGEMENT</h1>

        {/* Add Player Form */}
        <div className="mb-8 p-4 bg-gray-900/50 border border-gray-700 rounded-lg max-w-5xl">
            <h2 className="text-xl font-bold mb-4 text-cyan-200">ADD NEW PLAYER</h2>
            <form onSubmit={handleCreatePlayer} className="flex gap-4 items-end flex-wrap">
                <div>
                    <label className="block text-xs text-gray-500 mb-1">NAME</label>
                    <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                        className="bg-black/40 border border-gray-600 rounded px-3 py-2 text-sm focus:border-cyan-500 outline-none"
                    />
                </div>
                <div>
                    <label className="block text-xs text-gray-500 mb-1">POWER</label>
                    <input
                        type="number"
                        required
                        value={formData.power}
                        onChange={e => setFormData({...formData, power: parseInt(e.target.value)})}
                        className="bg-black/40 border border-gray-600 rounded px-3 py-2 text-sm focus:border-cyan-500 outline-none w-32"
                    />
                </div>
                <div>
                    <label className="block text-xs text-gray-500 mb-1">ROLE</label>
                    <select
                        value={formData.role}
                        onChange={e => setFormData({...formData, role: e.target.value})}
                        className="bg-black/40 border border-gray-600 rounded px-3 py-2 text-sm focus:border-cyan-500 outline-none w-32"
                    >
                        <option value="COMMANDER">COMMANDER</option>
                        <option value="RALLY_LEADER">RALLY_LEADER</option>
                        <option value="CASTLE_TEAM">CASTLE_TEAM</option>
                        <option value="TURRET_TEAM">TURRET_TEAM</option>
                        <option value="REINFORCER">REINFORCER</option>
                        <option value="HITMAN">HITMAN</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs text-gray-500 mb-1">ALLIANCE</label>
                    <select
                        value={formData.allianceId}
                        onChange={e => setFormData({...formData, allianceId: e.target.value})}
                        className="bg-black/40 border border-gray-600 rounded px-3 py-2 text-sm focus:border-cyan-500 outline-none w-32"
                    >
                        <option value="ally">ALLIES</option>
                        <option value="enemy">ENEMIES</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs text-gray-500 mb-1">LINK ACCOUNT</label>
                    <select
                        value={formData.accountId}
                        onChange={e => setFormData({...formData, accountId: e.target.value})}
                        className="bg-black/40 border border-gray-600 rounded px-3 py-2 text-sm focus:border-cyan-500 outline-none w-40"
                    >
                        <option value="">-- None --</option>
                        {users.map(u => (
                            <option key={u.id} value={u.id}>{u.username}</option>
                        ))}
                    </select>
                </div>
                <button type="submit" className="px-4 py-2 bg-cyan-700 hover:bg-cyan-600 rounded text-white font-bold text-sm">
                    CREATE
                </button>
            </form>
        </div>

        <div className="flex gap-4 mb-8">
            <button
                onClick={() => setFilter('ALL')}
                className={`px-4 py-2 rounded font-bold text-sm transition-colors ${filter === 'ALL' ? 'bg-cyan-700 text-white' : 'bg-gray-800 text-gray-400'}`}
            >
                ALL PLAYERS
            </button>
            <button
                onClick={() => setFilter('PENDING')}
                className={`px-4 py-2 rounded font-bold text-sm transition-colors flex items-center gap-2 ${filter === 'PENDING' ? 'bg-yellow-700 text-white' : 'bg-gray-800 text-gray-400'}`}
            >
                PENDING REQUESTS
                {pendingPlayers.length > 0 && (
                    <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full">{pendingPlayers.length}</span>
                )}
            </button>
        </div>

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-700 text-gray-400">
              <th className="p-4">NAME</th>
              <th className="p-4">ROLE</th>
              <th className="p-4">POWER</th>
              <th className="p-4">STATUS</th>
              <th className="p-4">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {displayedPlayers.map(player => (
              <tr key={player.id} className="border-b border-gray-800 hover:bg-white/5">
                <td className="p-4 flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={player.avatar} alt="" className="w-8 h-8 rounded-full" />
                    <span className="font-bold">{player.name}</span>
                </td>
                <td className="p-4">
                  <span className="text-xs bg-black/40 px-2 py-1 rounded text-cyan-200">
                    {player.role}
                  </span>
                </td>
                <td className="p-4 font-mono text-gray-300">
                  {player.power.toLocaleString()}
                </td>
                <td className="p-4">
                  {player.status === 'PENDING' ? (
                      <span className="text-yellow-500 font-bold flex items-center gap-1 animate-pulse">
                          <ShieldAlert size={14}/> PENDING
                      </span>
                  ) : (
                      <span className="text-green-500 font-bold flex items-center gap-1">
                          <CheckCircle size={14}/> ACTIVE
                      </span>
                  )}
                </td>
                <td className="p-4 flex gap-2">
                  {player.status === 'PENDING' && (
                      <button
                        onClick={() => verifyPlayer(player.id)}
                        className="bg-green-700 hover:bg-green-600 text-white px-3 py-1 rounded text-sm shadow-lg"
                      >
                        APPROVE
                      </button>
                  )}
                  <button
                    onClick={() => deletePlayer(player.id)}
                    className="bg-red-900/30 hover:bg-red-900/50 text-red-400 px-3 py-1 rounded text-sm border border-red-800/50"
                  >
                    <Trash size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
