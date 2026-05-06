// Island procedural layout system
// All block dimensions measured from GLB bounding boxes:
//   block-grass:        1.082 × 1.000 × 1.082
//   block-grass-large:  2.082 × 1.000 × 2.082
//   block-grass-low:    1.082 × 0.500 × 1.082
//   block-grass-corner: 1.054 × 1.000 × 1.054
//   block-grass-corner-low: 1.054 × 0.500 × 1.054

export const B  = 1.082;  // standard block width
export const BL = 2.082;  // large block width

// Y positions of top surfaces
export const SURFACE_Y     = 1.0;  // top of standard block (y=0 base)
export const SURFACE_Y_LOW = 0.5;  // top of low block

export type BlockType =
  | 'block-grass'
  | 'block-grass-large'
  | 'block-grass-low'
  | 'block-grass-corner'
  | 'block-grass-corner-low';

export interface BlockDef {
  model: BlockType;
  x: number;
  y: number;
  z: number;
  rotY: number;
}

// Decor placement: anchored to a specific block's surface
export interface DecorDef {
  model: 'tree-pine' | 'flowers-tall' | 'mushrooms' | 'plant';
  x: number;
  z: number;
  surfaceY: number; // y of the block surface it sits on
  scale: number;
  rotY: number;
}

export interface IslandLayout {
  blocks: BlockDef[];
  decors: DecorDef[];
  walkRadius: number;
}

const H = Math.PI / 2;

// ── Block helpers ────────────────────────────────────────────────────────────
const gb    = (x: number, z: number, r = 0): BlockDef => ({ model: 'block-grass',        x, y: 0, z, rotY: r });
const gbl   = (x: number, z: number, r = 0): BlockDef => ({ model: 'block-grass-large',  x, y: 0, z, rotY: r });
const gblo  = (x: number, z: number, r = 0): BlockDef => ({ model: 'block-grass-low',    x, y: 0, z, rotY: r });
const gbclo = (x: number, z: number, r = 0): BlockDef => ({ model: 'block-grass-corner-low', x, y: 0, z, rotY: r });

// ── Decor helpers ────────────────────────────────────────────────────────────
const tree   = (x: number, z: number, sy: number, sc = 0.65, r = 0): DecorDef => ({ model: 'tree-pine',    x, z, surfaceY: sy, scale: sc, rotY: r });
const flower = (x: number, z: number, sy: number, sc = 0.55, r = 0): DecorDef => ({ model: 'flowers-tall', x, z, surfaceY: sy, scale: sc, rotY: r });
const mush   = (x: number, z: number, sy: number, sc = 0.5,  r = 0): DecorDef => ({ model: 'mushrooms',    x, z, surfaceY: sy, scale: sc, rotY: r });
const plant  = (x: number, z: number, sy: number, sc = 0.55, r = 0): DecorDef => ({ model: 'plant',        x, z, surfaceY: sy, scale: sc, rotY: r });

// ── Level 1 — Compact cluster: large block + 3 standard + 2 low shelves ─────
// Asymmetric: main mass bottom-left, lower shelf extending right
//
//   [low]
//   [std] [LARGE]
//         [std]  [low]
//
function level1(): IslandLayout {
  const lx = -BL / 2 - B * 0.5; // left standard block center
  const rx =  BL / 2 + B * 0.5; // right low block center
  const bot =  BL / 2 + B * 0.5;
  const top = -BL / 2 - B * 0.5;
  return {
    blocks: [
      gbl(0, 0),
      gb(lx, 0),
      gblo(lx, top),
      gb(0,  bot),
      gblo(rx, bot),
    ],
    decors: [
      tree(lx, top - B * 0.1, SURFACE_Y_LOW, 0.6, 0.3),
      flower(rx - B * 0.2, bot, SURFACE_Y_LOW, 0.5, 0),
    ],
    walkRadius: BL * 0.35,
  };
}

