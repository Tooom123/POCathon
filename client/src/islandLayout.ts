// ─── Island Layout System ──────────────────────────────────────────────────
//
// Design goals (from user feedback):
//   • Large continuous surface — use block-grass-large (2.082×2.082) as primary tile
//   • Organic irregular outline — not a square, not a cross, a blob/peninsula shape
//   • Minimal decor — 1 tree max in a corner, no clutter
//   • Animals need SPACE — walkRadius must be large enough to separate them
//   • Island group is scaled 1.6× in Island.tsx → world sizes are 1.6× larger
//
// Coordinate system: all values are in UNSCALED local units.
//   BL = 2.082  — large block (primary tile)
//   B  = 1.082  — standard block
//   BH = 0.5    — low block top surface Y
//
// Layout strategy:
//   • Main surface: contiguous large blocks placed on a BL grid
//   • Edge trimming: use block-grass (B) or block-grass-long (2.082×1.082)
//     to create irregular outlines that don't align to a visible grid
//   • Low shelf: single row of low blocks around perimeter (visual only)
//   • Animals walk on the main surface (GROUND_Y=1.0)

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
  walkRadius: number;
}

const H = Math.PI / 2;

const gbl   = (x: number, z: number, r = 0): BlockDef => ({ model: 'block-grass-large',     x, y: 0, z, rotY: r });
const gb    = (x: number, z: number, r = 0): BlockDef => ({ model: 'block-grass',            x, y: 0, z, rotY: r });
const gblo  = (x: number, z: number, r = 0): BlockDef => ({ model: 'block-grass-low',        x, y: 0, z, rotY: r });
const gblol = (x: number, z: number, r = 0): BlockDef => ({ model: 'block-grass-low-large',  x, y: 0, z, rotY: r });
const gblong= (x: number, z: number, r = 0): BlockDef => ({ model: 'block-grass-long',       x, y: 0, z, rotY: r });
const gbclo = (x: number, z: number, r = 0): BlockDef => ({ model: 'block-grass-corner-low', x, y: 0, z, rotY: r });

const tree   = (x: number, z: number, r = 0): DecorDef => ({ model: 'tree-pine',    x, z, surfaceY: SURFACE_Y_FULL, scale: 0.75, rotY: r });
const flower = (x: number, z: number, sy = SURFACE_Y_FULL, r = 0): DecorDef => ({ model: 'flowers-tall', x, z, surfaceY: sy, scale: 0.5, rotY: r });
const mush   = (x: number, z: number, sy = SURFACE_Y_LOW,  r = 0): DecorDef => ({ model: 'mushrooms',    x, z, surfaceY: sy, scale: 0.5, rotY: r });

// ── Level 1 ── 2×2 large blocks (peninsula, one corner cut to low) ─────────
// Main surface: 4 BL tiles = 4.164 × 4.164 → walkRadius ~1.8 unscaled
//
//   [BIG][BIG]
//   [BIG][BIG]
//   [low shelf on south + west]
function level1(): IslandLayout {
  const h = BL / 2; // 1.041 — half a large block
  return {
    blocks: [
      // 2×2 large block core
      gbl(-h, -h), gbl(h, -h),
      gbl(-h,  h), gbl(h,  h),
      // Low shelf — south edge, full width
      gblol(0, h + BL / 2),
      // Low shelf — east edge, single large-low
      gblol(h + BL / 2, 0),
      // Low corner cap SE
      gbclo(h + BL / 2, h + BL / 2, H * 2),
    ],
    decors: [
      tree(-h + 0.3, -h + 0.3, 0.4),
    ],
    walkRadius: BL * 0.88,
  };
}

// ── Level 2 ── 3×2 large blocks + two standard blocks (L-shape) ───────────
// Core: 3 wide × 2 deep large blocks; right-bottom replaced by 2 standard blocks
// East column: gbl(BL, -hh) right edge at BL+BL/2=3.123; gb right edge at BL+B=3.164
// Low east shelf flush with gb right edge: center at BL+B+BL/2=4.205, but gap!
// Fix: attach low shelf to gb right edge = BL+B, center at BL+B+BL/2; gap only 0.04
// Simplify: drop isolated corner-low, keep east shelf only alongside gb tiles
function level2(): IslandLayout {
  const hh = BL / 2; // 1.041
  // gb at x=BL+B/2=3.123, spans [BL, BL+B]=[3.082, 4.246] — wait, B=1.082
  // BL=2.082, hh=1.041
  // gbl(BL,-hh) center=(2.082,-1.041), spans x=[1.041,3.123]
  // gb(BL+B/2, hh) center=(3.623, 1.041), spans x=[3.082,4.164] — 0.041 gap from gbl right edge 3.123!
  // Fix: place gb flush: center x = BL + BL/2 + B/2 = 2.082+1.041+0.541 = 3.664...
  // Actually: gb left edge must touch gbl right edge (3.123): gb center = 3.123 + B/2 = 3.664
  const gbEastX = BL + BL / 2 + B / 2; // 3.664 — flush with gbl(BL,_) right edge
  return {
    blocks: [
      // 3×2 large block core (top 2 rows)
      gbl(-BL, -hh), gbl(0, -hh), gbl(BL, -hh),
      gbl(-BL,  hh), gbl(0,  hh),
      // Two standard blocks flush against right edge of gbl(BL,_)
      gb(gbEastX, -hh), gb(gbEastX, hh),
      // Low shelf south
      gblol(-BL, hh + BL / 2),
      gblol(0,   hh + BL / 2),
      // Low shelf east (flush against gb right edge)
      gblol(gbEastX + B / 2 + BL / 2, -hh),
      gblol(gbEastX + B / 2 + BL / 2,  hh),
      // Low corner cap SW
      gbclo(-BL - BL / 2, hh + BL / 2, H),
    ],
    decors: [
      tree(-BL + 0.2, -hh + 0.2, -0.3),
      // Flower inside gbl(0, hh): center (0, 1.041), spans x=[-1.041,1.041], z=[0,2.082]
      flower(0.5, hh - 0.4, SURFACE_Y_FULL, 0.8),
    ],
    walkRadius: BL * 1.1,
  };
}

