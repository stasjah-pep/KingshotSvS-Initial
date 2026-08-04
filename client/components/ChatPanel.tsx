import React, { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../store/useGameStore';
import { Send, Trash } from 'lucide-react';

export default function ChatPanel() {
  const { chatLogs, sendMessage, clearChat, isConnected, toggleBlockUser, isChatSilenced, toggleChatSilence, markMessageImportant, toggleImportantAccount, isGroupingOpen } = useGameStore();
  const [input, setInput] = useState('');
  const [username, setUsername] = useState('Guest');
  const [role, setRole] = useState('USER');
  const [panelHeight, setPanelHeight] = useState(192);
  const [selectedMessage, setSelectedMessage] = useState<{ userId?: string, messageId?: number } | null>(null);
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Get user from local storage
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      setUsername(user.username);
      setRole(user.role);
    }
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLogs]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !isConnected) return;

    sendMessage(username, input, role);
    setInput('');
  };

  const handleMessageClick = (e: React.MouseEvent, senderId?: string, messageId?: number) => {
      e.stopPropagation();
      if ((role === 'ADMIN' || role === 'SUPERADMIN' || role === 'COMMANDER')) {
          if (selectedMessage?.messageId === messageId) {
              setSelectedMessage(null); // toggle off
          } else {
              setSelectedMessage({ userId: senderId, messageId: messageId });
          }
      }
  };

  const handlePanelClick = () => {
      setSelectedMessage(null);
  };

  const handleBlockUser = () => {
      if (selectedMessage && selectedMessage.userId) {
          toggleBlockUser(selectedMessage.userId);
          setSelectedMessage(null);
      }
  };

  const handleToggleImportantAccount = () => {
      if (selectedMessage && selectedMessage.userId) {
          toggleImportantAccount(selectedMessage.userId);
          setSelectedMessage(null);
      }
  };

  const handleMarkMessageImportant = () => {
      if (selectedMessage && selectedMessage.messageId) {
          markMessageImportant(selectedMessage.messageId);
          setSelectedMessage(null);
      }
  };

  return (
    <div
        className={
          isGroupingOpen
            ? "fixed left-4 bottom-4 w-80 h-72 rounded-xl border-2 border-cyan-500/80 bg-black/95 backdrop-blur-md z-[250] shadow-[0_0_30px_rgba(0,0,0,0.9)] flex flex-col transition-all duration-300 pointer-events-auto"
            : "flex flex-col w-full border-t border-[var(--grid)] bg-black/80 backdrop-blur-md z-20 shadow-[0_-5px_20px_rgba(0,0,0,0.5)] relative transition-all duration-300"
        }
        style={{ height: isGroupingOpen ? undefined : panelHeight }}
        onClick={handlePanelClick}
    >
      {/* Resizer Handle */}
      <div
         className="absolute top-0 left-0 w-full h-1 cursor-ns-resize hover:bg-cyan-500/50 z-30"
         onMouseDown={(e) => {
             e.preventDefault();
             const startY = e.clientY;
             const startHeight = panelHeight;
             const moveHandler = (moveEvent: MouseEvent) => {
                 const newHeight = startHeight - (moveEvent.clientY - startY);
                 if (newHeight > 100 && newHeight < 600) {
                     setPanelHeight(newHeight);
                 }
             };
             window.addEventListener('mousemove', moveHandler);
             window.addEventListener('mouseup', () => window.removeEventListener('mousemove', moveHandler), { once: true });
         }}
      />

      {/* Header / Status */}
      <div className="px-3 py-1 bg-black/50 border-b border-white/5 flex items-center justify-between h-8 shrink-0">
         <span className="text-[10px] text-gray-500 font-mono uppercase tracking-widest hidden sm:inline-block mr-2">Global Comms</span>

         <div className="flex flex-1 items-center gap-2 overflow-x-auto scrollbar-none pl-1">
             {(role === 'SUPERADMIN' || role === 'ADMIN' || role === 'COMMANDER') && (
                 <>
                   {selectedMessage && selectedMessage.userId && (
                       <>
                           <button
                              onClick={(e) => { e.stopPropagation(); handleBlockUser(); }}
                              className="text-[10px] text-red-400 hover:text-white px-2 py-0.5 rounded border border-red-900 transition-colors whitespace-nowrap bg-black/50"
                           >
                              BLOCK USR
                           </button>
                           <button
                              onClick={(e) => { e.stopPropagation(); handleToggleImportantAccount(); }}
                              className="text-[10px] text-yellow-400 hover:text-white px-2 py-0.5 rounded border border-yellow-900 transition-colors whitespace-nowrap bg-black/50"
                           >
                              IMP. USR
                           </button>
                       </>
                   )}
                   {selectedMessage && selectedMessage.messageId && (
                       <button
                          onClick={(e) => { e.stopPropagation(); handleMarkMessageImportant(); }}
                          className="text-[10px] text-cyan-400 hover:text-white px-2 py-0.5 rounded border border-cyan-900 transition-colors whitespace-nowrap bg-black/50"
                       >
                          IMP. MSG
                       </button>
                   )}

                   <div className="flex-1" />

                   <button
                      onClick={(e) => { e.stopPropagation(); toggleChatSilence(); }}
                      className={`text-[10px] ${isChatSilenced ? 'text-red-400 bg-red-900/20' : 'text-gray-400 hover:text-white'} px-2 py-0.5 rounded border ${isChatSilenced ? 'border-red-500' : 'border-gray-700'} transition-colors whitespace-nowrap`}
                   >
                      {isChatSilenced ? 'SILENCED' : 'SILENCE'}
                   </button>
                   <button
                      onClick={(e) => { e.stopPropagation(); clearChat(); }}
                      className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1 border border-red-900/50 px-2 py-0.5 rounded hover:bg-red-900/20 transition-colors whitespace-nowrap bg-black/50"
                   >
                      <Trash size={10} /> CLEAR
                   </button>
                 </>
             )}
          </div>
          <div className="flex items-center gap-2">
            {isGroupingOpen && (
              <button
                onClick={(e) => { e.stopPropagation(); setIsChatExpanded(false); }}
                className="text-gray-400 hover:text-white text-xs font-bold px-1 bg-gray-800 rounded border border-gray-600"
                title="Minimize Chat"
              >
                —
              </button>
            )}
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ml-1 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} title={isConnected ? "Connected" : "Disconnected"} />
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1 font-mono text-xs scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
        {chatLogs.length === 0 && (
           <div className="text-gray-600 italic text-center mt-4">No messages yet. System ready.</div>
        )}
        {chatLogs.map((msg, idx) => {
          const isSelected = selectedMessage?.messageId === msg.id;
          return (
          <div
            key={idx}
            onClick={(e) => handleMessageClick(e, msg.senderId, msg.id)}
            className={`leading-relaxed px-1 rounded transition-colors break-words cursor-pointer border ${isSelected ? 'bg-white/10 border-white/30' : 'border-transparent hover:bg-white/5'} ${msg.isImportant ? 'bg-yellow-900/20 border-l-2 border-l-yellow-500 pl-2 my-1 shadow-[0_0_10px_rgba(234,179,8,0.2)]' : ''} ${msg.isFromImportantAccount ? 'font-bold' : ''}`}
          >
            <span className="text-gray-600 mr-2 opacity-50 text-[10px]">
              {new Date(msg.timestamp).toLocaleTimeString('en-US', { timeZone: 'UTC', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className={`font-bold mr-2 tracking-wide text-[10px] ${
              msg.role === 'COMMANDER' || msg.role === 'SUPERADMIN' ? 'text-yellow-500' :
              msg.role === 'SYSTEM' ? 'text-green-500' : 'text-cyan-400'
            }`}>
              [{msg.role ? msg.role.substring(0,3) : 'USR'}] {msg.sender}:
            </span>
            <span className="text-gray-300">{msg.message}</span>
          </div>
        )})}
        <div ref={endRef} />
      </div>

      <form onSubmit={handleSend} className="flex p-2 gap-2 border-t border-white/10 bg-black/40 h-12 shrink-0 relative">
        {isChatSilenced && role !== 'ADMIN' && role !== 'SUPERADMIN' && role !== 'COMMANDER' ? (
             <div className="flex-1 flex items-center justify-center text-red-500 font-bold text-xs bg-red-900/10 border border-red-900/50 rounded">
                 CHAT SILENCED BY COMMAND
             </div>
        ) : (
            <>
                <input
                  className="flex-1 bg-black/40 border border-white/20 rounded px-3 py-1 text-sm text-white focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all placeholder-gray-600 disabled:opacity-50"
                  placeholder={isConnected ? "Type command / message..." : "Connecting to secure channel..."}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  disabled={!isConnected}
                />
                <button
                  type="submit"
                  disabled={!isConnected || !input.trim()}
                  className="px-4 py-1 bg-[var(--primary)] hover:bg-accent/20 text-accent border border-accent/50 rounded transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send size={16} />
                </button>
            </>
        )}
      </form>
    </div>
  );
}
