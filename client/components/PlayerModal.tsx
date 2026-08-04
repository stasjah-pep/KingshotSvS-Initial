import React, { useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { X, Swords, Shield } from 'lucide-react';
import { notify } from '../lib/toast';

const MarchTimeInput = ({ field, value, label, pId }: { field: string, value: number | null | undefined, label: string, pId: string }) => {
    const { updateMarchTimes, players, user } = useGameStore();

    // Admins and Commanders can edit any, Owners can edit their own.
    const p = players.find(player => player.id === pId);
    const canControl = user && p && (['SUPERADMIN', 'ADMIN', 'COMMANDER'].includes(user.role) || p.accountId === user.id);

    const [localValue, setLocalValue] = React.useState(value === null || value === undefined ? '' : value.toString());

    React.useEffect(() => {
        setLocalValue(value === null || value === undefined ? '' : value.toString());
    }, [value]);

    return (
        <div className="flex flex-col items-center">
            <span className="text-[9px] text-gray-500 uppercase mb-1">{label}</span>
            <input
                type="number"
                min="0"
                max="3600"
                disabled={!canControl}
                value={localValue}
                onKeyDown={(e) => e.stopPropagation()} // Prevent external capture
                onChange={(e) => {
                    if (!canControl) return;
                    let valStr = e.target.value;
                    if (valStr.length > 4) valStr = valStr.slice(0, 4);

                    setLocalValue(valStr);

                    const val = valStr === '' ? null : parseInt(valStr, 10);
                    updateMarchTimes(
                        pId,
                        field === 'mtCastle' ? val : p.mtCastle,
                        field === 'mtNorth' ? val : p.mtNorth,
                        field === 'mtEast' ? val : p.mtEast,
                        field === 'mtSouth' ? val : p.mtSouth,
                        field === 'mtWest' ? val : p.mtWest
                    );
                }}
                placeholder="--"
                className="w-10 h-8 bg-black/80 border border-gray-600 text-yellow-400 text-center text-sm font-mono rounded shadow-inner focus:outline-none focus:border-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
        </div>
    );
};

export default function PlayerModal() {
  const { players, selectedPlayerId, setSelectedPlayerId, user, startRally } = useGameStore();
  const [rallyTarget, setRallyTarget] = useState('');
  const [rallyDuration, setRallyDuration] = useState(300000); // 5 mins

  if (!selectedPlayerId) return null;

  const p = players.find(player => player.id === selectedPlayerId);
  if (!p) return null;

  const isEnemy = p.allianceId === 'enemy';
  const canControl = user && (['SUPERADMIN', 'ADMIN', 'COMMANDER'].includes(user.role) || p.accountId === user.id);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none">
      <div className="bg-black/90 border border-cyan-500/50 p-6 rounded-lg shadow-2xl pointer-events-auto min-w-[300px] backdrop-blur-sm">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.avatar} alt="" className="w-12 h-12 rounded border border-white/20" />
              <div>
                <h3 className={`text-lg font-bold ${isEnemy ? 'text-red-400' : 'text-cyan-400'}`}>{p.name}</h3>
                <div className="flex items-center gap-2">
                   <span className="text-xs bg-white/10 px-1.5 py-0.5 rounded text-gray-300">{p.role}</span>
                   <span className="text-xs font-mono text-yellow-500">PWR: {(p.power / 1000000).toFixed(1)}M</span>
                </div>
              </div>
            </div>
            <button onClick={() => setSelectedPlayerId(null)} className="text-gray-500 hover:text-white">
              <X size={20} />
            </button>
          </div>

          <div className="h-px bg-white/10 w-full" />

          <div className="flex gap-2">
              <div className={`flex-1 p-2 rounded border ${isEnemy ? 'border-red-900/50 bg-red-900/10' : 'border-cyan-900/50 bg-cyan-900/10'} flex items-center justify-center gap-2`}>
                  <Shield size={16} className={isEnemy ? 'text-red-500' : 'text-cyan-500'} />
                  <span className="text-xs font-bold text-gray-300">{isEnemy ? 'ENEMY FORCES' : 'ALLIED FORCES'}</span>
              </div>
          </div>

          {canControl && (
              <div className="flex flex-col gap-2 mt-2">
                  <label className="text-[10px] text-gray-500 uppercase font-bold">Commander Actions</label>
                  <div className="flex gap-2">
                     <input
                       type="text"
                       placeholder="Target (e.g. Castle)"
                       className="bg-black border border-gray-700 rounded px-2 py-1 text-xs text-white flex-1 outline-none focus:border-red-500"
                       value={rallyTarget}
                       onChange={e => setRallyTarget(e.target.value)}
                     />
                     <button
                       onClick={() => {
                           if (rallyTarget) {
                               startRally(p.id, rallyTarget, rallyDuration);
                               setSelectedPlayerId(null);
                               setRallyTarget('');
                           } else {
                               notify('Enter a target', 'info');
                           }
                       }}
                       className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-3 py-1 rounded flex items-center gap-1 shadow-lg shadow-red-900/20"
                     >
                         <Swords size={14} /> RALLY
                     </button>
                  </div>
              </div>
          )}

          <div className="flex flex-col gap-2 mt-2">
              <label className="text-[10px] text-gray-500 uppercase font-bold">March Times (s)</label>
              <div className="flex gap-2 justify-between bg-black/50 p-2 rounded border border-gray-800">
                  <MarchTimeInput field="mtNorth" value={p.mtNorth} label="North" pId={p.id} />
                  <MarchTimeInput field="mtEast" value={p.mtEast} label="East" pId={p.id} />
                  <MarchTimeInput field="mtCastle" value={p.mtCastle} label="Castle" pId={p.id} />
                  <MarchTimeInput field="mtSouth" value={p.mtSouth} label="South" pId={p.id} />
                  <MarchTimeInput field="mtWest" value={p.mtWest} label="West" pId={p.id} />
              </div>
          </div>

        </div>
      </div>
    </div>
  );
}
