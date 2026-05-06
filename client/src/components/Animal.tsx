import { useRef, useEffect } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ISLAND_SURFACE_Y } from './Island';

// Animals that fly (hover above island)
const FLYING_ANIMALS = new Set(['parrot', 'chick', 'bee']);

interface Props {
  animalId: string;
  slot: number;
  total: number;
  isFocusing: boolean;
  walkRadius: number;
}

export default function Animal({ animalId, slot, total, isFocusing, walkRadius }: Props) {
  const isFlying = FLYING_ANIMALS.has(animalId);
  const { scene, animations } = useGLTF(`/models/animals/animal-${animalId}.glb`);
  const groupRef = useRef<THREE.Group>(null);

  // Each animal needs its own scene clone so skeletons don't conflict
  const clonedScene = useRef<THREE.Group | null>(null);
  if (!clonedScene.current) clonedScene.current = scene.clone(true);

  const { actions, mixer } = useAnimations(animations, clonedScene.current);

  // Base angle evenly distributed; radius varies slightly per slot to avoid stacking
  const baseAngle = (slot / Math.max(total, 1)) * Math.PI * 2;
  const orbitR = walkRadius * (0.5 + (slot % 3) * 0.18);

  // Random per-animal walk speed offset (seeded by slot, stable across renders)
  const walkSpeed = 0.18 + (((slot * 7) % 5) / 5) * 0.12;

  useEffect(() => {
    if (!actions) return;
    const clip = isFocusing
      ? (actions['walk'] ?? actions['run'] ?? null)
      : (actions['idle'] ?? null);
    if (!clip) return;
    Object.values(actions).forEach((a) => a?.fadeOut(0.4));
    clip.reset().fadeIn(0.4).play();
    // Slow down walk animation to match gentle movement
    clip.timeScale = isFocusing ? 0.7 : 0.6;
  }, [isFocusing, actions]);

  useFrame((_, delta) => {
    mixer.update(delta);
  });

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    const phaseOffset = slot * (Math.PI * 2 / Math.max(total, 1)) * 0.4;

    if (isFocusing) {
      const angle = baseAngle + t * walkSpeed + phaseOffset;
      const x = Math.cos(angle) * orbitR;
      const z = Math.sin(angle) * orbitR;
      const flyY = isFlying
        ? ISLAND_SURFACE_Y + 1.3 + Math.sin(t * 1.1 + slot) * 0.12
        : ISLAND_SURFACE_Y;

      groupRef.current.position.set(x, flyY, z);

      // The model's +Z is its front face (legs-front are at +Z in the GLB).
      // Tangent direction of CCW circle at angle is (-sin(angle), 0, cos(angle)).
      // We want +Z of the model to align with this tangent.
      // rotY = angle (the model's +Z points radially outward at angle,
      // but tangent = perpendicular = angle + PI/2... let's think:
      // position = (cos(a)*r, y, sin(a)*r)
      // velocity direction = d/da = (-sin(a), 0, cos(a))  — this IS the tangent
      // model +Z should face (-sin(a), 0, cos(a))
      // atan2 of that vector in XZ: atan2(-sin(a), cos(a)) = -a  →  rotY = -a + PI
      // But easier: rotY = angle + PI (faces inward) — no.
      // Correct: the tangent vector is (-sin(a), 0, cos(a)).
      // atan2(x, z) = atan2(-sin(a), cos(a)) = -a
      // So rotY = -angle  (and we add PI to face forward not backward)
      groupRef.current.rotation.y = -angle;
    } else {
      // Idle: stay in fixed spot facing the center of the island
      const x = Math.cos(baseAngle) * orbitR;
      const z = Math.sin(baseAngle) * orbitR;
      const idleY = isFlying
        ? ISLAND_SURFACE_Y + 0.8 + Math.sin(t * 0.6 + slot) * 0.06
        : ISLAND_SURFACE_Y + Math.sin(t * 0.9 + slot) * 0.008;

      groupRef.current.position.set(x, idleY, z);
      // Face center: from (x,z) toward (0,0) => angle + PI
      groupRef.current.rotation.y = baseAngle + Math.PI;
    }
  });

  return (
    <group ref={groupRef} scale={0.27}>
      <primitive object={clonedScene.current} />
    </group>
  );
}
