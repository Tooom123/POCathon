// ─── Island Layout System ──────────────────────────────────────────────────
//
// Philosophy (inspired by the Kenney platformer kit preview image):
//   • Main walking area = contiguous full-height blocks (surface at y=1.0)
//   • Surrounding lower shelves = low blocks (surface at y=0.5), purely visual
//   • Blocks scaled 1.6× via group scale in Island.tsx → spacious feel
//   • No ramps exist in the kit; level transitions are visual steps only
//   • Animals always walk on the flat main surface (GROUND_Y = 1.0)
//   • Shapes are irregular: L, T, blob, cross — not squares
//   • Decors minimal: 1-2 trees max, placed on main surface corners only
//
// All dimensions are in UNSCALED units (Island.tsx applies a 1.6× group scale).
// B  = 1.082  (standard block footprint, unscaled)
// BL = 2.082  (large block footprint, unscaled)
//
// Grid rule: blocks snap to multiples of B so faces are flush.
// Low blocks sit at y=0 base → their top surface is 0.5 above ground plane.
// Full blocks sit at y=0 base → their top surface is 1.0 above ground plane.

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
  | 'block-grass-corner-low'
  | 'block-grass-curve';

export interface BlockDef {
  model: BlockType;
  x: number;
  y: number;
  z: number;
  rotY: number;
}

export interface DecorDef {
  model: 'tree-pine' | 'flowers-tall' | 'mushrooms' | 'plant';
  x: number;
  z: number;
  surfaceY: number;
  scale: number;
  rotY: number;
}

export interface IslandLayout {
  blocks: BlockDef[];
  decors: DecorDef[];
  walkRadius: number; // animals stay within this radius on SURFACE_Y_FULL
}

// ── block helpers ────────────────────────────────────────────────────────────
const gb    = (x: number, z: number, r = 0): BlockDef => ({ model: 'block-grass',           x, y: 0, z, rotY: r });
const gbl   = (x: number, z: number, r = 0): BlockDef => ({ model: 'block-grass-large',     x, y: 0, z, rotY: r });
const gblo  = (x: number, z: number, r = 0): BlockDef => ({ model: 'block-grass-low',       x, y: 0, z, rotY: r });
const gblol = (x: number, z: number, r = 0): BlockDef => ({ model: 'block-grass-low-large', x, y: 0, z, rotY: r });
const gblong= (x: number, z: number, r = 0): BlockDef => ({ model: 'block-grass-long',      x, y: 0, z, rotY: r });
const gbclo = (x: number, z: number, r = 0): BlockDef => ({ model: 'block-grass-corner-low',x, y: 0, z, rotY: r });

// ── decor helpers ────────────────────────────────────────────────────────────
const SY = SURFACE_Y_FULL;
const SL = SURFACE_Y_LOW;
const H  = Math.PI / 2;

const tree   = (x: number, z: number, r = 0): DecorDef => ({ model: 'tree-pine',    x, z, surfaceY: SY, scale: 0.7,  rotY: r });
const flower = (x: number, z: number, sy: number, r = 0): DecorDef => ({ model: 'flowers-tall', x, z, surfaceY: sy, scale: 0.5, rotY: r });
const mush   = (x: number, z: number, sy: number, r = 0): DecorDef => ({ model: 'mushrooms',    x, z, surfaceY: sy, scale: 0.45, rotY: r });

