// ─── Biome system ─────────────────────────────────────────────────────────
// Each biome reskins the same block layouts with:
//  - a tinted base color applied to grass/snow models
//  - light color tweaks for the island point light
//  - tree variant (pine vs snow pine)
//  - ambient particle config (snowflakes / pollen / embers / petals / none)

export type BiomeId = 'verdant' | 'snow' | 'desert' | 'volcanic' | 'sakura';

export interface Biome {
  id: BiomeId;
  label: string;
  // Multiplicative tint applied to grass-block materials. White = no change.
  blockTint: string;
  // Use the snow-textured GLB instead of grass (if true)
  useSnowBlocks: boolean;
  // Light color around the island
  lightColor: string;
  lightFocusColor: string;
  // Tree model selection
  treeModel: 'tree-pine' | 'tree-pine-snow-small';
  treeTint: string;
  // Ambient particle effect (always-on, intensifies on focus)
  ambientParticle: 'leaves' | 'snow' | 'pollen' | 'embers' | 'petals' | 'none';
  ambientParticleColor: string[];
}

export const BIOMES: Record<BiomeId, Biome> = {
  verdant: {
    id: 'verdant',
    label: 'Verdoyant',
    blockTint: '#ffffff',
    useSnowBlocks: false,
    lightColor: '#6688cc',
    lightFocusColor: '#aaddff',
    treeModel: 'tree-pine',
    treeTint: '#ffffff',
    ambientParticle: 'leaves',
    ambientParticleColor: ['#d97333', '#c4542a', '#e89a3c', '#d18b2c'],
  },
  snow: {
    id: 'snow',
    label: 'Hivernal',
    blockTint: '#ffffff',
    useSnowBlocks: true,
    lightColor: '#aaccee',
    lightFocusColor: '#e8f4ff',
    treeModel: 'tree-pine-snow-small',
    treeTint: '#ffffff',
    ambientParticle: 'snow',
    ambientParticleColor: ['#ffffff', '#e8f4ff', '#cce4ff'],
  },
  desert: {
    id: 'desert',
    label: 'Désertique',
    blockTint: '#e8c684',  // sand tint
    useSnowBlocks: false,
    lightColor: '#cc9966',
    lightFocusColor: '#ffd699',
    treeModel: 'tree-pine',
    treeTint: '#a89968',  // dry vegetation
    ambientParticle: 'pollen',
    ambientParticleColor: ['#e8c684', '#d4a86b', '#fff0c0'],
  },
  volcanic: {
    id: 'volcanic',
    label: 'Volcanique',
    blockTint: '#7a3a2a',  // dark red-brown
    useSnowBlocks: false,
    lightColor: '#cc5533',
    lightFocusColor: '#ff8855',
    treeModel: 'tree-pine',
    treeTint: '#3a2a1a',  // burnt/dark
    ambientParticle: 'embers',
    ambientParticleColor: ['#ff5522', '#ff8844', '#ffcc66'],
  },
  sakura: {
    id: 'sakura',
    label: 'Sakura',
    blockTint: '#f4c8d4',  // pale pink grass
    useSnowBlocks: false,
    lightColor: '#cc88aa',
    lightFocusColor: '#ffbbdd',
    treeModel: 'tree-pine',
    treeTint: '#ff99bb',  // pink-blossom canopy
    ambientParticle: 'petals',
    ambientParticleColor: ['#ffb6cc', '#ff99bb', '#ffd4e0'],
  },
};

const BIOME_ORDER: BiomeId[] = ['verdant', 'snow', 'desert', 'volcanic', 'sakura'];

/** Stable hash of an arbitrary string → 32-bit unsigned integer. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic mulberry32-style PRNG seeded by integer. */
export function makeRng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick a biome from a player ID (or any seed string). */
export function biomeForSeed(seed: string): Biome {
  const h = hashString(seed);
  return BIOMES[BIOME_ORDER[h % BIOME_ORDER.length]];
}

/**
 * Layout transform: rotation (0/90/180/270 degrees) and optional X-mirror,
 * derived from the same seed. Returns a transform applied to (x, z) coords.
 */
export interface LayoutTransform {
  rotIndex: 0 | 1 | 2 | 3;
  mirrorX: boolean;
}

export function transformForSeed(seed: string): LayoutTransform {
  const h = hashString(seed + ':layout');
  return {
    rotIndex: ((h >>> 0) % 4) as 0 | 1 | 2 | 3,
    mirrorX: ((h >>> 5) & 1) === 1,
  };
}

/** Apply transform to (x, z). Rotations are around origin. */
export function applyTransform(x: number, z: number, t: LayoutTransform): [number, number] {
  let nx = x, nz = z;
  if (t.mirrorX) nx = -nx;
  switch (t.rotIndex) {
    case 0: return [nx, nz];
    case 1: return [-nz, nx];
    case 2: return [-nx, -nz];
    case 3: return [nz, -nx];
  }
}

/** Same transform applied to a Y rotation (radians). */
export function transformRotY(rotY: number, t: LayoutTransform): number {
  let r = rotY + (t.rotIndex * Math.PI) / 2;
  if (t.mirrorX) r = -r;
  return r;
}
