export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface AnimalData {
  id: string;
  name: string;
  emoji: string;
  cost: number;
  incomePerSec: number;
  rarity: Rarity;
  unlockSeconds: number; // total focus seconds required
}

export const RARITY_COLORS: Record<Rarity, string> = {
  common:    '#aaaaaa',
  uncommon:  '#55cc55',
  rare:      '#4488ff',
  epic:      '#aa44ff',
  legendary: '#ffaa00',
};

export const RARITY_LABELS: Record<Rarity, string> = {
  common:    'Commun',
  uncommon:  'Inhabituel',
  rare:      'Rare',
  epic:      'Épique',
  legendary: 'Légendaire',
};

// Ordered weakest→strongest within each rarity tier.
// Chick (smallest) earns less than Bunny (starter).
export const SHOP_ANIMALS: AnimalData[] = [
  // ── Common ──────────────────────────────────────
  { id: 'chick',    name: 'Poussin',      emoji: '🐥', cost: 30,      incomePerSec: 0.5,  rarity: 'common',    unlockSeconds: 0     },
  { id: 'bunny',    name: 'Lapin',        emoji: '🐰', cost: 80,      incomePerSec: 1,    rarity: 'common',    unlockSeconds: 0     },
  { id: 'pig',      name: 'Cochon',       emoji: '🐷', cost: 200,     incomePerSec: 2,    rarity: 'common',    unlockSeconds: 120   },
  { id: 'cat',      name: 'Chat',         emoji: '🐱', cost: 400,     incomePerSec: 3.5,  rarity: 'common',    unlockSeconds: 240   },
  // ── Uncommon ────────────────────────────────────
  { id: 'dog',      name: 'Chien',        emoji: '🐶', cost: 900,     incomePerSec: 7,    rarity: 'uncommon',  unlockSeconds: 480   },
  { id: 'penguin',  name: 'Pingouin',     emoji: '🐧', cost: 1500,    incomePerSec: 12,   rarity: 'uncommon',  unlockSeconds: 720   },
  { id: 'beaver',   name: 'Castor',       emoji: '🦫', cost: 2500,    incomePerSec: 20,   rarity: 'uncommon',  unlockSeconds: 1080  },
  { id: 'fox',      name: 'Renard',       emoji: '🦊', cost: 4000,    incomePerSec: 32,   rarity: 'uncommon',  unlockSeconds: 1440  },
  // ── Rare ────────────────────────────────────────
  { id: 'panda',    name: 'Panda',        emoji: '🐼', cost: 8000,    incomePerSec: 55,   rarity: 'rare',      unlockSeconds: 2160  },
  { id: 'koala',    name: 'Koala',        emoji: '🐨', cost: 15000,   incomePerSec: 90,   rarity: 'rare',      unlockSeconds: 3000  },
  { id: 'deer',     name: 'Cerf',         emoji: '🦌', cost: 28000,   incomePerSec: 150,  rarity: 'rare',      unlockSeconds: 4320  },
  { id: 'monkey',   name: 'Singe',        emoji: '🐒', cost: 50000,   incomePerSec: 240,  rarity: 'rare',      unlockSeconds: 6000  },
  // ── Epic ────────────────────────────────────────
  { id: 'parrot',   name: 'Perroquet',    emoji: '🦜', cost: 100000,  incomePerSec: 400,  rarity: 'epic',      unlockSeconds: 9000  },
  { id: 'tiger',    name: 'Tigre',        emoji: '🐯', cost: 180000,  incomePerSec: 650,  rarity: 'epic',      unlockSeconds: 12600 },
  { id: 'lion',     name: 'Lion',         emoji: '🦁', cost: 300000,  incomePerSec: 1000, rarity: 'epic',      unlockSeconds: 18000 },
  // ── Legendary (show ??? when locked) ────────────
  { id: 'elephant', name: 'Éléphant',     emoji: '🐘', cost: 600000,  incomePerSec: 1800, rarity: 'legendary', unlockSeconds: 25200 },
  { id: 'giraffe',  name: 'Girafe',       emoji: '🦒', cost: 1200000, incomePerSec: 3000, rarity: 'legendary', unlockSeconds: 36000 },
  { id: 'polar',    name: 'Ours polaire', emoji: '🐻‍❄️', cost: 2500000, incomePerSec: 5000, rarity: 'legendary', unlockSeconds: 54000 },
];

export interface IslandLevel {
  level: number;
  gridN: number;
  capacity: number;
  label: string;
  upgradeCost: number;
}

export const ISLAND_LEVELS: IslandLevel[] = [
  { level: 1, gridN: 3, capacity: 4,  label: 'Petite île',      upgradeCost: 500    },
  { level: 2, gridN: 4, capacity: 6,  label: 'Île modeste',     upgradeCost: 3000   },
  { level: 3, gridN: 5, capacity: 9,  label: 'Île étendue',     upgradeCost: 15000  },
  { level: 4, gridN: 6, capacity: 13, label: 'Grande île',      upgradeCost: 70000  },
  { level: 5, gridN: 7, capacity: 18, label: 'Île majestueuse', upgradeCost: 300000 },
  { level: 6, gridN: 8, capacity: 25, label: 'Île royale',      upgradeCost: Infinity },
];

export function getIslandLevel(level: number): IslandLevel {
  return ISLAND_LEVELS[Math.min(level - 1, ISLAND_LEVELS.length - 1)];
}

export function getTotalIncome(owned: string[]): number {
  return owned.reduce((sum, id) => {
    const a = SHOP_ANIMALS.find((x) => x.id === id);
    return sum + (a?.incomePerSec ?? 0);
  }, 0);
}

export function formatCoins(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  if (n >= 10)        return Math.floor(n).toString();
  if (n > 0)          return n.toFixed(1);
  return '0';
}
