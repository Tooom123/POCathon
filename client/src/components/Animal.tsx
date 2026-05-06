import { useRef, useEffect } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ISLAND_SURFACE_Y } from './Island';

// Animals that fly (hover in circle above island)
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

  // Clone the scene so each instance has its own skeleton
  const clonedScene = useRef<THREE.Group>(scene.clone(true));
  const { actions, mixer } = useAnimations(animations, clonedScene.current);

  const baseAngle = (slot / Math.max(total, 1)) * Math.PI * 2;
  const orbitR = walkRadius * (0.42 + (slot % 3) * 0.2);

  // Switch animation based on focus state
  useEffect(() => {
    if (!actions) return;
    const target = isFocusing ? (actions['walk'] ?? actions['run']) : actions['idle'];
    if (!target) return;
    // Fade to new clip
    Object.values(actions).forEach((a) => a?.fadeOut(0.3));
    target.reset().fadeIn(0.3).play();
  }, [isFocusing, actions]);

  // Advance mixer manually (drei useAnimations does this, but explicit for safety)
  useFrame((_, delta) => {
    mixer.update(delta);
  });

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    const offset = slot * 1.4;

    if (isFocusing) {
      const walkSpeed = isFlying ? 0.55 : 0.38 + (slot % 3) * 0.08;
      const angle = baseAngle + t * walkSpeed + offset;
      const x = Math.cos(angle) * orbitR;
      const z = Math.sin(angle) * orbitR;
      const flyY = isFlying ? ISLAND_SURFACE_Y + 1.2 + Math.sin(t * 1.5 + offset) * 0.15 : ISLAND_SURFACE_Y;

      groupRef.current.position.set(x, flyY, z);
      // Face tangent direction (direction of travel around circle)
      groupRef.current.rotation.y = angle + Math.PI / 2;
    } else {
      // Idle: fixed position, face center, tiny breathe bob
      const x = Math.cos(baseAngle) * orbitR;
      const z = Math.sin(baseAngle) * orbitR;
      const idleY = isFlying
        ? ISLAND_SURFACE_Y + 0.9 + Math.sin(t * 0.8 + offset) * 0.06
        : ISLAND_SURFACE_Y + Math.sin(t * 1.2 + offset) * 0.008;

      groupRef.current.position.set(x, idleY, z);
      // Face inward toward island center
      groupRef.current.rotation.y = baseAngle + Math.PI;
    }
  });

  return (
    <group ref={groupRef} scale={0.27}>
      <primitive object={clonedScene.current} />
    </group>
  );
}
