import { useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ISLAND_SURFACE_Y } from './Island';

interface Props {
  animalId: string;
  slot: number;
  total: number;
  isFocusing: boolean;
  islandRadius?: number;
}

const ANIMAL_SCALE = 0.27;

export default function Animal({ animalId, slot, total, isFocusing, islandRadius = 1.2 }: Props) {
  const { scene } = useGLTF(`/models/animals/animal-${animalId}.glb`);
  const ref = useRef<THREE.Group>(null);

  // Base orbit radius varies per slot so animals don't stack
  const baseAngle = (slot / Math.max(total, 1)) * Math.PI * 2;
  const r = islandRadius * (0.38 + (slot % 3) * 0.18);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    const offset = slot * 1.4;

    if (isFocusing) {
      // Walk in a small circle — constant Y, face direction of travel
      const walkSpeed = 0.4 + (slot % 3) * 0.1;
      const angle = baseAngle + t * walkSpeed + offset;
      ref.current.position.x = Math.cos(angle) * r;
      ref.current.position.z = Math.sin(angle) * r;
      ref.current.position.y = ISLAND_SURFACE_Y;
      // Face the direction of movement (tangent to circle)
      ref.current.rotation.y = angle + Math.PI / 2;
    } else {
      // Idle: stay in fixed position, tiny breathing bob
      ref.current.position.x = Math.cos(baseAngle) * r;
      ref.current.position.z = Math.sin(baseAngle) * r;
      ref.current.position.y = ISLAND_SURFACE_Y + Math.sin(t * 1.2 + offset) * 0.008;
      ref.current.rotation.y = baseAngle + Math.PI;
    }
  });

  return (
    <group ref={ref} position={[Math.cos(baseAngle) * r, ISLAND_SURFACE_Y, Math.sin(baseAngle) * r]} scale={ANIMAL_SCALE}>
      <primitive object={scene.clone(true)} />
    </group>
  );
}
