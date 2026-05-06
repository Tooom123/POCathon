import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, useProgress } from '@react-three/drei';
import { Suspense, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useGameStore, PlayerState } from '../stores/gameStore';
import Island from './Island';
import HUD from './HUD';
import Shop from './Shop';
import ShootingStars from './ShootingStars';
import AnimalManager from './AnimalManager';
import Leaderboard from './Leaderboard';
import Minimap from './Minimap';
import socket from '../socket';

// Island positions spread wide in space — arranged in a loose arc
function getIslandPosition(index: number, total: number): [number, number, number] {
  if (total === 1) return [0, 0, 0];
  // Spread islands far apart in a slight arc
  const spacing = 28;
  const x = (index - (total - 1) / 2) * spacing;
  // Alternate slight Z offset for depth, avoid pure line
  const z = (index % 2 === 0 ? 0 : -8) + Math.sin(index * 1.1) * 4;
  return [x, 0, z];
}

// Camera animation controller — snaps or smoothly moves to target island
function CameraController({
  targetId,
  positions,
  isSpawn,
  autoRotate,
}: {
  targetId: string | null;
  positions: Record<string, [number, number, number]>;
  isSpawn: boolean;
  autoRotate: boolean;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const targetPos    = useRef(new THREE.Vector3(0, 0, 0));
  const targetCamPos = useRef(new THREE.Vector3(0, 10, 22));
  const animating    = useRef(false);
  const snap         = useRef(false);
  const [animDone, setAnimDone] = useState(true);

  useEffect(() => {
    if (targetId && positions[targetId]) {
      const [ix, iy, iz] = positions[targetId];
      targetPos.current.set(ix, iy, iz);
      targetCamPos.current.set(ix, iy + 8, iz + 16);
    } else {
      targetPos.current.set(0, 0, 0);
      targetCamPos.current.set(0, 10, 22);
    }
    snap.current = isSpawn;
    animating.current = true;
    setAnimDone(false);
  }, [targetId]);

  useFrame(() => {
    if (!animating.current) return;

    if (snap.current) {
      camera.position.copy(targetCamPos.current);
      if (controlsRef.current) {
        controlsRef.current.target.copy(targetPos.current);
        controlsRef.current.update();
      }
      snap.current = false;
      animating.current = false;
      setAnimDone(true);
      return;
    }

    const SPEED = 0.06;
    camera.position.lerp(targetCamPos.current, SPEED);
    if (controlsRef.current) {
      controlsRef.current.target.lerp(targetPos.current, SPEED);
      controlsRef.current.update();
    }
    if (camera.position.distanceTo(targetCamPos.current) < 0.05) {
      animating.current = false;
      setAnimDone(true);
    }
  });

  // autoRotate must wait for the lerp to finish, otherwise the manual lerp
  // and OrbitControls' internal rotation step fight each other (and any user
  // zoom/pan interaction breaks it for good).
  const shouldAutoRotate = autoRotate && animDone;

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={true}
      enableZoom={true}
      minDistance={4}
      maxDistance={80}
      maxPolarAngle={Math.PI / 2.1}
      autoRotate={shouldAutoRotate}
      autoRotateSpeed={0.6}
    />
  );
}

