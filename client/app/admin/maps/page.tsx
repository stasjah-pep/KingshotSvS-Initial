'use client';
import { useState, useEffect } from 'react';
import Layout from '../../../components/Layout';
import { useGameStore, MapLayout } from '../../../store/useGameStore';
import { Plus, Save, Trash, CheckCircle } from 'lucide-react';

export default function MapBuilder() {
  const { maps, activeMap, fetchMaps, saveMap, deleteMap, setActiveMap } = useGameStore();
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);

  useEffect(() => {
    fetchMaps();
  }, [fetchMaps]);

  // Local state for the currently edited map
  const [localMapData, setLocalMapData] = useState<any>(null);

  // Editor mode
  const [editorMode, setEditorMode] = useState<'VIEW' | 'BLOCK' | 'BUILDING'>('VIEW');
  const [isDrawingBlock, setIsDrawingBlock] = useState(false);
  const [drawModeValue, setDrawModeValue] = useState(true); // true = adding block, false = removing block

  // Building Editor State
  const [newElement, setNewElement] = useState({
      name: 'New Base',
      type: 'base',
      width: 2,
      height: 2,
      color: '#3b82f6'
  });

  // Set selected map when active map loads or changes
  useEffect(() => {
      if (!selectedMapId && activeMap) {
          setSelectedMapId(activeMap.id);
      }
  }, [activeMap, selectedMapId]);

  // Handle new map creation selection
  useEffect(() => {
      const handleMapCreated = (data: any) => {
          setSelectedMapId(data.map.id);
      };

      const socket = useGameStore.getState().socket;
      if (socket) {
          socket.on('admin:map_created', handleMapCreated);
          return () => { socket.off('admin:map_created', handleMapCreated); }
      }
  }, []);

  const currentMap = maps.find(m => m.id === selectedMapId) || activeMap;

  // Sync local state when map selection changes
  useEffect(() => {
      if (currentMap) {
          setLocalMapData({
              id: currentMap.id,
              name: currentMap.name,
              size: currentMap.size,
              elements: JSON.parse(currentMap.elements || '[]'),
              blockZones: JSON.parse(currentMap.blockZones || '[]')
          });
      } else {
          setLocalMapData(null);
      }
  }, [currentMap?.id, currentMap?.size, currentMap?.name]);

  const handleCreateNew = () => {
      const newMap = {
          name: 'New Map Layout',
          size: 40,
          elements: '[]',
          blockZones: '[]'
      };
      saveMap(newMap);
      // Let the socket return the new map to set it. We can just wait.
  };

  const handleSave = () => {
      if (localMapData && !currentMap?.isDefault) {
          saveMap({
              id: localMapData.id,
              name: localMapData.name,
              size: localMapData.size,
              elements: JSON.stringify(localMapData.elements),
              blockZones: JSON.stringify(localMapData.blockZones)
          });
      }
  };

  const handleSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newSize = parseInt(e.target.value);
      if (!isNaN(newSize) && newSize > 0) {
          setLocalMapData({ ...localMapData, size: newSize });
      }
  };

  const handleCellMouseDown = (x: number, y: number) => {
      if (editorMode !== 'BLOCK' || currentMap?.isDefault) return;

      const isCurrentlyBlocked = localMapData.blockZones.some((z: any) => z.x === x && z.y === y);
      const newDrawMode = !isCurrentlyBlocked;
      setDrawModeValue(newDrawMode);
      setIsDrawingBlock(true);
      applyBlockToggle(x, y, newDrawMode);
  };

  const handleCellMouseEnter = (x: number, y: number) => {
      if (editorMode !== 'BLOCK' || !isDrawingBlock || currentMap?.isDefault) return;
      applyBlockToggle(x, y, drawModeValue);
  };

  const handleMouseUp = () => {
      setIsDrawingBlock(false);
  };

  useEffect(() => {
      window.addEventListener('mouseup', handleMouseUp);
      return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const applyBlockToggle = (x: number, y: number, block: boolean) => {
      setLocalMapData((prev: any) => {
          let newZones = [...prev.blockZones];
          if (block) {
              if (!newZones.some((z: any) => z.x === x && z.y === y)) {
                  newZones.push({ x, y });
              }
          } else {
              newZones = newZones.filter((z: any) => !(z.x === x && z.y === y));
          }
          return { ...prev, blockZones: newZones };
      });
  };

  const handleDragStart = (e: React.DragEvent, source: 'NEW' | 'EXISTING', id?: string) => {
      if (editorMode !== 'BUILDING' || currentMap?.isDefault) return;
      e.dataTransfer.setData('source', source);
      if (id) e.dataTransfer.setData('id', id);
  };

  const handleDrop = (e: React.DragEvent, targetX: number, targetY: number) => {
      if (editorMode !== 'BUILDING' || currentMap?.isDefault) return;
      e.preventDefault();

      const source = e.dataTransfer.getData('source');

      if (source === 'NEW') {
          const el = {
              id: `${newElement.type}_${Date.now()}`,
              ...newElement,
              x: targetX,
              y: targetY
          };
          setLocalMapData((prev: any) => ({
              ...prev,
              elements: [...prev.elements, el]
          }));
      } else if (source === 'EXISTING') {
          const id = e.dataTransfer.getData('id');
          setLocalMapData((prev: any) => ({
              ...prev,
              elements: prev.elements.map((el: any) => el.id === id ? { ...el, x: targetX, y: targetY } : el)
          }));
      }
  };

  const handleDragOver = (e: React.DragEvent) => {
      if (editorMode !== 'BUILDING' || currentMap?.isDefault) return;
      e.preventDefault();
  };

  const handleDeleteElement = (id: string) => {
      if (currentMap?.isDefault) return;
      setLocalMapData((prev: any) => ({
          ...prev,
          elements: prev.elements.filter((el: any) => el.id !== id)
      }));
  };

  return (
    <Layout>
      <div className="flex h-full w-full bg-black/90 text-white overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-gray-900 border-r border-gray-700 flex flex-col">
          <div className="p-4 border-b border-gray-700">
            <h2 className="text-xl font-bold text-accent mb-4">Map Layouts</h2>
            <button
              onClick={handleCreateNew}
              className="w-full flex items-center justify-center gap-2 bg-accent/20 text-accent border border-accent/50 hover:bg-accent hover:text-black py-2 rounded transition-colors"
            >
              <Plus size={18} /> New Layout
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {maps.map(m => (
              <div
                key={m.id}
                onClick={() => setSelectedMapId(m.id)}
                className={`p-3 rounded mb-2 cursor-pointer border transition-colors ${selectedMapId === m.id ? 'bg-white/10 border-accent' : 'bg-transparent border-transparent hover:bg-white/5'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold">{m.name}</span>
                  {m.isActive && <div title="Active Map"><CheckCircle size={16} className="text-green-500" /></div>}
                </div>
                <div className="text-xs text-gray-500 mt-1">{m.size}x{m.size} Grid</div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Editor Area */}
        <div className="flex-1 flex flex-col">
           {localMapData ? (
               <div className="flex-1 flex flex-col p-4 overflow-hidden">
                  <div className="flex justify-between items-center mb-4 flex-none">
                     <div className="flex items-center gap-4">
                        <input
                            type="text"
                            value={localMapData.name}
                            disabled={currentMap?.isDefault}
                            onChange={(e) => setLocalMapData({ ...localMapData, name: e.target.value })}
                            className={`bg-transparent text-2xl font-bold text-white outline-none border-b border-dashed border-gray-500 focus:border-accent w-64 ${currentMap?.isDefault ? 'opacity-50 cursor-not-allowed' : ''}`}
                        />
                        <div className="flex items-center gap-2 text-gray-400">
                            <span>Size:</span>
                            <input
                                type="number"
                                value={localMapData.size}
                                disabled={currentMap?.isDefault}
                                onChange={handleSizeChange}
                                className={`w-16 bg-black border border-gray-600 rounded px-2 py-1 text-center ${currentMap?.isDefault ? 'opacity-50 cursor-not-allowed' : ''}`}
                                min="10"
                                max="100"
                            />
                        </div>
                        {currentMap?.isDefault && (
                            <span className="text-xs bg-accent/20 text-accent px-2 py-1 rounded border border-accent/30 font-bold uppercase tracking-wider">
                                Default Map
                            </span>
                        )}
                     </div>
                     <div className="flex gap-2">
                         {!currentMap?.isActive && (
                            <button
                                onClick={() => localMapData.id && setActiveMap(localMapData.id)}
                                className="px-4 py-2 bg-green-900/50 text-green-400 border border-green-500/50 hover:bg-green-600 hover:text-white rounded transition-colors"
                            >
                                Set as Active
                            </button>
                         )}
                         {!currentMap?.isDefault && (
                             <>
                                 <button
                                    onClick={handleSave}
                                    className="flex items-center gap-2 px-4 py-2 bg-accent/20 text-accent border border-accent/50 hover:bg-accent hover:text-black rounded transition-colors"
                                 >
                                     <Save size={18} /> Save
                                 </button>
                                 <button
                                     onClick={() => localMapData.id && deleteMap(localMapData.id)}
                                     disabled={currentMap?.isActive}
                                     className="flex items-center gap-2 px-4 py-2 bg-danger/20 text-danger border border-danger/50 hover:bg-danger hover:text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                 >
                                     <Trash size={18} /> Delete
                                 </button>
                             </>
                         )}
                     </div>
                  </div>

                  {/* Editor Toolbar */}
                  <div className="flex items-center gap-2 mb-4 bg-gray-900 p-2 rounded border border-gray-700">
                      <button
                          onClick={() => setEditorMode('VIEW')}
                          className={`px-3 py-1 rounded text-sm ${editorMode === 'VIEW' ? 'bg-accent text-black' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                      >
                          View Map
                      </button>
                      <button
                          onClick={() => setEditorMode('BLOCK')}
                          className={`px-3 py-1 rounded text-sm ${editorMode === 'BLOCK' ? 'bg-accent text-black' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                      >
                          Block Zones Painter
                      </button>
                      <button
                          onClick={() => setEditorMode('BUILDING')}
                          className={`px-3 py-1 rounded text-sm ${editorMode === 'BUILDING' ? 'bg-accent text-black' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                      >
                          Target/Building Editor
                      </button>

                      {editorMode === 'BUILDING' && (
                          <div className="ml-auto flex items-center gap-4 text-sm bg-black/50 p-2 rounded border border-gray-800">
                              <input
                                  type="text"
                                  value={newElement.name}
                                  onChange={(e) => setNewElement({...newElement, name: e.target.value})}
                                  placeholder="Name"
                                  className="bg-gray-800 border border-gray-600 rounded px-2 py-1 w-24"
                              />
                              <input
                                  type="text"
                                  value={newElement.type}
                                  onChange={(e) => setNewElement({...newElement, type: e.target.value})}
                                  placeholder="Type (e.g. castle)"
                                  className="bg-gray-800 border border-gray-600 rounded px-2 py-1 w-24"
                              />
                              <div className="flex items-center gap-1">
                                  <span>W:</span>
                                  <input
                                      type="number"
                                      value={newElement.width}
                                      onChange={(e) => setNewElement({...newElement, width: parseInt(e.target.value) || 1})}
                                      className="bg-gray-800 border border-gray-600 rounded px-1 py-1 w-12"
                                  />
                              </div>
                              <div className="flex items-center gap-1">
                                  <span>H:</span>
                                  <input
                                      type="number"
                                      value={newElement.height}
                                      onChange={(e) => setNewElement({...newElement, height: parseInt(e.target.value) || 1})}
                                      className="bg-gray-800 border border-gray-600 rounded px-1 py-1 w-12"
                                  />
                              </div>
                              <input
                                  type="color"
                                  value={newElement.color}
                                  onChange={(e) => setNewElement({...newElement, color: e.target.value})}
                                  className="w-8 h-8 rounded cursor-pointer p-0 border-0 bg-transparent"
                              />

                              <div
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, 'NEW')}
                                  className="flex items-center justify-center border-2 border-dashed border-accent text-accent px-4 py-1 rounded cursor-grab active:cursor-grabbing hover:bg-accent/10"
                              >
                                  Drag Me
                              </div>
                          </div>
                      )}
                  </div>

                  <div className="flex-1 bg-gray-900 border border-gray-700 rounded-lg overflow-auto relative flex items-center justify-center p-20">
                     <div
                         className="relative bg-black/60 shadow-2xl"
                         style={{
                             display: 'grid',
                             gridTemplateColumns: `repeat(${localMapData.size}, 2rem)`,
                             gridTemplateRows: `repeat(${localMapData.size}, 2rem)`,
                             width: `fit-content`,
                             transform: 'rotate(45deg)',
                             transformOrigin: 'center center',
                             cursor: editorMode === 'BLOCK' ? 'crosshair' : 'default',
                             userSelect: 'none'
                         }}
                         onMouseLeave={handleMouseUp}
                     >
                         {/* Background Grid Cells */}
                         {Array.from({ length: localMapData.size * localMapData.size }).map((_, i) => {
                             const x = i % localMapData.size;
                             const y = Math.floor(i / localMapData.size);
                             const isBlocked = localMapData.blockZones.some((z: any) => z.x === x && z.y === y);

                             return (
                                 <div
                                     key={i}
                                    title={`X: ${x}, Y: ${y}`}
                                    style={{
                                        gridColumn: x + 1,
                                        gridRow: y + 1
                                    }}
                                     onMouseDown={(e) => { e.preventDefault(); handleCellMouseDown(x, y); }}
                                     onMouseEnter={() => handleCellMouseEnter(x, y)}
                                     onDragOver={handleDragOver}
                                     onDrop={(e) => handleDrop(e, x, y)}
                                     className={`w-8 h-8 border border-white/5 ${isBlocked ? 'bg-red-500/40 border-red-500' : ''} ${editorMode === 'BLOCK' ? 'hover:bg-red-500/60 hover:border-red-400' : 'hover:bg-white/10'}`}
                                 />
                             );
                         })}

                         {/* Elements Overlay */}
                         {localMapData.elements.map((el: any) => (
                             <div
                                 key={el.id}
                                 draggable={editorMode === 'BUILDING'}
                                 onDragStart={(e) => handleDragStart(e, 'EXISTING', el.id)}
                                 style={{
                                     gridColumn: `${el.x + 1} / span ${el.width}`,
                                     gridRow: `${el.y + 1} / span ${el.height}`,
                                     backgroundColor: el.color || '#3b82f6',
                                     cursor: editorMode === 'BUILDING' ? 'grab' : 'default',
                                     pointerEvents: editorMode === 'BUILDING' ? 'auto' : 'none',
                                     zIndex: 10
                                 }}
                                 className="relative border-2 border-white/30 rounded flex items-center justify-center text-xs font-bold text-center p-1 shadow-lg active:cursor-grabbing hover:border-white group"
                             >
                                 <span className="truncate w-full rotate-[-45deg]">{el.name}</span>

                                 {editorMode === 'BUILDING' && (
                                     <button
                                        onClick={() => handleDeleteElement(el.id)}
                                        className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110"
                                     >
                                        <Trash size={12} />
                                     </button>
                                 )}
                             </div>
                         ))}
                     </div>
                  </div>
               </div>
           ) : (
               <div className="flex-1 flex items-center justify-center text-gray-500">
                   Select or create a map layout to begin.
               </div>
           )}
        </div>
      </div>
    </Layout>
  );
}
