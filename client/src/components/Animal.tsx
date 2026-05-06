import { useRef, useEffect, useMemo } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Surface Y of standard grass block (blocks placed at y=0, top at y=1.0)
// Animals sit exactly on top: y=1.0 in island-group space
const GROUND_Y = 1.0;
const FLYING_Y_OFFSET = 1.4; // above surface for flying animals

const FLYING_ANIMALS = new Set(['parrot', 'chick', 'bee']);

// Simple seeded pseudo-random (stable per slot)
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
}

// Particle system that follows an animal
function AnimalParticles({ groupRef, isFocusing }: { groupRef: React.RefObject<THREE.Group | null>; isFocusing: boolean }) {
  const COUNT = 12;
  const positions = useMemo(() => new Float32Array(COUNT * 3), []);
  const velocities = useMemo(() => new Float32Array(COUNT * 3), []);
  const lifetimes = useMemo(() => {
    const a = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) a[i] = Math.random() * 2;
    return a;
  }, []);
  const maxLife = useMemo(() => {
    const a = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) a[i] = 1.0 + Math.random() * 1.2;
    return a;
  }, []);
  const geoRef = useRef<THREE.BufferGeometry>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);

  useFrame((_, delta) => {
    if (!geoRef.current || !matRef.current || !groupRef.current) return;
    const origin = groupRef.current.position;

    for (let i = 0; i < COUNT; i++) {
      lifetimes[i] += delta;
      if (lifetimes[i] > maxLife[i]) {
        // Respawn at animal position with small spread
        lifetimes[i] = 0;
        positions[i * 3 + 0] = origin.x + (Math.random() - 0.5) * 0.3;
        positions[i * 3 + 1] = origin.y + 0.4 + Math.random() * 0.3;
        positions[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.3;
        velocities[i * 3 + 0] = (Math.random() - 0.5) * 0.2;
        velocities[i * 3 + 1] = 0.3 + Math.random() * 0.4;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
      }
      positions[i * 3 + 0] += velocities[i * 3 + 0] * delta;
      positions[i * 3 + 1] += velocities[i * 3 + 1] * delta;
      positions[i * 3 + 2] += velocities[i * 3 + 2] * delta;
    }
    geoRef.current.attributes.position.needsUpdate = true;
    const targetOpacity = isFocusing ? 0.7 : 0.0;
    matRef.current.opacity += (targetOpacity - matRef.current.opacity) * 0.08;
  });

  return (
    <points>
      <bufferGeometry ref={geoRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={matRef}
        size={0.045}
        color="#aaddff"
        transparent
        opacity={0}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

export default function Animal({ animalId, slot, total, isFocusing, walkRadius }: Props) {
  const isFlying = FLYING_ANIMALS.has(animalId);
  const { scene, animations } = useGLTF(`/models/animals/animal-${animalId}.glb`);
  const groupRef = useRef<THREE.Group>(null);

  const clonedScene = useRef<THREE.Group | null>(null);
  if (!clonedScene.current) clonedScene.current = scene.clone(true);

  const { actions, mixer } = useAnimations(animations, clonedScene.current);

  // Wandering state — position & heading in XZ plane, bounded by walkRadius
  const rand = useMemo(() => seededRand(slot * 9973 + 1234), [slot]);
  const state = useRef({
    x: Math.cos((slot / Math.max(total, 1)) * Math.PI * 2) * walkRadius * 0.5,
    z: Math.sin((slot / Math.max(total, 1)) * Math.PI * 2) * walkRadius * 0.5,
    heading: rand() * Math.PI * 2,
    turnTimer: rand() * 2,
    turnTarget: rand() * Math.PI * 2,
    speed: 0.35 + rand() * 0.2,
    pauseTimer: 0,
    pausing: false,
  });

  useEffect(() => {
    if (!actions) return;
    const clip = isFocusing
      ? (actions['walk'] ?? actions['run'] ?? null)
      : (actions['idle'] ?? null);
    if (!clip) return;
    Object.values(actions).forEach((a) => a?.fadeOut(0.35));
    clip.reset().fadeIn(0.35).play();
    clip.timeScale = isFocusing ? 0.65 : 0.55;
  }, [isFocusing, actions]);

  useFrame((_, delta) => {
    mixer.update(delta);
  });

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    const s = state.current;

    if (!isFocusing) {
      // Idle: stay in place, face inward, tiny breathe
      const baseAngle = (slot / Math.max(total, 1)) * Math.PI * 2;
      const r = walkRadius * (0.5 + (slot % 3) * 0.18);
      const idleY = isFlying
        ? GROUND_Y + FLYING_Y_OFFSET + Math.sin(t * 0.6 + slot) * 0.07
        : GROUND_Y + Math.sin(t * 0.9 + slot) * 0.008;
      groupRef.current.position.set(
        Math.cos(baseAngle) * r,
        idleY,
        Math.sin(baseAngle) * r
      );
      // Model +Z = front face → to face center from (x,z): heading = atan2(-x, -z)
      const bx = Math.cos(baseAngle) * r;
      const bz = Math.sin(baseAngle) * r;
      groupRef.current.rotation.y = Math.atan2(-bx, -bz);
      return;
    }

    // --- Wandering locomotion ---
    // Pause occasionally
    if (s.pausing) {
      s.pauseTimer -= delta;
      if (s.pauseTimer <= 0) s.pausing = false;
      // Keep position, update Y for flying
      groupRef.current.position.y = isFlying
        ? GROUND_Y + FLYING_Y_OFFSET + Math.sin(t * 1.0 + slot) * 0.1
        : GROUND_Y;
      return;
    }

    // Random turn
    s.turnTimer -= delta;
    if (s.turnTimer <= 0) {
      s.turnTarget = s.heading + (rand() - 0.5) * Math.PI * 1.2;
      s.turnTimer = 0.8 + rand() * 1.5;
      // Occasionally pause
      if (rand() < 0.15) {
        s.pausing = true;
        s.pauseTimer = 0.5 + rand() * 1.5;
      }
    }

    // Smoothly turn toward target
    let dAngle = s.turnTarget - s.heading;
    // Normalize to [-PI, PI]
    dAngle = ((dAngle + Math.PI) % (Math.PI * 2)) - Math.PI;
    s.heading += dAngle * Math.min(delta * 2.5, 1);

    // Boundary: if near edge, steer back toward center
    const distSq = s.x * s.x + s.z * s.z;
    const maxR = walkRadius * 0.85;
    if (distSq > maxR * maxR) {
      const toCenter = Math.atan2(-s.z, -s.x);
      let diff = toCenter - s.heading;
      diff = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI;
      s.heading += diff * delta * 3.5;
    }

    // Move
    s.x += Math.cos(s.heading) * s.speed * delta;
    s.z += Math.sin(s.heading) * s.speed * delta;

    const flyY = isFlying
      ? GROUND_Y + FLYING_Y_OFFSET + Math.sin(t * 1.0 + slot) * 0.1
      : GROUND_Y;

    groupRef.current.position.set(s.x, flyY, s.z);

    // Model's front is +Z → rotY = heading - PI/2
    // Because atan2 gives angle in XZ where X=cos(heading), Z=sin(heading)
    // and model +Z front = heading direction means rotY = heading - PI/2
    // Let's derive: model faces +Z local. We want it to face (cos(heading), 0, sin(heading)).
    // In Three.js, rotY rotates +Z toward +X by rotY radians.
    // After rotY: model +Z → (sin(rotY), 0, cos(rotY)).
    // We want sin(rotY)=cos(heading), cos(rotY)=sin(heading) → rotY = PI/2 - heading
    groupRef.current.rotation.y = Math.PI / 2 - s.heading;
  });

  return (
    <>
      <group ref={groupRef} scale={0.27}>
        <primitive object={clonedScene.current} />
      </group>
      <AnimalParticles groupRef={groupRef} isFocusing={isFocusing} />
    </>
  );
}