function IslandGrid({ onIslandClick }: { onIslandClick: (id: string, pos: [number, number, number]) => void }) {
  const { players, myId, visitIsland, visitingIslandId } = useGameStore();
  const playerList = Object.values(players);

  return (
    <>
      {playerList.map((player, i) => {
        const pos = getIslandPosition(i, playerList.length);
        return (
          <Island
            key={player.id}
            player={player}
            position={pos}
            isOwn={player.id === myId}
            onClick={() => {
              const next = visitingIslandId === player.id ? null : player.id;
              visitIsland(next);
              onIslandClick(player.id, pos);
            }}
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
  const { players, visitingIslandId, visitIsland, shopOpen, myId } = useGameStore();
  const visitedPlayer = visitingIslandId ? players[visitingIslandId] : null;

  const storeMyId = myId;

  // Day → night transition based on cumulative focus minutes (capped at 60 min for full night)
  const me = myId ? players[myId] : null;
  const sessionElapsed = me?.isFocusing && me.focusStartedAt
    ? Math.floor((Date.now() - me.focusStartedAt) / 1000) : 0;
  const totalSec = (me?.totalWorkSeconds ?? 0) + sessionElapsed;
  const nightT = Math.min(totalSec / 3600, 1); // 0 = day, 1 = full night
  const bgColor = nightT < 0.5
    ? `rgb(${Math.floor(20 - nightT * 30)}, ${Math.floor(30 - nightT * 40)}, ${Math.floor(60 - nightT * 70)})`
    : `rgb(${Math.floor(5)}, ${Math.floor(8)}, ${Math.floor(20 + (1 - nightT) * 10)})`;
  const ambientIntensity = 1.2 - nightT * 0.6;
  const sunIntensity = 1.5 - nightT * 1.1;

  // Track island world positions so CameraController can target them
  const [islandPositions, setIslandPositions] = useState<Record<string, [number, number, number]>>({});
  const [cameraTarget, setCameraTarget] = useState<string | null>(null);
  const [isSpawn, setIsSpawn] = useState(false);
  const spawnedOnOwn = useRef(false);

  // Rebuild positions map whenever player list changes
  const playerList = Object.values(players);
  useEffect(() => {
    const pos: Record<string, [number, number, number]> = {};
    playerList.forEach((p, i) => {
      pos[p.id] = getIslandPosition(i, playerList.length);
    });
    setIslandPositions(pos);

    // On first load: snap camera to own island
    if (!spawnedOnOwn.current && storeMyId && pos[storeMyId]) {
      spawnedOnOwn.current = true;
      setIsSpawn(true);
      setCameraTarget(storeMyId);
    }
  }, [JSON.stringify(playerList.map(p => p.id))]);

  function handleIslandClick(id: string, pos: [number, number, number]) {
    setIslandPositions(prev => ({ ...prev, [id]: pos }));
    setIsSpawn(false);
    setCameraTarget(prev => prev === id ? null : id);
  }

  // When focus starts, snap camera to own island so particles/spotlight/rotation kick in.
  const wasFocusing = useRef(false);
  useEffect(() => {
    const focusing = !!me?.isFocusing;
    if (focusing && !wasFocusing.current && storeMyId) {
      setIsSpawn(false);
      setCameraTarget(storeMyId);
      visitIsland(storeMyId);
    }
    wasFocusing.current = focusing;
  }, [me?.isFocusing, storeMyId]);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: bgColor, transition: 'background 1s linear' }}>
      <Canvas camera={{ position: [0, 10, 22], fov: 50, near: 0.1, far: 1000 }} shadows>
        <Suspense fallback={null}>
          <Stars radius={120} depth={60} count={4000} factor={4} />

          <ambientLight intensity={ambientIntensity} color="#cceeff" />
          <directionalLight position={[8, 16, 8]}  intensity={sunIntensity} color="#fff8ee" castShadow />
          <directionalLight position={[-8, 10, -4]} intensity={0.6 - nightT * 0.3} color="#aaccff" />

          <IslandGrid onIslandClick={handleIslandClick} />
          <FocusTicker />
          <ShootingStars />

          <CameraController
            targetId={cameraTarget}
            positions={islandPositions}
            isSpawn={isSpawn}
            autoRotate={cameraTarget === storeMyId && !!me?.isFocusing}
          />
        </Suspense>
      </Canvas>

      <LoadingOverlay />
      <Leaderboard />
      {cameraTarget === storeMyId ? <AnimalManager visible={true} /> : <Minimap onIslandClick={handleIslandClick} />}
      <HUD />
      {shopOpen && <Shop />}

      {visitedPlayer && (
        <VisitOverlay
          player={visitedPlayer}
          onClose={() => { visitIsland(null); setCameraTarget(null); }}
        />
      )}
    </div>
  );
}

function LoadingOverlay() {
  const { active, progress } = useProgress();
  if (!active && progress >= 100) return null;
  return (
    <div className="loading-overlay">
      <div className="loading-card">
        <div className="loading-title">🏝️ Focus Island</div>
        <div className="loading-bar"><div className="loading-bar-fill" style={{ width: `${progress}%` }} /></div>
        <div className="loading-pct">{Math.floor(progress)}%</div>
      </div>
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
