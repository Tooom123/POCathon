import { useGameStore } from './stores/gameStore';
import { useSocket } from './hooks/useSocket';
import Lobby from './components/Lobby';
import GameScene from './components/GameScene';

export default function App() {
  useSocket();
  const lobbyCode = useGameStore((s) => s.lobbyCode);
  return lobbyCode ? <GameScene /> : <Lobby />;
}
