import { useRef, useMemo } from 'react';
import { useGLTF, Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import Animal from './Animal';
import { PlayerState, useGameStore } from '../stores/gameStore';
import { getIslandLevel } from '../animals';
import { getLayout, BlockDef } from '../islandLayout';

export const ISLAND_SURFACE_Y = 1.05;

// Preload all block models
const BLOCK_MODELS = [
  'block-grass',
  'block-grass-large',
  'block-grass-low',
  'block-grass-edge',
  'block-grass-corner',
  'block-grass-corner-low',
];

function BlockInstance({ def }: { def: BlockDef }) {
  const { scene } = useGLTF(`/models/blocks/${def.model}.glb`);
  const clone = useMemo(() => scene.clone(true), [scene]);
  return (
    <primitive
      object={clone}
      position={[def.x, def.y, def.z]}
      rotation={[0, def.rotY, 0]}
    />
  );
}

function IslandBlocks({ level }: { level: number }) {
  const layout = useMemo(() => getLayout(level), [level]);
  return (
    <group>
      {layout.blocks.map((def, i) => (
        <BlockInstance key={i} def={def} />
      ))}
    </group>
  );
}

function IslandDecor({ level, animalCount }: { level: number; animalCount: number }) {
  const { scene: treeScene }   = useGLTF('/models/blocks/tree-pine.glb');
  const { scene: flowerScene } = useGLTF('/models/blocks/flowers-tall.glb');
  const { scene: mushScene }   = useGLTF('/models/blocks/mushrooms.glb');
  const { scene: plantScene }  = useGLTF('/models/blocks/plant.glb');

  const r = 0.8 + level * 0.3;

  return (
    <group position={[0, ISLAND_SURFACE_Y, 0]}>
      {animalCount >= 2  && <primitive object={flowerScene.clone(true)} position={[ r * 0.6, 0, -r * 0.7]} scale={0.6} />}
      {animalCount >= 3  && <primitive object={treeScene.clone(true)}   position={[-r, 0, -r]}               scale={0.7} />}
      {animalCount >= 4  && <primitive object={mushScene.clone(true)}   position={[-r * 0.5, 0, r]}          scale={0.6} />}
      {animalCount >= 6  && <primitive object={treeScene.clone(true)}   position={[ r, 0, r * 0.7]}          scale={0.6} />}
      {animalCount >= 8  && <primitive object={plantScene.clone(true)}  position={[ 0, 0, -r * 0.9]}         scale={0.6} />}
      {animalCount >= 10 && <primitive object={flowerScene.clone(true)} position={[-r * 0.8, 0, -r * 0.4]}  scale={0.5} />}
    </group>
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

  // Gentle floating animation
  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    groupRef.current.position.y = position[1] + Math.sin(t * 0.4 + islandIndex * 1.3) * 0.1;
  });

  const pointColor     = isFocusing ? '#ffdd66' : '#6688cc';
  const pointIntensity = isFocusing ? 4.5 : 0.9;
  const islandSize     = 3 + displayLevel * 2;

  return (
    <group ref={groupRef} position={position}>
      <pointLight position={[0, 3, 0]} color={pointColor} intensity={pointIntensity} distance={islandSize + 8} />

      {isFocusing && (
        <mesh position={[0, ISLAND_SURFACE_Y + 2.5, 0]}>
          <sphereGeometry args={[0.22, 8, 8]} />
          <meshBasicMaterial color="#ffee88" transparent opacity={0.9} />
        </mesh>
      )}

      <IslandBlocks level={displayLevel} />
      <IslandDecor level={displayLevel} animalCount={animalsToShow.length} />

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
        <div className={`island-label ${isOwn ? 'island-label--own' : ''}`}>
          {name}{isFocusing ? ' 🔥' : ''}
        </div>
      </Html>

      {/* Invisible click zone */}
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
