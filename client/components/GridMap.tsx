import React from 'react';
import { useGameStore, Rally } from '../store/useGameStore';

const GRID_SIZE = 40;

import { Target, X, Trash, Swords, Shield } from 'lucide-react';

const MarchTimeInput = ({ field, value, onChange }: { field: string, value: number | null | undefined, onChange: (val: number | null) => void }) => {
  const [localValue, setLocalValue] = React.useState(value === null || value === undefined ? '' : value.toString());

  React.useEffect(() => {
    setLocalValue(value === null || value === undefined ? '' : value.toString());
  }, [value]);

  return (
    <input
      type="number"
      min="0"
      max="99"
      value={localValue}
      onKeyDown={(e) => e.stopPropagation()} // Prevent external capture
      onChange={(e) => {
        let val = e.target.value;
        // Limit to 2 digits
        if (val.length > 2) val = val.slice(0, 2);

        setLocalValue(val);
        if (val === '') onChange(null);
        else onChange(parseInt(val, 10));
      }}
      onClick={(e) => e.stopPropagation()}
      placeholder="--"
      className="w-10 h-8 bg-black/80 border border-gray-600 text-yellow-400 text-center text-sm font-mono rounded pointer-events-auto shadow-xl focus:outline-none focus:border-yellow-400 rotate-[-45deg] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
    />
  );
};

const RallyLines = () => {
  const { rallies, players, serverTimeOffset, activeMap } = useGameStore();
  const [currentTime, setCurrentTime] = React.useState(Date.now() - serverTimeOffset);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now() - serverTimeOffset);
    }, 100); // 100ms for smooth animation
    return () => clearInterval(interval);
  }, [serverTimeOffset]);

  if (rallies.length === 0) return null;

  // Helper to get building center coordinates (in em/rem units, matching grid 2rem scale)
  const getTargetCoords = (target: string) => {
    const t = target.toLowerCase().replace(/ /g, '_');

    if (activeMap) {
        const elements = JSON.parse(activeMap.elements || '[]');
        const el = elements.find((e: any) => e.name.toLowerCase().replace(/ /g, '_') === t || e.type.toLowerCase().replace(/ /g, '_') === t);
        if (el) {
            // Return center of the element
            return { x: (el.x + el.width / 2) * 2, y: (el.y + el.height / 2) * 2 };
        }
    }

    // Fallback if not found in map
    if (t.includes('castle')) return { x: 20 * 2, y: 20 * 2 };
    if (t.includes('north')) return { x: 15 * 2, y: 15 * 2 };
    if (t.includes('east')) return { x: 25 * 2, y: 15 * 2 };
    if (t.includes('south')) return { x: 25 * 2, y: 25 * 2 };
    if (t.includes('west')) return { x: 15 * 2, y: 25 * 2 };

    return { x: 20 * 2, y: 20 * 2 }; // Default center
  };

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" style={{ overflow: 'visible' }}>
      {rallies.map(rally => {
        const initiator = players.find(p => p.id === rally.initiatorId);
        if (!initiator || initiator.x === null || initiator.y === null) return null;

        // Player is 2x2, center is x+1, y+1
        const startX = (initiator.x + 1) * 2;
        const startY = (initiator.y + 1) * 2;
        const targetCoords = getTargetCoords(rally.target);

        const isEnemy = initiator.allianceId === 'enemy';
        const isMarching = rally.marchEndTime && currentTime > rally.endTime && currentTime <= rally.marchEndTime;

        // Calculate progress for the marching dot
        let progress = 0;
        if (isMarching && rally.marchTime) {
           const elapsed = currentTime - rally.endTime;
           progress = Math.min(1, Math.max(0, elapsed / rally.marchTime));
        }

        const dotX = startX + (targetCoords.x - startX) * progress;
        const dotY = startY + (targetCoords.y - startY) * progress;

        const lineColor = isMarching ? (isEnemy ? '#ef4444' : '#06b6d4') : '#9ca3af'; // Lighter grey for better visibility
        const lineStrokeWidth = isMarching ? "0.3" : "0.2"; // Thicker lines
        const strokeDasharray = isMarching ? "none" : "0.6, 0.6"; // Adjusted dashes

        return (
          <g key={rally.id}>
             {/* Line Background (Glow) */}
             {isMarching && (
                 <line
                    x1={`${startX}rem`}
                    y1={`${startY}rem`}
                    x2={`${targetCoords.x}rem`}
                    y2={`${targetCoords.y}rem`}
                    stroke={lineColor}
                    strokeWidth="0.8rem"
                    className="opacity-20"
                 />
             )}
             {/* Main Line */}
             <line
                x1={`${startX}rem`}
                y1={`${startY}rem`}
                x2={`${targetCoords.x}rem`}
                y2={`${targetCoords.y}rem`}
                stroke={lineColor}
                strokeWidth={`${lineStrokeWidth}rem`}
                strokeDasharray={strokeDasharray}
                className={isMarching ? "opacity-100 drop-shadow-[0_0_5px_currentColor]" : "opacity-70 drop-shadow-[0_0_2px_#ffffff]"}
             />

             {/* Moving Dot */}
             {isMarching && (
                <circle
                   cx={`${dotX}rem`}
                   cy={`${dotY}rem`}
                   r="0.4rem"
                   fill="#ffffff"
                   stroke={lineColor}
                   strokeWidth="0.1rem"
                   className="animate-pulse drop-shadow-[0_0_8px_currentColor]"
                />
             )}
          </g>
        );
      })}
    </svg>
  );
};

