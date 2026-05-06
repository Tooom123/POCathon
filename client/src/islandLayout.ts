// Island layout — all blocks snapped to a grid so surfaces are flush and continuous.
//
// Grid units:
//   B  = 1.082  (standard 1×1 block footprint)
//   BL = 2.082  (large block = exactly 2×B - 0.082 overlap... actually independent)
//
// Key insight from the Kenney image: islands look good when blocks OVERLAP slightly
// (share edges) so there are no gaps. We position every block so its edge aligns
// with a neighbour's edge.
//
// Block surfaces (y measured from block base at y=0):
//   Standard / large / edge / corner: top = 1.0
//   Low / corner-low / low-large:     top = 0.5
//
// Animals walk only on the MAIN surface (y=1.0). The walkRadius is sized so they
// never step off onto the lower shelves.

export const B  = 1.082;
export const BL = 2.082;

export const SURFACE_Y_FULL = 1.0;
export const SURFACE_Y_LOW  = 0.5;

export type BlockType =
  | 'block-grass'
  | 'block-grass-large'
  | 'block-grass-long'
  | 'block-grass-low'
  | 'block-grass-low-large'
  | 'block-grass-edge'
  | 'block-grass-corner'
  | 'block-grass-corner-low';

export interface BlockDef {
  model: BlockType;
  x: number;
  y: number;
  z: number;
  rotY: number;
}

export interface DecorDef {
  model: 'tree-pine' | 'tree-pine-snow-small' | 'flowers-tall' | 'mushrooms' | 'plant';
  x: number;
  z: number;
  surfaceY: number;
  scale: number;
  rotY: number;
}

export interface IslandLayout {
  blocks: BlockDef[];
  decors: DecorDef[];
  // Radius within which animals are allowed to wander (on SURFACE_Y_FULL)
  walkRadius: number;
}

const H = Math.PI / 2;

// ── helpers ─────────────────────────────────────────────────────────────────
const gb    = (x: number, z: number, r = 0): BlockDef => ({ model: 'block-grass',        x, y: 0, z, rotY: r });
const gblo  = (x: number, z: number, r = 0): BlockDef => ({ model: 'block-grass-low',    x, y: 0, z, rotY: r });
const gblol = (x: number, z: number, r = 0): BlockDef => ({ model: 'block-grass-low-large', x, y: 0, z, rotY: r });
const gblong= (x: number, z: number, r = 0): BlockDef => ({ model: 'block-grass-long',   x, y: 0, z, rotY: r });
const gbclo = (x: number, z: number, r = 0): BlockDef => ({ model: 'block-grass-corner-low', x, y: 0, z, rotY: r });

const SY = SURFACE_Y_FULL;
const SL = SURFACE_Y_LOW;

const tree   = (x: number, z: number, sy: number, sc = 0.65, r = 0): DecorDef => ({ model: 'tree-pine',          x, z, surfaceY: sy, scale: sc, rotY: r });
const treeS  = (x: number, z: number, sy: number, sc = 0.55, r = 0): DecorDef => ({ model: 'tree-pine-snow-small',x, z, surfaceY: sy, scale: sc, rotY: r });
const flower = (x: number, z: number, sy: number, sc = 0.55, r = 0): DecorDef => ({ model: 'flowers-tall',        x, z, surfaceY: sy, scale: sc, rotY: r });
const mush   = (x: number, z: number, sy: number, sc = 0.5,  r = 0): DecorDef => ({ model: 'mushrooms',           x, z, surfaceY: sy, scale: sc, rotY: r });
const plt    = (x: number, z: number, sy: number, sc = 0.5,  r = 0): DecorDef => ({ model: 'plant',               x, z, surfaceY: sy, scale: sc, rotY: r });

// ── Level 1 ── Compact 2×2 patch of standard blocks + low shelf on one side ─
//
//  [B][B]
//  [B][B]
//       [lo][lo]  ← low shelf, flush against right edge
//
// Grid: each B = 1.082. Blocks centred at ±B/2 from origin.
// Shelf starts exactly at x = B, flush edge-to-edge.
//
function level1(): IslandLayout {
  const h = B / 2;  // 0.541
  return {
    blocks: [
      gb(-h, -h), gb(h, -h),
      gb(-h,  h), gb(h,  h),
      // Low shelf: two low blocks butting against right edge (x = B)
      gblo(B + h,  h),
      gblo(B + h, -h),
    ],
    decors: [
      tree(-h, -h - B * 0.05, SY, 0.55, 0.3),
      flower(B + h - 0.15, h * 0.5, SL, 0.45, 0),
    ],
    walkRadius: B * 0.85,
  };
}

