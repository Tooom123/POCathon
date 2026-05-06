import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useGameStore, PlayerState } from '../stores/gameStore';
import Island from './Island';
import HUD from './HUD';
import Shop from './Shop';
import ShootingStars from './ShootingStars';
import AnimalManager from './AnimalManager';
import socket from '../socket';

function IslandGrid() {
  const { players, myId, visitIsland, visitingIslandId } = useGameStore();
  const playerList = Object.values(players);

  return (
    <>
      {playerList.map((player, i) => {
        const x = (i - (playerList.length - 1) / 2) * 7;
        return (
          <Island
            key={player.id}
            player={player}
            position={[x, 0, 0]}
            isOwn={player.id === myId}
            onClick={() => visitIsland(visitingIslandId === player.id ? null : player.id)}
          />
        );
      })}
    </>
  );
}

function FocusTicker() {
  const { myId, players } = useGameStore();
  const tickRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!myId) return;
    const player = players[myId];
    if (!player?.isFocusing) {
      clearInterval(tickRef.current);
      return;
    }
    tickRef.current = setInterval(() => socket.emit('focus_tick'), 5000);
    return () => clearInterval(tickRef.current);
  }, [myId, players[myId ?? '']?.isFocusing]);

  return null;
}

export default function GameScene() {
  const { players, visitingIslandId, visitIsland, shopOpen } = useGameStore();
  const visitedPlayer = visitingIslandId ? players[visitingIslandId] : null;

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#0a0a1a' }}>
      <Canvas camera={{ position: [0, 8, 18], fov: 50 }} shadows>
        <Suspense fallback={null}>
          <Stars radius={80} depth={50} count={3000} factor={4} />

          {/* Global lighting — bright enough for Kenney Lambert materials */}
          <ambientLight intensity={1.2} color="#cceeff" />
          <directionalLight position={[8, 16, 8]}  intensity={1.5} color="#fff8ee" castShadow />
          <directionalLight position={[-8, 10, -4]} intensity={0.6} color="#aaccff" />

          <IslandGrid />
          <FocusTicker />
          <ShootingStars />

          <OrbitControls
            enablePan={true}
            enableZoom={true}
            minDistance={4}
            maxDistance={50}
            maxPolarAngle={Math.PI / 2.1}
          />
        </Suspense>
      </Canvas>

      <HUD />
      {shopOpen && <Shop />}
      <AnimalManager />

      {/* Island visit overlay */}
      {visitedPlayer && <VisitOverlay player={visitedPlayer} onClose={() => visitIsland(null)} />}
    </div>
  );
}

function formatTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function VisitOverlay({ player, onClose }: { player: PlayerState; onClose: () => void }) {
  const [, setTick] = useState(0);

  // Re-render every second to keep elapsed time live
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const sessionElapsed = player.isFocusing && player.focusStartedAt
    ? Math.floor((Date.now() - player.focusStartedAt) / 1000)
    : 0;
  const liveTotal = player.totalWorkSeconds + sessionElapsed;

  return (
    <div className="visit-overlay">
      <button className="visit-close" onClick={onClose}>✕</button>
      <h2>{player.name}</h2>
      <p>⏱ {formatTime(liveTotal)} de focus</p>
      <p>🐾 {player.unlockedAnimals} animaux débloqués</p>
      {player.isFocusing
        ? <p className="visit-focusing">🔥 En session de focus !</p>
        : <p style={{ color: '#5a7a6a', fontSize: '0.8rem' }}>Hors focus</p>
      }
      {player.isFocusing && sessionElapsed > 0 && (
        <p style={{ color: '#aaddff', fontSize: '0.8rem' }}>
          Session : {formatTime(sessionElapsed)}
        </p>
      )}
    </div>
  );
}
