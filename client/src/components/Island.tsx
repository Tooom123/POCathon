import { useRef, useMemo } from 'react';
import { useGLTF, Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import Animal from './Animal';
import { PlayerState, useGameStore } from '../stores/gameStore';
import { getIslandLevel } from '../animals';

// Exact block width from GLB bounding box: [-0.541, 0.541] = 1.082 wide
const BLOCK_W = 1.082;
// Block height: y goes [0, 1], so top surface at y = 1
export const ISLAND_SURFACE_Y = 1.05;

/** Generate centered N×N grid of [x, z] positions */
function makeGrid(n: number): Array<[number, number]> {
  const positions: Array<[number, number]> = [];
  const offset = ((n - 1) / 2) * BLOCK_W;
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      positions.push([col * BLOCK_W - offset, row * BLOCK_W - offset]);
    }
  }
  return positions;
}

function IslandBlocks({ gridN }: { gridN: number }) {
  const { scene } = useGLTF('/models/blocks/block-grass.glb');
  const positions = useMemo(() => makeGrid(gridN), [gridN]);

  // Clone once per position; memoize to avoid re-cloning each frame
  const clones = useMemo(() => {
    return positions.map(([x, z]) => {
      const clone = scene.clone(true);
      return { x, z, clone };
    });
  }, [scene, positions]);

  return (
    <group>
      {clones.map(({ x, z, clone }, i) => (
        <primitive key={i} object={clone} position={[x, 0, z]} />
      ))}
    </group>
  );
}

/** Stone underside gives the floating island silhouette */
function IslandBottom({ gridN }: { gridN: number }) {
  const w = gridN * BLOCK_W;
  return (
    <group>
      <mesh position={[0, -0.55, 0]}>
        <boxGeometry args={[w * 0.88, 0.8, w * 0.88]} />
        <meshLambertMaterial color="#55555f" />
      </mesh>
      <mesh position={[0, -1.3, 0]}>
        <boxGeometry args={[w * 0.58, 0.7, w * 0.58]} />
        <meshLambertMaterial color="#424252" />
      </mesh>
      <mesh position={[0, -1.9, 0]}>
        <boxGeometry args={[w * 0.30, 0.7, w * 0.30]} />
        <meshLambertMaterial color="#333343" />
      </mesh>
    </group>
  );
}

/** Trees / flowers placed on the grass surface */
function IslandDecor({ gridN, count }: { gridN: number; count: number }) {
  const { scene: treeScene }   = useGLTF('/models/blocks/tree-pine.glb');
  const { scene: flowerScene } = useGLTF('/models/blocks/flowers-tall.glb');
  const { scene: mushScene }   = useGLTF('/models/blocks/mushrooms.glb');
  const { scene: plantScene }  = useGLTF('/models/blocks/plant.glb');

  // Place decorations in corners of the island
  const r = ((gridN - 1) / 2) * BLOCK_W * 0.72;

  return (
    <group position={[0, ISLAND_SURFACE_Y, 0]}>
      {count >= 3  && <primitive object={treeScene.clone(true)}   position={[-r,  0, -r]}        scale={0.65} />}
      {count >= 5  && <primitive object={treeScene.clone(true)}   position={[ r,  0,  r * 0.8]}  scale={0.55} />}
      {count >= 2  && <primitive object={flowerScene.clone(true)} position={[ r,  0, -r * 0.7]}  scale={0.6}  />}
      {count >= 4  && <primitive object={mushScene.clone(true)}   position={[-r * 0.6, 0,  r]}   scale={0.6}  />}
      {count >= 8  && <primitive object={plantScene.clone(true)}  position={[ 0,  0, -r * 0.9]}  scale={0.6}  />}
      {count >= 10 && <primitive object={flowerScene.clone(true)} position={[-r * 0.8, 0, -r * 0.4]} scale={0.5} />}
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

  const islandInfo = getIslandLevel(isOwn ? islandLevel : 1);
  const { gridN, capacity } = islandInfo;

  // Animals to show: own island uses real list, others get approximation
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

  const islandRadius = ((gridN - 1) / 2) * BLOCK_W * 0.65;
  const pointColor     = isFocusing ? '#ffdd66' : '#6688cc';
  const pointIntensity = isFocusing ? 4.5 : 0.9;

  return (
    <group ref={groupRef} position={position}>
      {/* Per-island dynamic light */}
      <pointLight position={[0, 3, 0]} color={pointColor} intensity={pointIntensity} distance={gridN * BLOCK_W + 8} />

      {isFocusing && (
        <mesh position={[0, ISLAND_SURFACE_Y + 2.5, 0]}>
          <sphereGeometry args={[0.22, 8, 8]} />
          <meshBasicMaterial color="#ffee88" transparent opacity={0.9} />
        </mesh>
      )}

      <IslandBlocks gridN={gridN} />
      <IslandBottom gridN={gridN} />
      <IslandDecor gridN={gridN} count={animalsToShow.length} />

      {animalsToShow.map((animalId, i) => (
        <Animal
          key={`${animalId}-${i}`}
          animalId={animalId}
          slot={i}
          total={animalsToShow.length}
          isFocusing={isFocusing}
          islandRadius={islandRadius}
        />
      ))}

      {/* Billboard label — Html always faces camera */}
      <Html
        position={[0, ISLAND_SURFACE_Y + 2.2, 0]}
        center
        distanceFactor={12}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        <div className={`island-label ${isOwn ? 'island-label--own' : ''}`}>
          {name}{isFocusing ? ' 🔥' : ''}
        </div>
      </Html>

      {/* Invisible click zone */}
      <mesh visible={false} onClick={onClick}>
        <boxGeometry args={[gridN * BLOCK_W + 2, 8, gridN * BLOCK_W + 2]} />
        <meshBasicMaterial />
      </mesh>
    </group>
  );
}

useGLTF.preload('/models/blocks/block-grass.glb');
useGLTF.preload('/models/blocks/tree-pine.glb');
useGLTF.preload('/models/blocks/flowers-tall.glb');
useGLTF.preload('/models/blocks/mushrooms.glb');
useGLTF.preload('/models/blocks/plant.glb');
