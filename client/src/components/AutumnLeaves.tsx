import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const LEAF_COLORS = ['#d97333', '#c4542a', '#a8421f', '#e89a3c', '#8b3a1a', '#d18b2c'];

interface Props {
  active: boolean;
  radius: number;
  count?: number;
}

/**
 * Falling autumn leaves that drift down over the island while focusing.
 * Uses instanced quads with per-leaf random color, drift, and sway.
 */
export default function AutumnLeaves({ active, radius, count = 28 }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  const data = useMemo(() => {
    return Array.from({ length: count }, () => ({
      x: (Math.random() - 0.5) * radius * 2.5,
      y: 4 + Math.random() * 3,
      z: (Math.random() - 0.5) * radius * 2.5,
      vy: 0.25 + Math.random() * 0.35,
      swayPhase: Math.random() * Math.PI * 2,
      swaySpeed: 0.6 + Math.random() * 0.8,
      swayAmp: 0.3 + Math.random() * 0.4,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 1.4,
      color: new THREE.Color(LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)]),
    }));
  }, [count, radius]);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Set per-instance colors once after mount
  useEffect(() => {
    if (!meshRef.current) return;
    data.forEach((d, i) => meshRef.current!.setColorAt(i, d.color));
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [data]);

  useFrame((_, delta) => {
    if (!meshRef.current || !materialRef.current) return;

    const target = active ? 0.85 : 0.0;
    materialRef.current.opacity += (target - materialRef.current.opacity) * 0.05;

    if (materialRef.current.opacity < 0.01 && !active) return;

    for (let i = 0; i < count; i++) {
      const d = data[i];
      d.y -= d.vy * delta;
      d.swayPhase += d.swaySpeed * delta;
      d.rot += d.rotSpeed * delta;

      if (d.y < -0.5) {
        d.y = 5 + Math.random() * 2;
        d.x = (Math.random() - 0.5) * radius * 2.5;
        d.z = (Math.random() - 0.5) * radius * 2.5;
      }

      const sx = d.x + Math.sin(d.swayPhase) * d.swayAmp;
      const sz = d.z + Math.cos(d.swayPhase * 0.7) * d.swayAmp * 0.6;

      dummy.position.set(sx, d.y, sz);
      dummy.rotation.set(d.rot * 0.5, d.rot, d.rot * 0.3);
      dummy.scale.setScalar(0.18);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        ref={materialRef}
        transparent
        opacity={0}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </instancedMesh>
  );
}
