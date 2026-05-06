import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

type Kind = 'snow' | 'pollen' | 'embers' | 'petals' | 'leaves';

interface Props {
  kind: Kind;
  active: boolean;       // intensifies when true (focus session)
  radius: number;
  colors: string[];
  count?: number;
}

interface KindParams {
  vy: [number, number];          // fall speed range
  swayAmp: [number, number];
  swaySpeed: [number, number];
  scale: number;                  // sprite scale
  baseOpacity: number;            // ambient (idle) opacity
  focusOpacity: number;           // boosted opacity during focus
  rises: boolean;                 // for embers — they rise instead of fall
  rotates: boolean;               // 3D rotation (leaves/petals) vs flat (snow/embers)
}

const KIND_PARAMS: Record<Kind, KindParams> = {
  snow:    { vy:[0.20,0.40], swayAmp:[0.20,0.45], swaySpeed:[0.3,0.7], scale:0.10, baseOpacity:0, focusOpacity:0.85, rises:false, rotates:false },
  pollen:  { vy:[0.05,0.15], swayAmp:[0.30,0.55], swaySpeed:[0.4,0.9], scale:0.08, baseOpacity:0, focusOpacity:0.70, rises:false, rotates:false },
  embers:  { vy:[0.40,0.70], swayAmp:[0.10,0.25], swaySpeed:[0.5,1.1], scale:0.07, baseOpacity:0, focusOpacity:0.90, rises:true,  rotates:false },
  petals:  { vy:[0.18,0.35], swayAmp:[0.35,0.60], swaySpeed:[0.5,1.0], scale:0.13, baseOpacity:0, focusOpacity:0.85, rises:false, rotates:true  },
  leaves:  { vy:[0.25,0.60], swayAmp:[0.30,0.70], swaySpeed:[0.6,1.4], scale:0.18, baseOpacity:0, focusOpacity:0.85, rises:false, rotates:true  },
};

/**
 * Always-on ambient particles per biome (snow / pollen / embers / petals / leaves).
 * Visible at low opacity even when idle, and intensifies during focus.
 */
export default function AmbientParticles({ kind, active, radius, colors, count = 26 }: Props) {
  const params = KIND_PARAMS[kind];
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const data = useMemo(() => {
    const r = (a: number, b: number) => a + Math.random() * (b - a);
    return Array.from({ length: count }, () => ({
      x: (Math.random() - 0.5) * radius * 2.6,
      y: params.rises ? 0.5 + Math.random() * 1.5 : 4 + Math.random() * 3,
      z: (Math.random() - 0.5) * radius * 2.6,
      vy: r(params.vy[0], params.vy[1]),
      swayPhase: Math.random() * Math.PI * 2,
      swaySpeed: r(params.swaySpeed[0], params.swaySpeed[1]),
      swayAmp: r(params.swayAmp[0], params.swayAmp[1]),
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 1.4,
      color: new THREE.Color(colors[Math.floor(Math.random() * colors.length)]),
    }));
  }, [count, radius, kind, colors.join(',')]);

  useEffect(() => {
    if (!meshRef.current) return;
    data.forEach((d, i) => meshRef.current!.setColorAt(i, d.color));
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [data]);

  // Track previous active state so we can reset positions on a new focus session
  const prevActive = useRef(false);

  useFrame((_, delta) => {
    if (!meshRef.current || !matRef.current) return;

    const target = active ? params.focusOpacity : params.baseOpacity;
    matRef.current.opacity += (target - matRef.current.opacity) * 0.08;

    // When focus starts again after being inactive, randomize positions so
    // particles spawn fresh from the sky (no clump waiting in storage).
    if (active && !prevActive.current) {
      for (let i = 0; i < count; i++) {
        const d = data[i];
        d.x = (Math.random() - 0.5) * radius * 2.6;
        d.z = (Math.random() - 0.5) * radius * 2.6;
        d.y = params.rises ? 0.2 + Math.random() * 1.5 : 4 + Math.random() * 3;
      }
    }
    prevActive.current = active;

    // Skip work entirely when fully faded out — particles freeze invisibly.
    if (!active && matRef.current.opacity < 0.02) return;

    const focusBoost = active ? 1.0 : 0.0;

    for (let i = 0; i < count; i++) {
      const d = data[i];
      const dy = d.vy * delta * focusBoost;
      d.y += params.rises ? dy : -dy;
      d.swayPhase += d.swaySpeed * delta * focusBoost;
      d.rot += d.rotSpeed * delta * focusBoost;

      // Recycle when out of bounds
      if (params.rises && d.y > 6) {
        d.y = 0.2 + Math.random() * 0.5;
        d.x = (Math.random() - 0.5) * radius * 2.6;
        d.z = (Math.random() - 0.5) * radius * 2.6;
      } else if (!params.rises && d.y < -0.5) {
        d.y = 5 + Math.random() * 2;
        d.x = (Math.random() - 0.5) * radius * 2.6;
        d.z = (Math.random() - 0.5) * radius * 2.6;
      }

      const sx = d.x + Math.sin(d.swayPhase) * d.swayAmp;
      const sz = d.z + Math.cos(d.swayPhase * 0.7) * d.swayAmp * 0.6;

      dummy.position.set(sx, d.y, sz);
      if (params.rotates) {
        dummy.rotation.set(d.rot * 0.5, d.rot, d.rot * 0.3);
      } else {
        dummy.rotation.set(0, 0, 0);
      }
      dummy.scale.setScalar(params.scale);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        ref={matRef}
        transparent
        opacity={params.baseOpacity}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </instancedMesh>
  );
}