// ── Level 2 ── 2×3 core + low-large shelf extending back ──────────────────
//
//  [B][B]
//  [B][B]
//  [B][B]
//  [LL——]  ← low-large (2.082×2.082) centred under bottom row
//
function level2(): IslandLayout {
  const h = B / 2;
  const bot = B + B / 2;         // centre of 3rd row
  const llz = bot + (BL / 2);    // low-large centre Z (flush against bottom)
  return {
    blocks: [
      gb(-h, -B), gb(h, -B),
      gb(-h,  0), gb(h,  0),
      gb(-h,  B), gb(h,  B),
      gblol(0, llz),
      // Low corner pieces at sides of low-large
      gbclo(-B - h * 0.3, B,       H),
      gbclo( B + h * 0.3, B,       H * 3),
    ],
    decors: [
      tree(-h, -B + 0.05, SY, 0.6, -0.3),
      flower(h + 0.1, 0, SY, 0.5, 0),
      mush(0, llz - 0.2, SL, 0.5, 0.8),
      plt(B * 0.6, llz + 0.3, SL, 0.45, 0),
    ],
    walkRadius: B * 0.9,
  };
}

// ── Level 3 ── 3×3 core + two low-large shelves (L-shape) ─────────────────
//
//  [B][B][B]
//  [B][B][B]
//  [B][B][B]
//  [LL——][lo]    ← low-large + low corner
//  [lo]          ← extra low on left
//
function level3(): IslandLayout {
  const h = B / 2;
  return {
    blocks: [
      // 3×3 core
      gb(-B, -B), gb(0, -B), gb(B, -B),
      gb(-B,  0), gb(0,  0), gb(B,  0),
      gb(-B,  B), gb(0,  B), gb(B,  B),
      // Low-large behind centre-bottom row, flush
      gblol(0, B + BL / 2),
      // Low single on left, flush
      gblo(-B - h, B + h),
      gblo(-B - h, 0),
      // Low corner to cap right side
      gbclo(B + h, B + h, H * 2),
    ],
    decors: [
      tree(-B, -B, SY, 0.65, 0.4),
      tree(B + 0.05, -B + 0.1, SY, 0.6, -0.5),
      flower(-B - h, 0, SL, 0.5, 0),
      mush(0, B + BL / 2 - 0.3, SL, 0.5, 1.0),
      plt(B + h - 0.1, B + 0.2, SL, 0.5, 0),
    ],
    walkRadius: B * 1.25,
  };
}

// ── Level 4 ── 3×3 core + low-large on two sides + long shelf ─────────────
function level4(): IslandLayout {
  const { blocks: b3, decors: d3 } = level3();
  return {
    blocks: [
      ...b3,
      // Low-large on right side, flush
      gblol(B + BL / 2, 0),
      // Long shelf at top (2.082×1.082 = long block)
      gblong(0, -B - B / 2),
      gblong(0, -B - B / 2 - B, 0),
    ],
    decors: [
      ...d3,
      flower(B + BL / 2 - 0.2, -0.3, SL, 0.5, 1.2),
      treeS(0, -B - B / 2 - B + 0.1, SY, 0.6, 0),
    ],
    walkRadius: B * 1.35,
  };
}

// ── Level 5 ── Bigger sprawl: adds another 3×1 row on top + more shelves ──
function level5(): IslandLayout {
  const { blocks: b4, decors: d4 } = level4();
  return {
    blocks: [
      ...b4,
      // Extra column on left
      gb(-2 * B, -B),
      gb(-2 * B,  0),
      gb(-2 * B,  B),
      // Low-large on that new left side
      gblol(-2 * B - BL / 2, 0),
    ],
    decors: [
      ...d4,
      tree(-2 * B, -B + 0.05, SY, 0.7, 0.9),
      mush(-2 * B - BL / 2 + 0.2, -0.2, SL, 0.55, 0),
    ],
    walkRadius: B * 1.55,
  };
}

// ── Level 6 ── Grand island: 4×4 core + shelves on all sides ──────────────
function level6(): IslandLayout {
  const { blocks: b5, decors: d5 } = level5();
  return {
    blocks: [
      ...b5,
      // 4th column on right
      gb(2 * B, -B),
      gb(2 * B,  0),
      gb(2 * B,  B),
      // Large shelf top-right
      gblol(2 * B + BL / 2, -B / 2),
      // Extra long block bottom
      gblong(B, B + B + B / 2),
    ],
    decors: [
      ...d5,
      tree(2 * B + 0.1, B - 0.05, SY, 0.7, -0.8),
      flower(2 * B + BL / 2 - 0.2, B * 0.3, SL, 0.5, 0),
      plt(B + 0.1, B + B + B / 2 - 0.1, SY, 0.55, 0),
    ],
    walkRadius: B * 1.8,
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
  return ISLAND_LAYOUTS[Math.min(Math.max(level, 1), 6)]();
}
