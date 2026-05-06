import { useEffect } from 'react';
import socket from '../socket';
import { useGameStore, PlayerState } from '../stores/gameStore';

export function useSocket() {
  const { setLobby, addPlayer, removePlayer, updatePlayer, updatePlayerTick, ownedAnimals, islandLevel, placedDecors } = useGameStore();

  useEffect(() => {
    socket.on('lobby_joined', ({ code, myId, players }: { code: string; myId: string; players: Record<string, PlayerState> }) => {
      setLobby(code, myId, players);
      // Send our local state to the server right after joining
      const { ownedAnimals: animals, islandLevel: level, placedDecors } = useGameStore.getState();
      socket.emit('sync_state', { ownedAnimals: animals, islandLevel: level, placedDecors });
    });

    socket.on('player_joined', (player: PlayerState) => addPlayer(player));
    socket.on('player_left', (id: string) => removePlayer(id));
    socket.on('player_updated', (player: PlayerState) => updatePlayer(player));
    socket.on('player_tick', ({ id, liveTotal, liveUnlocked, incomePerSec }: { id: string; liveTotal: number; liveUnlocked: number; incomePerSec?: number }) => {
      updatePlayerTick(id, liveTotal, liveUnlocked, incomePerSec);
    });

    // Heartbeat response
    socket.on('ping', () => socket.emit('pong_ack'));

    return () => {
      socket.off('lobby_joined');
      socket.off('player_joined');
      socket.off('player_left');
      socket.off('player_updated');
      socket.off('player_tick');
      socket.off('ping');
    };
  }, []);

  // Sync state whenever owned animals, island level, or decors change
  useEffect(() => {
    if (!socket.connected) return;
    socket.emit('sync_state', { ownedAnimals, islandLevel, placedDecors });
  }, [JSON.stringify(ownedAnimals), islandLevel, JSON.stringify(placedDecors)]);
}
