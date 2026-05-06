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

export default function Animal({ animalId, slot, total, isFocusing, islandRadius = 1.2 }: Props) {
  const { scene } = useGLTF(`/models/animals/animal-${animalId}.glb`);
  const ref = useRef<THREE.Group>(null);

  const angle = (slot / Math.max(total, 1)) * Math.PI * 2;
  const r = islandRadius * (0.45 + (slot % 3) * 0.22);
  const x = Math.cos(angle) * r;
  const z = Math.sin(angle) * r;

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime() + slot * 1.4;
    if (isFocusing) {
      ref.current.position.y = ISLAND_SURFACE_Y + Math.abs(Math.sin(t * 2.5)) * 0.2;
      ref.current.rotation.y = t * 1.5;
    } else {
      ref.current.position.y = ISLAND_SURFACE_Y + Math.sin(t * 0.7) * 0.05;
      ref.current.rotation.y += 0.007;
    }
  });

  return (
    <group ref={ref} position={[x, ISLAND_SURFACE_Y, z]} scale={0.5}>
      <primitive object={scene.clone(true)} />
    </group>
  );
}
