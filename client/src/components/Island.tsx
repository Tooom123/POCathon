import { useRef, useMemo } from 'react';
import { useGLTF, Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import Animal from './Animal';
import AmbientParticles from './AmbientParticles';
import { PlayerState, useGameStore } from '../stores/gameStore';
import { SHOP_ANIMALS, getIslandLevel } from '../animals';
import { getLayout, BlockDef, DecorDef } from '../islandLayout';
import { Biome, biomeForSeed, transformForSeed, applyTransform, transformRotY, makeRng, hashString } from '../biomes';

export const ISLAND_SURFACE_Y = 1.0;

const BLOCK_MODELS = [
  'block-grass', 'block-grass-large', 'block-grass-long',
  'block-grass-low', 'block-grass-low-large', 'block-grass-edge',
  'block-grass-corner', 'block-grass-corner-low',
  'block-snow', 'block-snow-large',
];

/** Map a grass-block model name to its snow counterpart when biome.useSnowBlocks. */
function pickModel(model: string, biome: Biome): string {
  if (!biome.useSnowBlocks) return model;
  // Only the two large-surface blocks have native snow GLBs in /public.
  // The rest are kept as grass models but tinted by the biome.
  if (model === 'block-grass') return 'block-snow';
  if (model === 'block-grass-large') return 'block-snow-large';
  return model;
}

/** Apply a tint color to all mesh materials in a cloned scene. */
function tintScene(root: THREE.Object3D, tint: string): THREE.Object3D {
  if (tint === '#ffffff') return root;
  const color = new THREE.Color(tint);
  const tintMat = (m: THREE.Material): THREE.Material => {
    const cloned = (m as THREE.MeshStandardMaterial).clone();
    const anyMat = cloned as any;
    // Kenney models use vertex colors that already encode the grass green.
    // Multiplying by a strong tint would darken everything to near-black.
    // Disable vertex colors so the material color shows through cleanly.
    if (anyMat.vertexColors) anyMat.vertexColors = false;
    if (anyMat.color && anyMat.color.isColor) anyMat.color.copy(color);
    cloned.needsUpdate = true;
    return cloned;
  };
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map(tintMat);
    } else {
      mesh.material = tintMat(mesh.material);
    }
  });
  return root;
}

function BlockInstance({ def, biome }: { def: BlockDef; biome: Biome }) {
  const modelName = pickModel(def.model, biome);
  const { scene } = useGLTF(`/models/blocks/${modelName}.glb`);
  // Tint applies only to grass-based models. Snow models stay white.
  const tint = modelName.startsWith('block-snow') ? '#ffffff' : biome.blockTint;
  const clone = useMemo(() => tintScene(scene.clone(true), tint), [scene, tint]);
  return <primitive object={clone} position={[def.x, def.y, def.z]} rotation={[0, def.rotY, 0]} />;
}

function DecorInstance({ def, biome }: { def: DecorDef; biome: Biome }) {
  // Trees: pick biome-specific tree model
  const modelName = def.model === 'tree-pine' ? biome.treeModel : def.model;
  const { scene } = useGLTF(`/models/blocks/${modelName}.glb`);
  // Trees tint with biome's treeTint; flowers/mushrooms keep biome blockTint.
  const tint = modelName.startsWith('tree')
    ? biome.treeTint
    : biome.blockTint;
  const clone = useMemo(() => tintScene(scene.clone(true), tint), [scene, tint]);
  return (
    <primitive
      object={clone}
      position={[def.x, def.surfaceY, def.z]}
      rotation={[0, def.rotY, 0]}
      scale={def.scale}
    />
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
  const { ownedAnimals, islandLevel, shopOpen } = useGameStore();
  const { isFocusing, name, islandIndex, id: playerId } = player;

  const displayLevel = isOwn ? islandLevel : (player.islandLevel ?? 1);
  const islandInfo = getIslandLevel(displayLevel);
  const { capacity } = islandInfo;
  const layout = useMemo(() => getLayout(displayLevel), [displayLevel]);

  // Biome + layout transform derived from player ID (stable across reloads on same socket).
  // We use playerId for biome selection but the islandIndex would also work.
  const biome = useMemo(() => biomeForSeed(playerId || `idx-${islandIndex}`), [playerId, islandIndex]);
  const transform = useMemo(() => transformForSeed(playerId || `idx-${islandIndex}`), [playerId, islandIndex]);

  // Apply transform to layout coordinates and rotations
  const transformedBlocks = useMemo<BlockDef[]>(() => layout.blocks.map((b) => {
    const [x, z] = applyTransform(b.x, b.z, transform);
    return { ...b, x, z, rotY: transformRotY(b.rotY, transform) };
  }), [layout, transform]);

  // Randomized decor: shuffle/extend the base list using seed-based PRNG
  const transformedDecors = useMemo<DecorDef[]>(() => {
    const rng = makeRng(hashString(playerId + ':decor'));
    return layout.decors
      .map((d) => {
        const [x, z] = applyTransform(d.x, d.z, transform);
        const jitterX = (rng() - 0.5) * 0.2;
        const jitterZ = (rng() - 0.5) * 0.2;
        return {
          ...d,
          x: x + jitterX,
          z: z + jitterZ,
          rotY: transformRotY(d.rotY, transform) + (rng() - 0.5) * 0.6,
          scale: d.scale * (0.85 + rng() * 0.3),
        };
      });
  }, [layout, transform, playerId]);

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

  const pointColor = isFocusing ? biome.lightFocusColor : biome.lightColor;
  const pointIntensity = isFocusing ? 3.0 : 0.9;
  const islandSize = 3 + displayLevel * 2;
  const ISLAND_SCALE = 1.6;

  return (
    <group ref={groupRef} position={position}>
      <pointLight position={[0, 3, 0]} color={pointColor} intensity={pointIntensity} distance={islandSize + 8} />

      <group scale={ISLAND_SCALE}>
        <group>
          {transformedBlocks.map((def, i) => <BlockInstance key={i} def={def} biome={biome} />)}
        </group>
        <group>
          {transformedDecors.map((def, i) => <DecorInstance key={i} def={def} biome={biome} />)}
        </group>

        {biome.ambientParticle !== 'none' && (
          <AmbientParticles
            kind={biome.ambientParticle}
            active={isFocusing}
            radius={layout.walkRadius}
            colors={biome.ambientParticleColor}
          />
        )}

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
          <div className="island-biome-label" style={{ color: biome.lightColor }}>{biome.label}</div>
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
