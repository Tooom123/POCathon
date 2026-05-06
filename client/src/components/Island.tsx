import { useRef, useMemo } from 'react';
import { useGLTF, Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import Animal from './Animal';
import { PlayerState, useGameStore } from '../stores/gameStore';
import { SHOP_ANIMALS, getIslandLevel } from '../animals';
import { getLayout, BlockDef, DecorDef } from '../islandLayout';

export const ISLAND_SURFACE_Y = 1.0; // exact top of standard block

const BLOCK_MODELS = [
  'block-grass',
  'block-grass-large',
  'block-grass-long',
  'block-grass-low',
  'block-grass-low-large',
  'block-grass-edge',
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

  const displayLevel = isOwn ? islandLevel : (player.islandLevel ?? 1);
  const islandInfo = getIslandLevel(displayLevel);
  const { capacity } = islandInfo;
  const layout = useMemo(() => getLayout(displayLevel), [displayLevel]);

  const FALLBACK = ['bunny','cat','dog','chick','penguin','fox','panda','koala'];
  const animalsToShow = isOwn
    ? ownedAnimals.slice(0, capacity)
    : (player.ownedAnimals && player.ownedAnimals.length > 0
        ? player.ownedAnimals.slice(0, capacity)
        : Array.from({ length: Math.min(player.unlockedAnimals, 4) }, (_, i) =>
            FALLBACK[(islandIndex * 3 + i) % FALLBACK.length]
          ));

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    groupRef.current.position.y = position[1] + Math.sin(t * 0.4 + islandIndex * 1.3) * 0.1;
  });

  const pointColor     = isFocusing ? '#aaddff' : '#6688cc';
  const pointIntensity = isFocusing ? 3.0 : 0.9;
  const islandSize     = 3 + displayLevel * 2;

  // Island block scale: makes islands larger so animals have room to roam
  const ISLAND_SCALE = 1.6;

  return (
    <group ref={groupRef} position={position}>
      <pointLight position={[0, 3, 0]} color={pointColor} intensity={pointIntensity} distance={islandSize + 8} />

      {/* All island geometry + animals share the same scale so animals sit on exact surface */}
      <group scale={ISLAND_SCALE}>
        <IslandBlocks level={displayLevel} />
        <IslandDecor level={displayLevel} />

        {animalsToShow.map((animalId, i) => {
          const animalData = SHOP_ANIMALS.find(a => a.id === animalId);
          const rarity = animalData?.rarity ?? 'common';
          return (
            <Animal
              key={`${animalId}-${i}`}
              animalId={animalId}
              slot={i}
              total={animalsToShow.length}
              isFocusing={isFocusing}
              walkRadius={layout.walkRadius}
              rarity={rarity}
            />
          );
        })}
      </group>

      <Html
        position={[0, 1.0 * 1.6 + 3.5, 0]}
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
useGLTF.preload('/models/blocks/tree-pine-snow-small.glb');
useGLTF.preload('/models/blocks/flowers-tall.glb');
useGLTF.preload('/models/blocks/mushrooms.glb');
useGLTF.preload('/models/blocks/plant.glb');
