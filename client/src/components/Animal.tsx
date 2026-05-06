import { useRef, useEffect, useMemo } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Rarity } from '../animals';

const GROUND_Y = 1.0;       // exact top surface of standard grass block
const FLYING_Y_OFFSET = 1.3;

const FLYING_ANIMALS = new Set(['parrot', 'chick', 'bee']);

// Particle config per rarity
const RARITY_PARTICLES: Record<Rarity, { color: string; size: number; count: number; speed: number; spread: number; maxHeight: number }> = {
  common:    { color: '#cccccc', size: 0.025, count: 5,  speed: 0.18, spread: 0.18, maxHeight: 0.35 },
  uncommon:  { color: '#66ee66', size: 0.030, count: 7,  speed: 0.22, spread: 0.20, maxHeight: 0.40 },
  rare:      { color: '#66aaff', size: 0.035, count: 9,  speed: 0.26, spread: 0.22, maxHeight: 0.45 },
  epic:      { color: '#cc66ff', size: 0.040, count: 11, speed: 0.30, spread: 0.24, maxHeight: 0.50 },
  legendary: { color: '#ffcc00', size: 0.050, count: 14, speed: 0.35, spread: 0.26, maxHeight: 0.55 },
};


interface Props {
  animalId: string;
  slot: number;
  total: number;
  isFocusing: boolean;
  walkRadius: number;
  rarity: Rarity;
}

function AnimalParticles({
  groupRef,
  isFocusing,
  rarity,
}: {
  groupRef: React.RefObject<THREE.Group | null>;
  isFocusing: boolean;
  rarity: Rarity;
}) {
  const cfg = RARITY_PARTICLES[rarity];
  const N = cfg.count;

  const positions  = useMemo(() => new Float32Array(N * 3), [N]);
  const velocities = useMemo(() => new Float32Array(N * 3), [N]);
  const lifetimes  = useMemo(() => { const a = new Float32Array(N); for (let i = 0; i < N; i++) a[i] = Math.random() * 1.5; return a; }, [N]);
  const maxLife    = useMemo(() => { const a = new Float32Array(N); for (let i = 0; i < N; i++) a[i] = 0.8 + Math.random() * 0.8; return a; }, [N]);

  const geoRef = useRef<THREE.BufferGeometry>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);

  useFrame((_, delta) => {
    if (!geoRef.current || !matRef.current || !groupRef.current) return;
    const ox = groupRef.current.position.x;
    const oy = groupRef.current.position.y;
    const oz = groupRef.current.position.z;

    for (let i = 0; i < N; i++) {
      lifetimes[i] += delta;
      if (lifetimes[i] > maxLife[i]) {
        lifetimes[i] = 0;
        // Spawn at animal body level (half height = ~0.18 at scale 0.27)
        positions[i * 3 + 0] = ox + (Math.random() - 0.5) * cfg.spread;
        positions[i * 3 + 1] = oy + 0.08 + Math.random() * 0.12;
        positions[i * 3 + 2] = oz + (Math.random() - 0.5) * cfg.spread;
        velocities[i * 3 + 0] = (Math.random() - 0.5) * cfg.speed * 0.5;
        velocities[i * 3 + 1] = cfg.speed * (0.5 + Math.random() * 0.5);
        velocities[i * 3 + 2] = (Math.random() - 0.5) * cfg.speed * 0.5;
      }
      // Stop rising once past maxHeight above spawn
      const dy = positions[i * 3 + 1] - oy;
      if (dy < cfg.maxHeight) {
        positions[i * 3 + 0] += velocities[i * 3 + 0] * delta;
        positions[i * 3 + 1] += velocities[i * 3 + 1] * delta;
        positions[i * 3 + 2] += velocities[i * 3 + 2] * delta;
      }
    }

    geoRef.current.attributes.position.needsUpdate = true;
    const target = isFocusing ? 0.55 : 0.0;
    matRef.current.opacity += (target - matRef.current.opacity) * 0.07;
  });

  return (
    <points>
      <bufferGeometry ref={geoRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={matRef}
        size={cfg.size}
        color={cfg.color}
        transparent
        opacity={0}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

export default function Animal({ animalId, slot, total, isFocusing, walkRadius, rarity }: Props) {
  const isFlying = FLYING_ANIMALS.has(animalId);
  const { scene, animations } = useGLTF(`/models/animals/animal-${animalId}.glb`);
  const groupRef = useRef<THREE.Group>(null);

  const clonedScene = useRef<THREE.Group | null>(null);
  if (!clonedScene.current) clonedScene.current = scene.clone(true);

  const { actions, mixer } = useAnimations(animations, clonedScene.current);

  // Each animal orbits at a fixed radius, offset by slot
  const orbitRadius = walkRadius * (0.38 + (slot % 3) * 0.18);
  // Base angle so animals start evenly distributed
  const baseAngle = (slot / Math.max(total, 1)) * Math.PI * 2;
  // Slightly different speed per slot so they don't clump
  const orbitSpeed = 0.22 + (slot % 4) * 0.04;

  useEffect(() => {
    if (!actions) return;
    const clip = isFocusing
      ? (actions['walk'] ?? actions['run'] ?? null)
      : (actions['idle'] ?? null);
    if (!clip) return;
    Object.values(actions).forEach(a => a?.fadeOut(0.35));
    clip.reset().fadeIn(0.35).play();
    clip.timeScale = isFocusing ? 0.55 : 0.5;
  }, [isFocusing, actions]);

  useFrame((_, delta) => { mixer.update(delta); });

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();

    if (!isFocusing) {
      // Idle: fixed position around island, facing center, tiny breathe
      const bx = Math.cos(baseAngle) * orbitRadius;
      const bz = Math.sin(baseAngle) * orbitRadius;
      groupRef.current.position.set(
        bx,
        GROUND_Y + Math.sin(t * 0.9 + slot) * 0.007,
        bz,
      );
      // Face island center
      groupRef.current.rotation.y = Math.atan2(-bx, -bz);
      return;
    }

    // Focus: slow orbit around island (AFK patrol)
    const angle = baseAngle + t * orbitSpeed;
    const x = Math.cos(angle) * orbitRadius;
    const z = Math.sin(angle) * orbitRadius;

    const y = isFlying
      ? GROUND_Y + FLYING_Y_OFFSET + Math.sin(t * 1.1 + slot) * 0.1
      : GROUND_Y;

    groupRef.current.position.set(x, y, z);

    // Tangent direction: velocity of CCW circle = (-sin(angle), 0, cos(angle))
    // Model +Z = front. After rotY, +Z → (sin(rotY), 0, cos(rotY)).
    // Want sin(rotY)=−sin(angle), cos(rotY)=cos(angle) → rotY = −angle
    groupRef.current.rotation.y = -angle;
  });

  return (
    <>
      <group ref={groupRef} scale={0.27}>
        <primitive object={clonedScene.current} />
      </group>
      <AnimalParticles groupRef={groupRef} isFocusing={isFocusing} rarity={rarity} />
    </>
  );
}
