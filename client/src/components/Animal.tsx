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

function seededRand(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

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

  const rand = useMemo(() => seededRand(slot * 9973 + 1234), [slot]);
  const state = useRef({
    x: Math.cos((slot / Math.max(total, 1)) * Math.PI * 2) * walkRadius * 0.45,
    z: Math.sin((slot / Math.max(total, 1)) * Math.PI * 2) * walkRadius * 0.45,
    heading: rand() * Math.PI * 2,
    turnTimer: rand() * 1.5,
    turnTarget: rand() * Math.PI * 2,
    speed: 0.28 + rand() * 0.16,
    pauseTimer: 0,
    pausing: false,
  });

  useEffect(() => {
    if (!actions) return;
    const clip = isFocusing
      ? (actions['walk'] ?? actions['run'] ?? null)
      : (actions['idle'] ?? null);
    if (!clip) return;
    Object.values(actions).forEach(a => a?.fadeOut(0.35));
    clip.reset().fadeIn(0.35).play();
    clip.timeScale = isFocusing ? 0.65 : 0.55;
  }, [isFocusing, actions]);

  useFrame((_, delta) => { mixer.update(delta); });

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    const s = state.current;

    if (!isFocusing) {
      const baseAngle = (slot / Math.max(total, 1)) * Math.PI * 2;
      const r = walkRadius * (0.45 + (slot % 3) * 0.15);
      const bx = Math.cos(baseAngle) * r;
      const bz = Math.sin(baseAngle) * r;
      const idleY = isFlying
        ? GROUND_Y + FLYING_Y_OFFSET + Math.sin(t * 0.6 + slot) * 0.07
        : GROUND_Y + Math.sin(t * 0.9 + slot) * 0.007;
      groupRef.current.position.set(bx, idleY, bz);
      groupRef.current.rotation.y = Math.atan2(-bx, -bz);
      return;
    }

    // Pausing
    if (s.pausing) {
      s.pauseTimer -= delta;
      if (s.pauseTimer <= 0) s.pausing = false;
      groupRef.current.position.y = isFlying
        ? GROUND_Y + FLYING_Y_OFFSET + Math.sin(t * 1.0 + slot) * 0.09
        : GROUND_Y;
      return;
    }

    // Random turn timer
    s.turnTimer -= delta;
    if (s.turnTimer <= 0) {
      s.turnTarget = s.heading + (rand() - 0.5) * Math.PI * 1.3;
      s.turnTimer = 1.0 + rand() * 2.0;
      if (rand() < 0.18) { s.pausing = true; s.pauseTimer = 0.6 + rand() * 1.2; }
    }

    // Smooth turn
    let dA = ((s.turnTarget - s.heading + Math.PI) % (Math.PI * 2)) - Math.PI;
    s.heading += dA * Math.min(delta * 2.2, 1);

    // Boundary push back toward centre
    const dist2 = s.x * s.x + s.z * s.z;
    const maxR = walkRadius * 0.82;
    if (dist2 > maxR * maxR) {
      const toC = Math.atan2(-s.z, -s.x);
      let d2 = ((toC - s.heading + Math.PI) % (Math.PI * 2)) - Math.PI;
      s.heading += d2 * delta * 4.0;
    }

    s.x += Math.cos(s.heading) * s.speed * delta;
    s.z += Math.sin(s.heading) * s.speed * delta;

    const flyY = isFlying
      ? GROUND_Y + FLYING_Y_OFFSET + Math.sin(t * 1.0 + slot) * 0.09
      : GROUND_Y;

    groupRef.current.position.set(s.x, flyY, s.z);
    // +Z is front face; want it facing (cos heading, 0, sin heading)
    // rotY so that local +Z → world (cos h, 0, sin h): rotY = PI/2 - heading
    groupRef.current.rotation.y = Math.PI / 2 - s.heading;
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