// ─────────────────────────────────────────────────────────────────────────────
// Level 1 — T-shape: large centre block + one column of 3 attached left
//
//        [BIG]
//   [B]  [BIG]
//   [B]
//   [B]  (low shelf below)
//
// Main surface: BIG (2.082×2.082) + col of 3 B to its left
// Low shelf along bottom
// walkRadius covers the big block area
// ─────────────────────────────────────────────────────────────────────────────
function level1(): IslandLayout {
  // Centre the large block at origin
  // Column of 3 standard blocks flush on left edge: x = -(BL/2 + B/2)
  const cx = -(BL / 2 + B / 2);  // -1.582
  const cy0 = -B;                  // top of column
  const cy1 = 0;
  const cy2 = B;                   // bottom of column

  // Low shelf below the column bottom, two blocks wide
  const shelfZ = B + B / 2 + B / 2; // flush below cy2

  return {
    blocks: [
      // Large centre
      gbl(0, 0),
      // Left column (3 standard blocks)
      gb(cx, cy0),
      gb(cx, cy1),
      gb(cx, cy2),
      // Low shelf: two low blocks extending right from column base
      gblo(cx, shelfZ),
      gblo(0,  shelfZ),
      gblo(BL / 2 + B / 2, shelfZ),
      // Low corner to round the right
      gbclo(BL / 2 + B / 2, 0, H * 3),
    ],
    decors: [
      tree(cx, cy0 + 0.1, 0.5),
      mush(BL / 2 - 0.3, -BL / 2 + 0.3, SY, 1.0),
    ],
    walkRadius: BL * 0.55,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Level 2 — L-shape: large + long block forming an L, low border on open sides
// ─────────────────────────────────────────────────────────────────────────────
function level2(): IslandLayout {
  // Large block at origin, long block (2.082×1.082) to its right rotated
  const longZ = BL / 2 + B / 2;

  return {
    blocks: [
      gbl(0, 0),
      gblong(0, longZ),          // long block flush below large
      gb(-BL / 2 - B / 2, 0),   // single block on left side
      gb(-BL / 2 - B / 2, -B),  // extend up

      // Low border around open edges
      gblo(-BL / 2 - B / 2, B + B / 2),
      gblo(0,  longZ + B),
      gblo(BL / 2 + B / 2, longZ),
      gblo(BL / 2 + B / 2, 0),
      gblol(-BL / 2 - BL / 2, 0, 0),  // large low on far left
      gbclo(BL / 2 + B / 2, -BL / 2 + B / 2, H * 3),
    ],
    decors: [
      tree(-BL / 2 - B / 2, -B + 0.1, -0.3),
      flower(BL / 2 - 0.3, longZ + 0.2, SY, 0.5),
    ],
    walkRadius: BL * 0.7,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Level 3 — Blob: 3×3 full blocks (9 blocks), low border all around
// Irregular: top-right corner removed, replaced by low block
// ─────────────────────────────────────────────────────────────────────────────
function level3(): IslandLayout {
  return {
    blocks: [
      // 3×3 minus top-right
      gb(-B, -B), gb(0, -B), /* gap at (B,-B) → low */
      gb(-B,  0), gb(0,  0), gb(B,  0),
      gb(-B,  B), gb(0,  B), gb(B,  B),

      // Top-right replaced by low
      gblo(B, -B),

      // Low border: bottom row
      gblo(-B,  B + B), gblo(0,  B + B), gblo(B,  B + B),
      // Low border: right column
      gblo(B + B, 0), gblo(B + B, B),
      // Low border: top-left corner area
      gblo(-B - B, -B), gblo(-B - B, 0),
      // Corner caps
      gbclo(-B - B, B + B, H),
      gbclo(B + B, B + B, H * 2),
    ],
    decors: [
      tree(-B, -B + 0.1, 0.3),
      tree(B + 0.1, B + 0.1, -0.4),
      mush(B + B - 0.2, 0, SL, 0.8),
    ],
    walkRadius: B * 1.3,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Level 4 — Cross shape: large centre + 4 arms of 2 standard blocks each
// Low shelves at arm tips
// ─────────────────────────────────────────────────────────────────────────────
function level4(): IslandLayout {
  const arm = BL / 2 + B / 2;   // where first arm block starts
  const arm2 = arm + B;          // second arm block

  return {
    blocks: [
      // Centre large
      gbl(0, 0),
      // 4 arms: up / down / left / right, 2 blocks each
      gb(0, -arm), gb(0, -arm2),
      gb(0,  arm), gb(0,  arm2),
      gb(-arm, 0), gb(-arm2, 0),
      gb( arm, 0), gb( arm2, 0),

      // Low at arm tips
      gblo(0, -(arm2 + B)),
      gblo(0,   arm2 + B),
      gblo(-(arm2 + B), 0),
      gblo(  arm2 + B, 0),

      // Low-large in the 4 diagonal gaps
      gblol(-arm,  -arm),
      gblol( arm,  -arm),
      gblol(-arm,   arm),
      gblol( arm,   arm),
    ],
    decors: [
      tree(-arm2, 0, 0.5),
      tree(0, -arm2 + 0.1, -0.5),
      mush(arm, arm - 0.2, SL, 0.9),
    ],
    walkRadius: BL * 0.9,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Level 5 — Star blob: level 4 cross + diagonal full blocks filling gaps
// ─────────────────────────────────────────────────────────────────────────────
function level5(): IslandLayout {
  const { blocks: b4, decors: d4 } = level4();
  const arm = BL / 2 + B / 2;

  return {
    blocks: [
      ...b4.filter(b => b.model !== 'block-grass-low-large'), // remove low diag
      // Replace diagonal lows with full single blocks
      gb(-arm, -arm),
      gb( arm, -arm),
      gb(-arm,  arm),
      gb( arm,  arm),
      // Low outer border for diagonals
      gblo(-arm - B, -arm), gblo(-arm, -arm - B),
      gblo( arm + B, -arm), gblo( arm, -arm - B),
      gblo(-arm - B,  arm), gblo(-arm,  arm + B),
      gblo( arm + B,  arm), gblo( arm,  arm + B),
      // Corner caps
      gbclo(-arm - B, -arm - B, 0),
      gbclo( arm + B, -arm - B, H * 3),
      gbclo(-arm - B,  arm + B, H),
      gbclo( arm + B,  arm + B, H * 2),
    ],
    decors: [
      ...d4,
      flower(-arm, -arm + 0.1, SY, 0.5),
      mush( arm, -arm, SY, 0.6),
    ],
    walkRadius: BL * 1.1,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Level 6 — Grand island: level 5 + outer ring of large blocks on 4 sides
// ─────────────────────────────────────────────────────────────────────────────
function level6(): IslandLayout {
  const { blocks: b5, decors: d5 } = level5();
  const arm = BL / 2 + B / 2;
  const outerR = arm + B * 2 + BL / 2;

  return {
    blocks: [
      ...b5,
      gbl(0,      -outerR),
      gbl(0,       outerR),
      gbl(-outerR, 0),
      gbl( outerR, 0),

      // Low-large at outer corners
      gblol(-outerR, -outerR),
      gblol( outerR, -outerR),
      gblol(-outerR,  outerR),
      gblol( outerR,  outerR),
    ],
    decors: [
      ...d5,
      tree(0, -outerR + 0.2, 1.0),
      tree(-outerR + 0.2, 0, -0.8),
      flower(outerR - 0.3, 0, SY, 0.5),
    ],
    walkRadius: BL * 1.35,
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