// ── Level 3 ── 3×3 large blocks minus one corner = 8 large tiles ──────────
function level3(): IslandLayout {
  return {
    blocks: [
      // 3×3 minus top-right (BL, -BL)
      gbl(-BL, -BL), gbl(0, -BL), /* skip (BL,-BL) */
      gbl(-BL,   0), gbl(0,   0), gbl(BL,   0),
      gbl(-BL,  BL), gbl(0,  BL), gbl(BL,  BL),
      // Fill missing corner with single standard block
      gb(BL + B / 2, -BL),
      // Low shelf — north row
      gblol(-BL, -BL - BL / 2),
      gblol(0,   -BL - BL / 2),
      gblo(BL + B / 2, -BL - BL / 2),
      // Low shelf — east column
      gblol(BL + BL / 2, 0),
      gblol(BL + BL / 2, BL),
      // Low shelf — south row
      gblol(-BL, BL + BL / 2),
      gblol(0,   BL + BL / 2),
      gblol(BL,  BL + BL / 2),
      // Low shelf — west column
      gblol(-BL - BL / 2, -BL),
      gblol(-BL - BL / 2,  0),
      gblol(-BL - BL / 2,  BL),
      // Corner low caps
      gbclo(-BL - BL / 2, -BL - BL / 2, 0),
      gbclo(BL + BL / 2, BL + BL / 2, H * 2),
      gbclo(-BL - BL / 2, BL + BL / 2, H),
    ],
    decors: [
      tree(-BL + 0.2, -BL + 0.2, 0.6),
      tree(BL - 0.2,  BL - 0.2, -0.4),
      mush(BL + BL / 2 - 0.3, 0, SURFACE_Y_LOW, 1.0),
    ],
    walkRadius: BL * 1.45,
  };
}

// ── Level 4 ── 4×3 minus 2 corners, plus long block arms ──────────────────
function level4(): IslandLayout {
  const { blocks: b3, decors: d3 } = level3();
  return {
    blocks: [
      ...b3,
      // 4th column east — 2 large blocks
      gbl(BL * 2, 0),
      gbl(BL * 2, BL),
      // Long block arm north
      gblong(BL / 2, -BL - BL / 2 - B / 2),
      // Low shelf extensions
      gblol(BL * 2 + BL / 2, 0),
      gblol(BL * 2 + BL / 2, BL),
    ],
    decors: [
      ...d3,
      tree(BL * 2 - 0.2, 0 + 0.2, 1.2),
      flower(-BL - BL / 2 + 0.2, BL, SURFACE_Y_LOW, -0.5),
    ],
    walkRadius: BL * 1.65,
  };
}

// ── Level 5 ── 4×4 core with bevelled corners ─────────────────────────────
function level5(): IslandLayout {
  const { blocks: b4, decors: d4 } = level4();
  return {
    blocks: [
      ...b4,
      // Fill north row
      gbl(-BL, -BL * 2),
      gbl(0,   -BL * 2),
      gbl(BL,  -BL * 2),
      // Low shelf north extensions
      gblol(-BL, -BL * 2 - BL / 2),
      gblol(0,   -BL * 2 - BL / 2),
      gblol(BL,  -BL * 2 - BL / 2),
    ],
    decors: [
      ...d4,
      tree(-BL + 0.2, -BL * 2 + 0.3, -1.0),
      mush(BL * 2 + BL / 2 - 0.3, BL, SURFACE_Y_LOW, 0.5),
    ],
    walkRadius: BL * 1.85,
  };
}

// ── Level 6 ── Grand island ────────────────────────────────────────────────
function level6(): IslandLayout {
  const { blocks: b5, decors: d5 } = level5();
  return {
    blocks: [
      ...b5,
      // Extra west column
      gbl(-BL * 2, -BL),
      gbl(-BL * 2,   0),
      gbl(-BL * 2,  BL),
      // Low shelf west
      gblol(-BL * 2 - BL / 2, -BL),
      gblol(-BL * 2 - BL / 2,  0),
      gblol(-BL * 2 - BL / 2,  BL),
      // South extension
      gbl(0,   BL * 2),
      gbl(-BL, BL * 2),
    ],
    decors: [
      ...d5,
      tree(-BL * 2 + 0.2, 0 + 0.2, 2.0),
      flower(-BL * 2 - BL / 2 + 0.3, -BL, SURFACE_Y_LOW, 0),
    ],
    walkRadius: BL * 2.1,
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
