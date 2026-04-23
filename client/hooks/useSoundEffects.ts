import { useEffect, useRef } from 'react';
import { useGameStore, Rally, Landing } from '../store/useGameStore';

export function useSoundEffects() {
  const { rallies, landings, tickerMsg, players, soundVolume, soundMuted, teams } = useGameStore();

  const prevRalliesRef = useRef<Rally[]>([]);
  const prevLandingsRef = useRef<Landing[]>([]);
  const prevTickerMsgRef = useRef<string>('');

  const playTone = (type: 'important' | 'enemyRally' | 'friendlyRally' | 'marching' | 'landingSet' | 'cancelled') => {
    if (soundMuted || typeof window === 'undefined') return;

    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;

      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      // Basic synthesizer
      gainNode.gain.value = soundVolume;
      const now = ctx.currentTime;

      switch (type) {
        case 'important':
          osc.type = 'square';
          osc.frequency.setValueAtTime(800, now);
          osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
          osc.start(now);
          osc.stop(now + 0.3);
          break;
        case 'enemyRally':
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(150, now);
          osc.frequency.linearRampToValueAtTime(100, now + 0.5);
          gainNode.gain.linearRampToValueAtTime(0.01, now + 0.5);
          osc.start(now);
          osc.stop(now + 0.5);
          break;
        case 'friendlyRally':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(400, now);
          osc.frequency.setValueAtTime(600, now + 0.2);
          gainNode.gain.linearRampToValueAtTime(0.01, now + 0.4);
          osc.start(now);
          osc.stop(now + 0.4);
          break;
        case 'marching':
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(300, now);
          osc.frequency.setValueAtTime(250, now + 0.1);
          osc.frequency.setValueAtTime(300, now + 0.2);
          gainNode.gain.linearRampToValueAtTime(0.01, now + 0.3);
          osc.start(now);
          osc.stop(now + 0.3);
          break;
        case 'landingSet':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(600, now);
          osc.frequency.exponentialRampToValueAtTime(800, now + 0.2);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
          osc.start(now);
          osc.stop(now + 0.4);
          break;
        case 'cancelled':
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(300, now);
          osc.frequency.exponentialRampToValueAtTime(100, now + 0.3);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
          osc.start(now);
          osc.stop(now + 0.3);
          break;
      }
    } catch (e) {
      console.warn("Audio Context failed:", e);
    }
  };

  const isPlayerMuted = (playerId: string) => {
    const p = players.find(p => p.id === playerId);
    return p?.isMuted === true;
  };

  const isTeamMuted = (teamName: string) => {
      // If any player in the team is muted, or perhaps all? Let's say if it's assigned to a specific muted player name or team.
      // Assuming 'assignedTo' might be a team name or player name.
      const team = teams.find(t => t.name === teamName);
      if (team) {
          return team.players.some(p => p.isMuted);
      }
      return false; // Not a recognized team, or no players muted
  };

  useEffect(() => {
    const prevRallies = prevRalliesRef.current;
    const prevLandings = prevLandingsRef.current;

    // Check Rallies
    if (rallies.length > prevRallies.length) {
      const newRallies = rallies.filter(r => !prevRallies.some(pr => pr.id === r.id));
      newRallies.forEach(r => {
         if (isPlayerMuted(r.initiatorId)) return;

         const p = players.find(p => p.id === r.initiatorId);
         if (p && p.allianceId === 'enemy') {
             playTone('enemyRally');
         } else {
             playTone('friendlyRally');
         }
      });
    } else if (rallies.length < prevRallies.length) {
       // A rally was cancelled or ended. Check if it was manually cancelled (deleted before end time)
       // Simplified: any disappearance before standard time could be a cancel, but usually we just play 'cancelled' if removed and wasn't at end time.
       const removedRallies = prevRallies.filter(pr => !rallies.some(r => r.id === pr.id));
       removedRallies.forEach(r => {
           if (isPlayerMuted(r.initiatorId)) return;
           // If it was marching, it might just naturally end. But usually 'rally cancel' is what we want.
           // Play cancel sound for all removed rallies as a simple approximation if we can't tell exactly.
           playTone('cancelled');
       });
    }

    // Check Marching status (Rallies transitioning)
    // Actually, server updates player status to 'MARCHING' when rally time ends.
    // So we could listen to player status changes instead, but a simple way is checking the rallies array.

    // Check Landings
    if (landings.length > prevLandings.length) {
       const newLandings = landings.filter(l => !prevLandings.some(pl => pl.id === l.id));
       newLandings.forEach(l => {
           if (isTeamMuted(l.assignedTo)) return;
           playTone('landingSet');
       });
    } else if (landings.length < prevLandings.length) {
       const removedLandings = prevLandings.filter(pl => !landings.some(l => l.id === pl.id));
       removedLandings.forEach(l => {
           if (isTeamMuted(l.assignedTo)) return;
           playTone('cancelled');
       });
    }

    prevRalliesRef.current = rallies;
    prevLandingsRef.current = landings;
  }, [rallies, landings, players, teams]);

  useEffect(() => {
    if (tickerMsg && tickerMsg !== prevTickerMsgRef.current && prevTickerMsgRef.current !== '') {
       playTone('important');
    }
    prevTickerMsgRef.current = tickerMsg;
  }, [tickerMsg]);

  // Player status 'MARCHING' detection
  const prevPlayersRef = useRef(players);
  useEffect(() => {
      const prevPlayers = prevPlayersRef.current;
      players.forEach(p => {
          const prevP = prevPlayers.find(prev => prev.id === p.id);
          if (prevP && prevP.status !== 'MARCHING' && p.status === 'MARCHING') {
              if (!p.isMuted) {
                  playTone('marching');
              }
          }
      });
      prevPlayersRef.current = players;
  }, [players]);

}