// ── Level 2 — L-shape cluster with low steps ─────────────────────────────────
//
//   [low] [std]
//         [LARGE] [std]
//         [std]
//         [low]
//
function level2(): IslandLayout {
  const right = BL / 2 + B * 0.5;
  const top1  = -(BL / 2 + B * 0.5);
  const bot1  =   BL / 2 + B * 0.5;
  const bot2  =   BL / 2 + B * 1.5;
  const left  = -(BL / 2 + B * 0.5);
  return {
    blocks: [
      gbl(0, 0),
      gb(right, 0),
      gb(0, bot1),
      gblo(0, bot2),
      gb(0, top1),
      gblo(left, top1),
      gbclo(right, top1, H * 3),
    ],
    decors: [
      tree(left + B * 0.1, top1, SURFACE_Y_LOW, 0.65, -0.4),
      flower(right, top1 + B * 0.2, SURFACE_Y_LOW, 0.5, 0),
      mush(0, bot2 - B * 0.1, SURFACE_Y_LOW, 0.5, 1.0),
    ],
    walkRadius: BL * 0.5,
  };
}

// ── Level 3 — T-shape with offset wings ──────────────────────────────────────
function level3(): IslandLayout {
  const { blocks: b2, decors: d2 } = level2();
  const right = BL / 2 + B * 0.5;
  const left  = -(BL / 2 + B * 0.5);
  const top1  = -(BL / 2 + B * 0.5);
  const bot1  =   BL / 2 + B * 0.5;
  return {
    blocks: [
      ...b2,
      gb(left, 0),
      gblo(left, bot1),
      gbclo(left, top1, H),
      gblo(right, bot1),
    ],
    decors: [
      ...d2,
      tree(right + B * 0.1, 0, SURFACE_Y, 0.7, 0.8),
      plant(left, bot1, SURFACE_Y_LOW, 0.55, 0),
    ],
    walkRadius: BL * 0.65,
  };
}

// ── Level 4 — Broad plateau with asymmetric shelves ───────────────────────────
function level4(): IslandLayout {
  const { blocks: b3, decors: d3 } = level3();
  const far    =  BL / 2 + B * 2.5;
  const farNeg = -(BL / 2 + B * 2.5);
  const right  =  BL / 2 + B * 0.5;
  const left   = -(BL / 2 + B * 0.5);
  const bot2   =   BL / 2 + B * 1.5;
  return {
    blocks: [
      ...b3,
      gblo(0, farNeg),
      gblo(far, 0),
      gb(right, farNeg + B),
      gblo(left, bot2 + B * 0.5),
    ],
    decors: [
      ...d3,
      tree(right + B * 0.1, farNeg + B * 0.4, SURFACE_Y, 0.7, -0.2),
      flower(far - B * 0.3, 0, SURFACE_Y_LOW, 0.5, 0.5),
    ],
    walkRadius: BL * 0.8,
  };
}

// ── Level 5 — Wide organic blob ───────────────────────────────────────────────
function level5(): IslandLayout {
  const { blocks: b4, decors: d4 } = level4();
  const farL = -(BL / 2 + B * 2.5);
  const bot3 =   BL / 2 + B * 2.5;
  const right = BL / 2 + B * 0.5;
  return {
    blocks: [
      ...b4,
      gblo(farL, 0),
      gb(farL, -(BL / 2 + B * 0.5)),
      gblo(0, bot3),
      gbclo(right, bot3 - B * 0.5, H * 2),
    ],
    decors: [
      ...d4,
      tree(farL, -(BL / 2 + B * 0.5) + B * 0.1, SURFACE_Y, 0.75, 1.2),
      mush(0, bot3 - B * 0.2, SURFACE_Y_LOW, 0.55, 0),
    ],
    walkRadius: BL * 0.95,
  };
}

// ── Level 6 — Grand sprawling island ─────────────────────────────────────────
function level6(): IslandLayout {
  const { blocks: b5, decors: d5 } = level5();
  const farR =  BL / 2 + B * 3.5;
  const farL = -(BL / 2 + B * 3.5);
  const bot4 =   BL / 2 + B * 3.5;
  const top3 = -(BL / 2 + B * 3.0);
  return {
    blocks: [
      ...b5,
      gbl(farR, 0),
      gblo(farL, BL / 2 + B),
      gblo(0, bot4),
      gb(farR * 0.6, top3),
      gbclo(farR, top3 + B * 0.5, H * 3),
    ],
    decors: [
      ...d5,
      tree(farR + B * 0.1, B * 0.2, SURFACE_Y, 0.8, -0.6),
      flower(0, bot4 - B * 0.2, SURFACE_Y_LOW, 0.55, 0),
      plant(farR * 0.6 - B * 0.2, top3, SURFACE_Y, 0.6, 0.3),
    ],
    walkRadius: BL * 1.15,
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
