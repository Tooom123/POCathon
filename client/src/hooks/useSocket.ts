import { useEffect } from 'react';
import socket from '../socket';
import { useGameStore, PlayerState } from '../stores/gameStore';

export function useSocket() {
  const { setLobby, addPlayer, removePlayer, updatePlayer, updatePlayerTick } = useGameStore();

  useEffect(() => {
    socket.on('lobby_joined', ({ code, myId, players }: { code: string; myId: string; players: Record<string, PlayerState> }) => {
      setLobby(code, myId, players);
    });

    socket.on('player_joined', (player: PlayerState) => addPlayer(player));
    socket.on('player_left', (id: string) => removePlayer(id));
    socket.on('player_updated', (player: PlayerState) => updatePlayer(player));
    socket.on('player_tick', ({ id, liveTotal, liveUnlocked }: { id: string; liveTotal: number; liveUnlocked: number }) => {
      updatePlayerTick(id, liveTotal, liveUnlocked);
    });

    return () => {
      socket.off('lobby_joined');
      socket.off('player_joined');
      socket.off('player_left');
      socket.off('player_updated');
      socket.off('player_tick');
    };
  }, []);
}