export default function GridMap() {
  const { players, movePlayer, landings, selectedTarget, selectTarget, cancelLanding, removePlayerFromMap, setSelectedPlayerId, user, updateMarchTimes, selectedBuilding, selectBuilding, rallies, activeMap } = useGameStore();
  const [zoom, setZoom] = React.useState(1);
  const GRID_SIZE = activeMap ? activeMap.size : 40;

  const myPlayer = React.useMemo(() => {
    return user ? players.find(p => p.accountId === user.id) : null;
  }, [user, players]);

  const handleMarchTimeUpdate = (field: string, value: number | null) => {
    if (myPlayer) {
      let customTimes: Record<string, any> = {};
      try {
        customTimes = JSON.parse(myPlayer.customMarchTimes || '{}');
      } catch (e) {}

      if (!['mtCastle', 'mtNorth', 'mtEast', 'mtSouth', 'mtWest'].includes(field)) {
        (customTimes as any)[field] = value;
      }

      updateMarchTimes(
        myPlayer.id,
        field === 'mtCastle' ? value : myPlayer.mtCastle,
        field === 'mtNorth' ? value : myPlayer.mtNorth,
        field === 'mtEast' ? value : myPlayer.mtEast,
        field === 'mtSouth' ? value : myPlayer.mtSouth,
        field === 'mtWest' ? value : myPlayer.mtWest,
        customTimes
      );
    }
  };
  const [dragOverTrash, setDragOverTrash] = React.useState(false);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.2, 2.5));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.2, 0.5));

  const handleDragStart = (e: React.DragEvent, playerId: string) => {
    e.dataTransfer.setData('playerId', playerId);
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleDragOver = (e: React.DragEvent, _x: number, _y: number) => {
    e.preventDefault(); // Allow drop
    // We don't need to do anything here except prevent default to allow drop
  };

  const handleDrop = (e: React.DragEvent, x: number, y: number) => {
    e.preventDefault();
    const playerId = e.dataTransfer.getData('playerId');
    if (playerId) {
      // Validate bounds (Player is 2x2)
      if (x + 2 > GRID_SIZE || y + 2 > GRID_SIZE) return;
      movePlayer(playerId, x, y);
    }
  };

  // Trash Drop
  const handleTrashDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setDragOverTrash(true);
  };

  const handleTrashLeave = () => {
      setDragOverTrash(false);
  };

  const handleTrashDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setDragOverTrash(false);
      const playerId = e.dataTransfer.getData('playerId');
      if (playerId) {
          removePlayerFromMap(playerId);
      }
  };

  // Render Grid Cells
  const renderCells = () => {
    const cells = [];
    const blockZones = activeMap ? JSON.parse(activeMap.blockZones || '[]') : [];

    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        // Dynamic block zones based on active map
        const isRestricted = activeMap ? blockZones.some((z: any) => z.x === x && z.y === y) : (x >= 14 && x < 26 && y >= 14 && y < 26);
        const isSelected = selectedTarget?.x === x && selectedTarget?.y === y;

        cells.push(
          <div
            key={`${x}-${y}`}
            title={`X: ${x}, Y: ${y}`}
            style={{
              gridColumn: x + 1,
              gridRow: y + 1
            }}
            className={`
              w-8 h-8 border border-white/5
              ${isRestricted ? 'bg-red-900/20' : 'hover:bg-white/10'}
              ${isSelected ? 'bg-yellow-500/30 border-yellow-400' : ''}
              transition-colors
            `}
            onDragOver={(e) => handleDragOver(e, x, y)}
            onDrop={(e) => handleDrop(e, x, y)}
            onClick={(e) => {
              e.stopPropagation();
              selectBuilding(null);
              selectTarget(x, y);
            }}
          />
        );
      }
    }
    return cells;
  };

  const renderElements = () => {
      if (!activeMap) return null;
      const elements = JSON.parse(activeMap.elements || '[]');

      return elements.map((el: any) => {
          const isSelected = selectedBuilding === el.name.toLowerCase().replace(/ /g, '_');

          // Map building name to mt field
          let mtField = el.name.toLowerCase().replace(/ /g, '_');
          const lowerName = el.name.toLowerCase();
          if (lowerName.includes('castle')) mtField = 'mtCastle';
          else if (lowerName.includes('north')) mtField = 'mtNorth';
          else if (lowerName.includes('east')) mtField = 'mtEast';
          else if (lowerName.includes('south')) mtField = 'mtSouth';
          else if (lowerName.includes('west')) mtField = 'mtWest';

          let currentValue = null;
          if (myPlayer) {
              if (['mtCastle', 'mtNorth', 'mtEast', 'mtSouth', 'mtWest'].includes(mtField)) {
                  currentValue = (myPlayer as any)[mtField];
              } else {
                  try {
                      const customTimes = JSON.parse(myPlayer.customMarchTimes || '{}');
                      currentValue = customTimes[mtField] || null;
                  } catch (e) {
                      currentValue = null;
                  }
              }
          }

          return (
             <div
                 key={el.id}
                 onClick={(e) => {
                     e.stopPropagation();
                     setSelectedPlayerId(null);
                     selectBuilding(el.name.toLowerCase().replace(/ /g, '_'));
                     selectTarget(Math.floor(el.x + el.width / 2), Math.floor(el.y + el.height / 2));
                 }}
                 className={`absolute flex items-center justify-center cursor-pointer pointer-events-auto border-2 transition-colors z-10
                     ${isSelected ? 'border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.8)]' : 'border-white/50 shadow-lg'}
                 `}
                 style={{
                     left: `${el.x * 2}rem`,
                     top: `${el.y * 2}rem`,
                     width: `${el.width * 2}rem`,
                     height: `${el.height * 2}rem`,
                     backgroundColor: el.color || '#3b82f6'
                 }}
             >
                 {/* Visual label for the element */}
                 <div className="absolute -top-6 text-[10px] text-white font-bold whitespace-nowrap rotate-[-45deg] pointer-events-none drop-shadow-md">
                     {el.name}
                 </div>

                 {/* March Time Input */}
                 {mtField && myPlayer && (
                     <div className="absolute z-30 pointer-events-auto">
                        <MarchTimeInput
                           field={mtField}
                           value={currentValue}
                           onChange={(val) => handleMarchTimeUpdate(mtField, val)}
                        />
                     </div>
                 )}
             </div>
          );
      });
  };

  // Render Landings
  const renderLandings = () => {
    return landings.map((l, idx) => {
      // Find how many landings share this same spot that came BEFORE this one
      const sameSpotIndex = landings.slice(0, idx).filter(other => other.x === l.x && other.y === l.y).length;

      // Determine if this is a building center (needs offset to avoid input box)
      let isBuilding = false;
      if (activeMap) {
          const elements = JSON.parse(activeMap.elements || '[]');
          isBuilding = elements.some((el: any) => l.x >= el.x && l.x < el.x + el.width && l.y >= el.y && l.y < el.y + el.height);
      } else {
          const isCastle = l.x >= 18 && l.x <= 21 && l.y >= 18 && l.y <= 21;
          const isNorthTurret = l.x >= 13 && l.x <= 14 && l.y >= 13 && l.y <= 14;
          const isSouthTurret = l.x >= 23 && l.x <= 24 && l.y >= 23 && l.y <= 24;
          const isWestTurret = l.x >= 13 && l.x <= 14 && l.y >= 23 && l.y <= 24;
          const isEastTurret = l.x >= 23 && l.x <= 24 && l.y >= 13 && l.y <= 14;
          isBuilding = isCastle || isNorthTurret || isSouthTurret || isWestTurret || isEastTurret;
      }

      // The grid is rotated 45 degrees.
      // To move "up" visually on screen, we need to subtract from both X and Y.
      // To move "right" visually, we add to X and subtract from Y.
      // Base offset if it's on a building, plus stacked offset
      const baseOffsetX = isBuilding ? -2.5 : 0;
      const baseOffsetY = isBuilding ? -2.5 : 0;

      // Stacking logic: stack them side-by-side horizontally across the screen
      // Visually moving right = +X, -Y in rotated coordinates.
      const horizontalSpacing = 2.0; // rem units
      const stackOffsetX = baseOffsetX + (sameSpotIndex * horizontalSpacing);
      const stackOffsetY = baseOffsetY + (sameSpotIndex * -horizontalSpacing);

      return (
      <div
        key={l.id}
        className="absolute z-20 flex flex-col items-center pointer-events-auto transition-transform"
        style={{
          left: `${l.x * 2}rem`,
          top: `${l.y * 2}rem`,
          width: '2rem',
          height: '2rem',
          transform: `translate(${stackOffsetX}rem, ${stackOffsetY}rem)`
        }}
      >
        <div className="relative group">
          <Target className="w-8 h-8 text-yellow-500 animate-ping absolute opacity-75" />
          <Target className="w-8 h-8 text-yellow-500 relative z-10 drop-shadow-[0_0_5px_rgba(234,179,8,0.8)]" />

          {/* Cancel Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              cancelLanding(l.id);
            }}
            className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-0.5 hover:bg-red-500 z-30 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Cancel Landing"
          >
            <X className="w-3 h-3" />
          </button>

          {/* Info Tooltip */}
          <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-black/90 border border-yellow-500/50 text-white text-[10px] p-1 rounded whitespace-nowrap z-30 rotate-[-45deg] pointer-events-none">
            <div className="text-yellow-400 font-bold">TARGET: {l.time}</div>
            <div className="text-gray-300">{l.assignedTo}</div>
          </div>
        </div>
      </div>
      );
    });
  };

  // Render Placed Players
  const renderPlayers = () => {
    return players.map((p) => {
      if (p.x === null || p.y === null) return null;

      return (
        <div
          key={p.id}
          draggable
          onDragStart={(e) => handleDragStart(e, p.id)}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedPlayerId(p.id);
          }}
          className={`
            absolute z-10 transition-all duration-300 ease-out
            flex items-center justify-center
            group cursor-grab active:cursor-grabbing pointer-events-auto
          `}
          style={{
            // Grid is 40x40. Each cell is 2rem (w-8).
            // Left = x * 2rem
            // Top = y * 2rem
            // Width = 2 * 2rem = 4rem (w-16)
            left: `${p.x * 2}rem`,
            top: `${p.y * 2}rem`,
            width: '4rem',
            height: '4rem',
          }}
        >
          {/* Player Token */}
          <div className={`
            w-[90%] h-[90%] shadow-lg
            ${p.allianceId === 'ally' ? 'bg-cyan-900/80 border-2 border-cyan-400' : 'bg-red-900/80 border-2 border-red-500'}
            rounded-md flex flex-col items-center justify-center p-1 relative
          `}>
             {/* eslint-disable-next-line @next/next/no-img-element */}
             <img
               src={p.avatar}
               alt={p.name}
               className="w-full h-full object-cover rounded opacity-80 group-hover:opacity-100"
             />
             {/* Status Badge */}
             {p.status !== 'IDLE' && (
               <div className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-yellow-500 animate-pulse border border-black" />
             )}
          </div>

          {/* Tooltip on Hover */}
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/80 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-20 rotate-[-45deg]">
            {p.name}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="w-full h-full overflow-auto flex items-center justify-center bg-black/40 relative" onClick={() => {
      setSelectedPlayerId(null);
      selectBuilding(null);
    }}>
      {/* Zoom Controls */}
      <div className="fixed bottom-8 right-8 flex flex-col gap-2 z-50">
        <button
          onClick={handleZoomIn}
          className="w-10 h-10 bg-gray-800 border border-gray-600 text-white rounded-full flex items-center justify-center hover:bg-gray-700 shadow-lg"
          title="Zoom In"
        >
          +
        </button>
        <button
          onClick={handleZoomOut}
          className="w-10 h-10 bg-gray-800 border border-gray-600 text-white rounded-full flex items-center justify-center hover:bg-gray-700 shadow-lg"
          title="Zoom Out"
        >
          -
        </button>
      </div>

      {/* Remove Zone (Trash) */}
      <div
        className={`fixed bottom-8 left-8 w-16 h-16 rounded-full border-2 flex items-center justify-center transition-all z-[50] ${dragOverTrash ? 'bg-red-500/50 border-red-400 scale-110 shadow-[0_0_20px_rgba(239,68,68,0.5)]' : 'bg-gray-800 border-gray-600 text-gray-400 opacity-50 hover:opacity-100'}`}
        onDragOver={handleTrashDragOver}
        onDragLeave={handleTrashLeave}
        onDrop={handleTrashDrop}
        title="Drag player here to remove from map"
      >
        <Trash size={24} className={dragOverTrash ? 'text-white animate-bounce' : ''} />
      </div>


      {/* Scrollable/Zoomable Container */}
      <div className="relative p-20 transition-transform duration-200 ease-out" style={{ transform: `scale(${zoom})` }}>
        {/* The Rotated Grid Container */}
        <div
          className="relative grid bg-black/60 shadow-2xl shadow-purple-900/20"
          onClick={(e) => {
              // Ensure clicking the grid background also closes it
              setSelectedPlayerId(null);
              selectBuilding(null);
          }}
          style={{
            gridTemplateColumns: `repeat(${GRID_SIZE}, 2rem)`,
            gridTemplateRows: `repeat(${GRID_SIZE}, 2rem)`,
            width: `${GRID_SIZE * 2}rem`,
            height: `${GRID_SIZE * 2}rem`,
            transform: 'rotate(45deg)', // Diamond shape
            transformOrigin: 'center center',
          }}
        >
          {/* Background Grid Cells */}
          {renderCells()}

          {/* Player Layer (Overlay) */}
          <div className="absolute inset-0 pointer-events-none">
             {/* We need pointer-events-auto on children */}
             <div className="relative w-full h-full pointer-events-none">
               <RallyLines />
               {renderPlayers()}
               {renderLandings()}
             </div>
          </div>

          {/* Dynamic Map Elements */}
          {renderElements()}

        </div>
      </div>
    </div>
  );
}