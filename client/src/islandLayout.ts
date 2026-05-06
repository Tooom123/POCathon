// Island procedural layout system
// Blocks: 1.082×1.000×1.082 (standard), 2.082×1.000×2.082 (large), 1.082×0.500×1.082 (low)

export const B = 1.082;  // standard block width
export const BL = 2.082; // large block width
export const SURFACE_Y = 1.0; // top of standard block

export type BlockType =
  | 'block-grass'
  | 'block-grass-large'
  | 'block-grass-low'
  | 'block-grass-edge'
  | 'block-grass-corner'
  | 'block-grass-corner-low';

export interface BlockDef {
  model: BlockType;
  x: number;
  y: number; // base y (0 = ground level)
  z: number;
  rotY: number; // rotation around Y in radians
}

export interface IslandLayout {
  blocks: BlockDef[];
  // Animal placement zones: positions on the surface where animals can walk
  walkRadius: number; // radius of the main walking circle
  surfaceY: number;   // Y position of the surface for animals
}

// Helper to add a standard block
function gb(x: number, z: number, rotY = 0): BlockDef {
  return { model: 'block-grass', x, y: 0, z, rotY };
}
function gbl(x: number, z: number, rotY = 0): BlockDef {
  return { model: 'block-grass-large', x, y: 0, z, rotY };
}
function gbc(x: number, z: number, rotY = 0): BlockDef {
  return { model: 'block-grass-corner', x, y: 0, z, rotY };
}
function gblo(x: number, z: number, rotY = 0): BlockDef {
  return { model: 'block-grass-low', x, y: 0, z, rotY };
}
function gbclo(x: number, z: number, rotY = 0): BlockDef {
  return { model: 'block-grass-corner-low', x, y: 0, z, rotY };
}

const H = Math.PI / 2;

/**
 * Level 1 — Small diamond: 1 large center + 4 low edge tips
 *   Shape:
 *        [low]
 *   [low][LARGE][low]
 *        [low]
 */
function level1(): IslandLayout {
  const c = BL / 2; // center of large block = 1.041
  const arm = c + B * 0.6; // arm distance from center
  return {
    blocks: [
      gbl(0, 0),
      gblo(0, -arm),
      gblo(0,  arm),
      gblo(-arm, 0),
      gblo( arm, 0),
    ],
    walkRadius: BL * 0.38,
    surfaceY: SURFACE_Y,
  };
}

/**
 * Level 2 — Cross island: large center + 4 full arms with corner details
 *   Adds full-height blocks extending the cross further
 */
function level2(): IslandLayout {
  const arm1 = BL / 2 + B * 0.5;
  const arm2 = BL / 2 + B * 1.5;
  return {
    blocks: [
      gbl(0, 0),
      // Cross arms (level 1 standard blocks)
      gb(0, -arm1), gb(0, arm1),
      gb(-arm1, 0), gb(arm1, 0),
      // Low tips
      gblo(0, -arm2),
      gblo(0,  arm2),
      gblo(-arm2, 0),
      gblo( arm2, 0),
      // Low corners at the diagonal
      gbclo(-arm1 * 0.7, -arm1 * 0.7),
      gbclo( arm1 * 0.7, -arm1 * 0.7, H * 3),
      gbclo(-arm1 * 0.7,  arm1 * 0.7, H),
      gbclo( arm1 * 0.7,  arm1 * 0.7, H * 2),
    ],
    walkRadius: BL * 0.55,
    surfaceY: SURFACE_Y,
  };
}

/**
 * Level 3 — Expanded cross with filled corners
 */
function level3(): IslandLayout {
  const { blocks } = level2();
  const diag = BL / 2 + B * 0.5;
  return {
    blocks: [
      ...blocks.filter(b => b.model !== 'block-grass-corner-low'),
      // Replace corner-lows with full corners
      gbc(-diag, -diag),
      gbc( diag, -diag, H * 3),
      gbc(-diag,  diag, H),
      gbc( diag,  diag, H * 2),
      // Extra low perimeter shelf
      gblo(-diag, 0),
      gblo( diag, 0),
      gblo(0, -diag),
      gblo(0,  diag),
    ],
    walkRadius: BL * 0.65,
    surfaceY: SURFACE_Y,
  };
}

/**
 * Level 4 — Hexagonal silhouette with plateau and outer shelf
 */
function level4(): IslandLayout {
  const inner = level3();
  const outerArm = BL / 2 + B * 2.5;
  const mid = BL / 2 + B * 1.5;
  return {
    blocks: [
      ...inner.blocks,
      // Outer arm tips
      gblo(0, -outerArm),
      gblo(0,  outerArm),
      gblo(-outerArm, 0),
      gblo( outerArm, 0),
      // Mid-ring (fills gaps around cross)
      gb(-mid, -mid * 0.5),
      gb( mid, -mid * 0.5),
      gb(-mid,  mid * 0.5),
      gb( mid,  mid * 0.5),
      gb(-mid * 0.5, -mid),
      gb( mid * 0.5, -mid),
      gb(-mid * 0.5,  mid),
      gb( mid * 0.5,  mid),
    ],
    walkRadius: BL * 0.8,
    surfaceY: SURFACE_Y,
  };
}

/**
 * Level 5 — Star island: filled center + 8 arms radiating
 */
function level5(): IslandLayout {
  const { blocks } = level4();
  const r = BL / 2 + B * 3.0;
  const diag = r * 0.707;
  return {
    blocks: [
      ...blocks,
      gblo(-diag, -diag),
      gblo( diag, -diag),
      gblo(-diag,  diag),
      gblo( diag,  diag),
      gb(0, -r),
      gb(0,  r),
      gb(-r, 0),
      gb( r, 0),
    ],
    walkRadius: BL * 0.95,
    surfaceY: SURFACE_Y,
  };
}

/**
 * Level 6 — Grand island: everything from level 5 + large outer ring segments
 */
function level6(): IslandLayout {
  const { blocks } = level5();
  const outer = BL / 2 + B * 4.0;
  const half = outer * 0.707;
  return {
    blocks: [
      ...blocks,
      gbl(-outer, 0),
      gbl( outer, 0),
      gbl(0, -outer),
      gbl(0,  outer),
      gblo(-half, -half),
      gblo( half, -half),
      gblo(-half,  half),
      gblo( half,  half),
    ],
    walkRadius: BL * 1.1,
    surfaceY: SURFACE_Y,
  };
}

export const ISLAND_LAYOUTS: Record<number, () => IslandLayout> = {
  1: level1,
  2: level2,
  3: level3,
  4: level4,
  5: level5,
  6: level6,
};

export function getLayout(level: number): IslandLayout {
  const fn = ISLAND_LAYOUTS[Math.min(Math.max(level, 1), 6)];
  return fn();
}
