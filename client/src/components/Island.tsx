import { useRef, useMemo } from 'react';
import { useGLTF, Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import Animal from './Animal';
import { PlayerState, useGameStore } from '../stores/gameStore';
import { getIslandLevel } from '../animals';
import { getLayout, BlockDef, DecorDef } from '../islandLayout';

export const ISLAND_SURFACE_Y = 1.05;

const BLOCK_MODELS = [
  'block-grass',
  'block-grass-large',
  'block-grass-low',
  'block-grass-corner',
  'block-grass-corner-low',
];

function BlockInstance({ def }: { def: BlockDef }) {
  const { scene } = useGLTF(`/models/blocks/${def.model}.glb`);
  const clone = useMemo(() => scene.clone(true), [scene]);
  return <primitive object={clone} position={[def.x, def.y, def.z]} rotation={[0, def.rotY, 0]} />;
}

function DecorInstance({ def }: { def: DecorDef }) {
  const { scene } = useGLTF(`/models/blocks/${def.model}.glb`);
  const clone = useMemo(() => scene.clone(true), [scene]);
  return (
    <primitive
      object={clone}
      position={[def.x, def.surfaceY, def.z]}
      rotation={[0, def.rotY, 0]}
      scale={def.scale}
    />
  );
}

function IslandBlocks({ level }: { level: number }) {
  const layout = useMemo(() => getLayout(level), [level]);
  return (
    <group>
      {layout.blocks.map((def, i) => <BlockInstance key={i} def={def} />)}
    </group>
  );
}

function IslandDecor({ level }: { level: number }) {
  const layout = useMemo(() => getLayout(level), [level]);
  return (
    <group>
      {layout.decors.map((def, i) => <DecorInstance key={i} def={def} />)}
    </group>
  );
}

// Discrete particle ribbon rising behind the island
function IslandParticles({ isFocusing }: { isFocusing: boolean }) {
  const count = 18;
  const positions = useRef<Float32Array>(new Float32Array(count * 3));
  const velocities = useRef<Float32Array>(new Float32Array(count * 3));
  const lifetimes = useRef<Float32Array>(new Float32Array(count));
  const maxLifes = useRef<Float32Array>(new Float32Array(count));
  const geoRef = useRef<THREE.BufferGeometry>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);

  // Initialize particles spread behind the island (z = -3..0)
  useMemo(() => {
    for (let i = 0; i < count; i++) {
      lifetimes.current[i] = Math.random() * 3; // stagger start
      maxLifes.current[i] = 2.5 + Math.random() * 2;
      positions.current[i * 3 + 0] = (Math.random() - 0.5) * 3.5;
      positions.current[i * 3 + 1] = Math.random() * 2;
      positions.current[i * 3 + 2] = -1.5 - Math.random() * 2;
      velocities.current[i * 3 + 0] = (Math.random() - 0.5) * 0.15;
      velocities.current[i * 3 + 1] = 0.25 + Math.random() * 0.3;
      velocities.current[i * 3 + 2] = 0;
    }
  }, []);

  useFrame((_, delta) => {
    if (!geoRef.current || !matRef.current) return;
    for (let i = 0; i < count; i++) {
      lifetimes.current[i] += delta;
      if (lifetimes.current[i] > maxLifes.current[i]) {
        // Respawn at base
        lifetimes.current[i] = 0;
        positions.current[i * 3 + 0] = (Math.random() - 0.5) * 3.5;
        positions.current[i * 3 + 1] = 0.5;
        positions.current[i * 3 + 2] = -1.5 - Math.random() * 2;
        velocities.current[i * 3 + 0] = (Math.random() - 0.5) * 0.15;
        velocities.current[i * 3 + 1] = 0.2 + Math.random() * 0.25;
      }
      positions.current[i * 3 + 0] += velocities.current[i * 3 + 0] * delta;
      positions.current[i * 3 + 1] += velocities.current[i * 3 + 1] * delta;
    }
    geoRef.current.attributes.position.needsUpdate = true;
    // Fade opacity based on focus
    const targetOpacity = isFocusing ? 0.45 : 0.15;
    matRef.current.opacity += (targetOpacity - matRef.current.opacity) * 0.05;
  });

  return (
    <points>
      <bufferGeometry ref={geoRef}>
        <bufferAttribute
          attach="attributes-position"
          args={[positions.current, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        ref={matRef}
        size={0.06}
        color="#88ccff"
        transparent
        opacity={0.15}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

interface IslandProps {
  player: PlayerState;
  position: [number, number, number];
  isOwn: boolean;
  onClick?: () => void;
}

export default function Island({ player, position, isOwn, onClick }: IslandProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { ownedAnimals, islandLevel } = useGameStore();
  const { isFocusing, name, islandIndex } = player;
  const { shopOpen } = useGameStore();

  const displayLevel = isOwn ? islandLevel : 1;
  const islandInfo = getIslandLevel(displayLevel);
  const { capacity } = islandInfo;
  const layout = useMemo(() => getLayout(displayLevel), [displayLevel]);

  const FALLBACK = ['bunny','cat','dog','chick','penguin','fox','panda','koala'];
  const animalsToShow = isOwn
    ? ownedAnimals.slice(0, capacity)
    : Array.from({ length: Math.min(player.unlockedAnimals, 4) }, (_, i) =>
        FALLBACK[(islandIndex * 3 + i) % FALLBACK.length]
      );

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    groupRef.current.position.y = position[1] + Math.sin(t * 0.4 + islandIndex * 1.3) * 0.1;
  });

  const pointColor     = isFocusing ? '#aaddff' : '#6688cc';
  const pointIntensity = isFocusing ? 3.0 : 0.9;
  const islandSize     = 3 + displayLevel * 2;

  return (
    <group ref={groupRef} position={position}>
      <pointLight position={[0, 3, 0]} color={pointColor} intensity={pointIntensity} distance={islandSize + 8} />

      <IslandBlocks level={displayLevel} />
      <IslandDecor level={displayLevel} />
      <IslandParticles isFocusing={isFocusing} />

      {animalsToShow.map((animalId, i) => (
        <Animal
          key={`${animalId}-${i}`}
          animalId={animalId}
          slot={i}
          total={animalsToShow.length}
          isFocusing={isFocusing}
          walkRadius={layout.walkRadius}
        />
      ))}

      <Html
        position={[0, ISLAND_SURFACE_Y + 2.8, 0]}
        center
        distanceFactor={12}
        style={{ pointerEvents: 'none', userSelect: 'none', visibility: shopOpen ? 'hidden' : 'visible' }}
      >
        <div className={`island-label ${isOwn ? 'island-label--own' : ''} ${isFocusing ? 'island-label--focusing' : ''}`}>
          {name}
        </div>
      </Html>

      <mesh visible={false} onClick={onClick}>
        <boxGeometry args={[islandSize + 2, 8, islandSize + 2]} />
        <meshBasicMaterial />
      </mesh>
    </group>
  );
}

BLOCK_MODELS.forEach((m) => useGLTF.preload(`/models/blocks/${m}.glb`));
useGLTF.preload('/models/blocks/tree-pine.glb');
useGLTF.preload('/models/blocks/flowers-tall.glb');
useGLTF.preload('/models/blocks/mushrooms.glb');
useGLTF.preload('/models/blocks/plant.glb');
