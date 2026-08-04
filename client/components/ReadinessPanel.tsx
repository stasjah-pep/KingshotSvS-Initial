'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { useGameStore, Player } from '../store/useGameStore';
import { X, ClipboardCheck, Search, AlertTriangle } from 'lucide-react';

type MtKey = 'mtCastle' | 'mtNorth' | 'mtEast' | 'mtSouth' | 'mtWest';

const BUILDINGS: { key: MtKey; label: string; short: string }[] = [
  { key: 'mtCastle', label: 'Castle', short: 'CSTL' },
  { key: 'mtNorth', label: 'North', short: 'N' },
  { key: 'mtEast', label: 'East', short: 'E' },
  { key: 'mtSouth', label: 'South', short: 'S' },
  { key: 'mtWest', label: 'West', short: 'W' },
];

const mtVal = (p: Player, key: MtKey): number | null => {
  const v = p[key];
  return v && v > 0 ? v : null;
};

type Availability = 'online' | 'away' | 'offline';

const AVAIL_DOT: Record<Availability, string> = {
  online: 'bg-green-500',
  away: 'bg-yellow-500',
  offline: 'bg-gray-600',
};
const AVAIL_TEXT: Record<Availability, string> = {
  online: 'text-green-400',
  away: 'text-yellow-400',
  offline: 'text-gray-500',
};

