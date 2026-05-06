import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface Star {
  active: boolean;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  speed: number;
  life: number;
  maxLife: number;
}

const STAR_COUNT = 4;
const SPAWN_INTERVAL = [4, 12]; // seconds between spawns per slot

function randomStar(): Omit<Star, 'active'> {
  const x = (Math.random() - 0.5) * 120;
  const y = 20 + Math.random() * 30;
  const z = (Math.random() - 0.5) * 80;
  const angle = Math.PI * 1.1 + (Math.random() - 0.5) * 0.6;
  const dip = -(0.3 + Math.random() * 0.4);
  return {
    pos: new THREE.Vector3(x, y, z),
    dir: new THREE.Vector3(Math.cos(angle), dip, Math.sin(angle)).normalize(),
    speed: 18 + Math.random() * 14,
    life: 0,
    maxLife: 1.0 + Math.random() * 0.8,
  };
}

export default function ShootingStars() {
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const stars = useRef<Star[]>(Array.from({ length: STAR_COUNT }, () => ({ active: false, ...randomStar() })));
  const nextSpawn = useRef<number[]>(Array.from({ length: STAR_COUNT }, () => Math.random() * 8));

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();

    for (let i = 0; i < STAR_COUNT; i++) {
      const star = stars.current[i];
      const mesh = meshRefs.current[i];
      if (!mesh) continue;

      if (!star.active) {
        if (t >= nextSpawn.current[i]) {
          const fresh = randomStar();
        star.active = true;
        star.life = 0;
        star.pos.copy(fresh.pos);
        star.dir.copy(fresh.dir);
        star.speed = fresh.speed;
        star.maxLife = fresh.maxLife;
        }
        mesh.visible = false;
        continue;
      }

      star.life += delta;
      if (star.life >= star.maxLife) {
        star.active = false;
        mesh.visible = false;
        nextSpawn.current[i] = t + SPAWN_INTERVAL[0] + Math.random() * (SPAWN_INTERVAL[1] - SPAWN_INTERVAL[0]);
        continue;
      }

      star.pos.addScaledVector(star.dir, star.speed * delta);
      mesh.visible = true;
      mesh.position.copy(star.pos);
      // Orient streak along direction
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), star.dir);

      // Fade in/out
      const progress = star.life / star.maxLife;
      const opacity = progress < 0.1 ? progress / 0.1 : progress > 0.8 ? (1 - progress) / 0.2 : 1;
      (mesh.material as THREE.MeshBasicMaterial).opacity = opacity * 0.9;
    }
  });

  return (
    <group>
      {Array.from({ length: STAR_COUNT }, (_, i) => (
        <mesh key={i} ref={(el) => { meshRefs.current[i] = el; }} visible={false}>
          <cylinderGeometry args={[0.02, 0.06, 3, 4]} />
          <meshBasicMaterial color="#ffffee" transparent opacity={0} />
        </mesh>
      ))}
    </group>
  );
}
