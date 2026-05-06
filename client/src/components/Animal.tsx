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
  // Time the focus session started (clock seconds); reset every idle→focus transition
  const focusStartT = useRef<number | null>(null);

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

  // Track last orbit angle reached during focus, so that when focus stops
  // the animal continues from there instead of snapping back to baseAngle.
  const lastFocusAngle = useRef<number>(baseAngle);
  // Idle anchor: where the animal "lives" when not focusing.
  // Initialized to baseAngle, updated to lastFocusAngle when focus stops so
  // the animal stays where it was at the moment of stopping.
  const idleAngle = useRef<number>(baseAngle);
  const wasFocusing = useRef<boolean>(false);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    const g = groupRef.current;

    if (!isFocusing) {
      // Detect focus → idle transition: snapshot current angle as new idle anchor
      if (wasFocusing.current) {
        idleAngle.current = lastFocusAngle.current;
        wasFocusing.current = false;
      }
      focusStartT.current = null;

      // Idle target position based on idleAngle (was baseAngle before)
      const a = idleAngle.current;
      const bx = Math.cos(a) * orbitRadius;
      const bz = Math.sin(a) * orbitRadius;
      const targetY = GROUND_Y + Math.sin(t * 0.9 + slot) * 0.007;

      // Smooth lerp toward idle anchor (no teleport on focus stop)
      g.position.x += (bx - g.position.x) * 0.08;
      g.position.z += (bz - g.position.z) * 0.08;
      g.position.y += (targetY - g.position.y) * 0.15;

      // Idle orientation: face island center. Smoothly rotate toward it.
      const targetRot = Math.atan2(-bx, -bz);
      const dr = ((targetRot - g.rotation.y + Math.PI) % (Math.PI * 2)) - Math.PI;
      g.rotation.y += dr * 0.1;
      return;
    }

    // Idle → focus transition: anchor from current idle angle
    if (!wasFocusing.current) {
      focusStartT.current = t;
      // Start the orbit progression from wherever we currently are
      lastFocusAngle.current = idleAngle.current;
      wasFocusing.current = true;
    }

    if (focusStartT.current === null) focusStartT.current = t;
    const dt = t - focusStartT.current;
    // Continue orbit from idle angle (smooth, no jump)
    const angle = idleAngle.current + dt * orbitSpeed;
    lastFocusAngle.current = angle;

    const x = Math.cos(angle) * orbitRadius;
    const z = Math.sin(angle) * orbitRadius;
    const targetY = isFlying
      ? GROUND_Y + FLYING_Y_OFFSET + Math.sin(t * 1.1 + slot) * 0.1
      : GROUND_Y;

    // Smooth Y for flying animals so they rise gradually at focus start
    g.position.x = x;
    g.position.z = z;
    g.position.y += (targetY - g.position.y) * (isFlying ? 0.05 : 0.2);

    // Smoothly rotate toward tangent direction (rotY = -angle).
    // Don't snap on first frame so the body turns naturally.
    const targetRot = -angle;
    const dr = ((targetRot - g.rotation.y + Math.PI) % (Math.PI * 2)) - Math.PI;
    g.rotation.y += dr * 0.12;
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