/** Inline-editable march-time cell — commander/admin can fix a player's times right from the roster. */
function MtCell({ player, mtKey }: { player: Player; mtKey: MtKey }) {
  const updateMarchTimes = useGameStore((s) => s.updateMarchTimes);
  const raw = mtVal(player, mtKey);
  const [val, setVal] = useState(raw != null ? String(raw) : '');

  useEffect(() => {
    setVal(raw != null ? String(raw) : '');
  }, [raw]);

  const commit = () => {
    const num = val === '' ? null : parseInt(val, 10);
    updateMarchTimes(
      player.id,
      mtKey === 'mtCastle' ? num : player.mtCastle,
      mtKey === 'mtNorth' ? num : player.mtNorth,
      mtKey === 'mtEast' ? num : player.mtEast,
      mtKey === 'mtSouth' ? num : player.mtSouth,
      mtKey === 'mtWest' ? num : player.mtWest
    );
  };

  return (
    <input
      value={val}
      inputMode="numeric"
      placeholder="—"
      onChange={(e) => setVal(e.target.value.replace(/\D/g, '').slice(0, 4))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      title={`${player.name} — march time to ${mtKey.replace('mt', '')} (seconds)`}
      className={`w-12 py-0.5 text-center text-[11px] font-mono rounded border bg-black/60 outline-none focus:border-cyan-400 ${
        val ? 'text-green-300 border-gray-700' : 'text-red-400/70 border-red-800/50'
      }`}
    />
  );
}

/**
 * Command overview: who's online / away / offline, and every allied player's march-time
 * completeness — editable inline. Intentionally *not* a gate: nothing here blocks scheduling,
 * deploying, or copying a plan. Players who aren't ready are simply left out of the copied plan.
 */
export default function ReadinessPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { players, teams, user, presence } = useGameStore();
  const [query, setQuery] = useState('');

  const isAuthorized = Boolean(user && ['SUPERADMIN', 'ADMIN', 'COMMANDER'].includes(user.role));

  const allied = useMemo(() => players.filter((p) => p.allianceId === 'ally'), [players]);

  const availabilityOf = (p: Player): Availability =>
    p.accountId && presence[p.accountId] ? (presence[p.accountId] as Availability) : 'offline';

  const teamNameFor = (p: Player) => teams.find((t) => t.players.some((tp) => tp.id === p.id))?.name || '—';

  const filtered = useMemo(
    () => allied.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())),
    [allied, query]
  );

  const total = allied.length;
  const buildingSummary = BUILDINGS.map((b) => ({ ...b, set: allied.filter((p) => mtVal(p, b.key) != null).length }));
  const missingAny = allied.filter((p) => BUILDINGS.some((b) => mtVal(p, b.key) == null)).length;
  const presenceCount = { online: 0, away: 0, offline: 0 } as Record<Availability, number>;
  allied.forEach((p) => { presenceCount[availabilityOf(p)] += 1; });

  if (!isOpen || !isAuthorized) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-md flex flex-col items-center justify-start p-4 pt-24 overflow-y-auto pointer-events-auto animate-in fade-in">
      <div className="relative w-full max-w-5xl max-h-[82vh] rounded-xl border border-cyan-500/50 bg-gray-950/95 shadow-2xl flex flex-col gap-4 p-5 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3 flex-none">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="w-6 h-6 text-cyan-400" />
            <div>
              <h2 className="text-lg font-black tracking-widest text-white uppercase">Readiness Overview</h2>
              <p className="text-xs text-gray-400 max-w-2xl">
                Presence and march-time completeness — edit any march time inline. Advisory only; nothing here is
                required. Players without a march time are just left out of the copied plan.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-300 hover:text-white bg-gray-800 hover:bg-red-600 rounded-lg border border-gray-600 hover:border-red-400 transition-colors shrink-0"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary chips */}
        <div className="flex flex-wrap items-center gap-2 flex-none">
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full border border-green-600/50 text-green-300 bg-green-900/20 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500" /> {presenceCount.online} online
          </span>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full border border-yellow-600/40 text-yellow-300 bg-yellow-900/10 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-yellow-500" /> {presenceCount.away} away
          </span>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full border border-gray-600/40 text-gray-400 bg-gray-800/40 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-gray-600" /> {presenceCount.offline} offline
          </span>
          <span className="text-gray-600 mx-1">·</span>
          {buildingSummary.map((s) => (
            <span
              key={s.label}
              className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${
                total > 0 && s.set === total
                  ? 'border-green-600/50 text-green-300 bg-green-900/20'
                  : 'border-yellow-600/40 text-yellow-300 bg-yellow-900/10'
              }`}
            >
              {s.label} {s.set}/{total}
            </span>
          ))}
          {missingAny > 0 && (
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full border border-red-600/40 text-red-300 bg-red-900/10 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {missingAny} missing ≥1 time
            </span>
          )}
        </div>

        {/* Search */}
        <div className="relative flex-none">
          <Search className="w-4 h-4 text-gray-500 absolute left-2.5 top-2.5" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search player..."
            className="w-full bg-black border border-gray-700 pl-8 pr-3 py-1.5 text-sm text-white rounded-lg outline-none focus:border-cyan-400 font-mono"
          />
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto rounded-lg border border-white/10">
          <table className="w-full text-sm border-collapse min-w-[600px]">
            <thead className="sticky top-0 bg-gray-900/95 z-10">
              <tr>
                <th className="text-left px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-gray-400">Status</th>
                <th className="text-left px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-gray-400">Player</th>
                <th className="text-left px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-gray-400">Team</th>
                {BUILDINGS.map((b) => (
                  <th key={b.label} className="px-2 py-2 text-[10px] font-mono uppercase tracking-wider text-gray-400 text-center">
                    {b.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={3 + BUILDINGS.length} className="text-center text-gray-600 italic py-6 text-xs">
                    No allied players.
                  </td>
                </tr>
              )}
              {filtered.map((p) => {
                const avail = availabilityOf(p);
                return (
                  <tr key={p.id} className="border-t border-white/5 hover:bg-white/5">
                    <td className="px-3 py-1.5">
                      <span className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${AVAIL_DOT[avail]}`} />
                        <span className={`text-[10px] font-mono uppercase ${AVAIL_TEXT[avail]}`}>{avail}</span>
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-gray-200 font-medium truncate max-w-[160px]">{p.name}</td>
                    <td className="px-3 py-1.5 text-gray-500 text-xs font-mono truncate max-w-[120px]">{teamNameFor(p)}</td>
                    {BUILDINGS.map((b) => (
                      <td key={b.label} className="px-2 py-1.5 text-center">
                        <MtCell player={p} mtKey={b.key} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-gray-500 flex-none">
          Fill in the ⟶ empty cells to include a player in the plan — but you can deploy and copy the battle plan
          for everyone who&apos;s ready right now. The plan text is the source of truth.
        </p>
      </div>
    </div>
  );
}
