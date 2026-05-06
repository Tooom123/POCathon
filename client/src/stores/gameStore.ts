import { create } from 'zustand';
import { getTotalIncome, getTotalDecorIncome, getIslandLevel, DecorModel } from '../animals';
import socket from '../socket';

export interface PlacedDecor {
  id: DecorModel;
  x: number;
  z: number;
  rotY: number;
  scale: number;
}

export interface PlayerState {
  id: string;
  name: string;
  totalWorkSeconds: number;
  isFocusing: boolean;
  focusStartedAt: number | null;
  unlockedAnimals: number;
  islandIndex: number;
  islandLevel: number;
  ownedAnimals: string[];
  incomePerSec: number;
}

interface GameStore {
  lobbyCode: string | null;
  myId: string | null;
  players: Record<string, PlayerState>;
  visitingIslandId: string | null;

  coins: number;
  ownedAnimals: string[];
  islandLevel: number;
  placedDecors: PlacedDecor[];
  lastTickTime: number;

  shopOpen: boolean;

  setLobby: (code: string, myId: string, players: Record<string, PlayerState>) => void;
  addPlayer: (player: PlayerState) => void;
  removePlayer: (id: string) => void;
  updatePlayer: (player: PlayerState) => void;
  updatePlayerTick: (id: string, liveTotal: number, liveUnlocked: number, incomePerSec?: number) => void;
  visitIsland: (id: string | null) => void;

  tickCoins: () => void;
  buyAnimal: (animalId: string, cost: number) => boolean;
  removeAnimal: (index: number) => void;
  buyDecor: (decorId: DecorModel, cost: number, scale: number) => boolean;
  removeDecor: (index: number) => void;
  resetIsland: () => void;
  upgradeIsland: (toLevel: number) => boolean;
  setShopOpen: (open: boolean) => void;
}

const SAVE_KEY = 'focusisland-v3';

function loadSaved() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function save(coins: number, ownedAnimals: string[], islandLevel: number, placedDecors: PlacedDecor[] = []) {
  localStorage.setItem(SAVE_KEY, JSON.stringify({ coins, ownedAnimals, islandLevel, placedDecors }));
}

const saved = loadSaved();

export const useGameStore = create<GameStore>((set, get) => ({
  lobbyCode: null,
  myId: null,
  players: {},
  visitingIslandId: null,
  shopOpen: false,

  coins: saved.coins ?? 0,
  ownedAnimals: saved.ownedAnimals ?? ['bunny'],
  islandLevel: saved.islandLevel ?? 1,
  placedDecors: saved.placedDecors ?? [],
  lastTickTime: Date.now(),

  setLobby: (code, myId, players) => set({ lobbyCode: code, myId, players }),
  addPlayer: (player) => set((s) => ({ players: { ...s.players, [player.id]: player } })),
  removePlayer: (id) => set((s) => { const { [id]: _, ...rest } = s.players; return { players: rest }; }),
  updatePlayer: (player) => set((s) => ({ players: { ...s.players, [player.id]: player } })),
  updatePlayerTick: (id, liveTotal, liveUnlocked, incomePerSec) =>
    set((s) => {
      const p = s.players[id];
      if (!p) return {};
      return {
        players: {
          ...s.players,
          [id]: {
            ...p,
            totalWorkSeconds: liveTotal,
            unlockedAnimals: liveUnlocked,
            ...(incomePerSec !== undefined ? { incomePerSec } : {}),
          },
        },
      };
    }),
  visitIsland: (id) => set({ visitingIslandId: id }),

  tickCoins: () => {
    const { lastTickTime, ownedAnimals, coins, islandLevel, placedDecors, players, myId } = get();
    const now = Date.now();
    const me = myId ? players[myId] : null;
    if (!me?.isFocusing) {
      set({ lastTickTime: now });
      return;
    }
    const dt = Math.min((now - lastTickTime) / 1000, 5);
    const income = getTotalIncome(ownedAnimals) + getTotalDecorIncome(placedDecors.map((d) => d.id));
    const next = coins + income * dt;
    set({ coins: next, lastTickTime: now });
    save(next, ownedAnimals, islandLevel, placedDecors);
  },

  buyAnimal: (animalId, cost) => {
    const { coins, ownedAnimals, islandLevel, placedDecors } = get();
    const { capacity } = getIslandLevel(islandLevel);
    if (coins < cost || ownedAnimals.length >= capacity) return false;
    const nextAnimals = [...ownedAnimals, animalId];
    const nextCoins = coins - cost;
    set({ coins: nextCoins, ownedAnimals: nextAnimals });
    save(nextCoins, nextAnimals, islandLevel, placedDecors);
    socket.emit('sync_state', { ownedAnimals: nextAnimals, islandLevel, placedDecors });
    return true;
  },

  removeAnimal: (index) => {
    const { coins, ownedAnimals, islandLevel, placedDecors } = get();
    const next = ownedAnimals.filter((_, i) => i !== index);
    set({ ownedAnimals: next });
    save(coins, next, islandLevel, placedDecors);
    socket.emit('sync_state', { ownedAnimals: next, islandLevel, placedDecors });
  },

  buyDecor: (decorId, cost, scale) => {
    const { coins, ownedAnimals, islandLevel, placedDecors } = get();
    const { decorCapacity } = getIslandLevel(islandLevel);
    if (coins < cost || placedDecors.length >= decorCapacity) return false;
    // Random placement on a ring around the island (avoids overlap with center animals)
    const angle = Math.random() * Math.PI * 2;
    const r = 1.6 + Math.random() * 0.8;
    const next: PlacedDecor[] = [
      ...placedDecors,
      { id: decorId, x: Math.cos(angle) * r, z: Math.sin(angle) * r, rotY: Math.random() * Math.PI * 2, scale },
    ];
    const nextCoins = coins - cost;
    set({ coins: nextCoins, placedDecors: next });
    save(nextCoins, ownedAnimals, islandLevel, next);
    socket.emit('sync_state', { ownedAnimals, islandLevel, placedDecors: next });
    return true;
  },

  removeDecor: (index) => {
    const { coins, ownedAnimals, islandLevel, placedDecors } = get();
    const next = placedDecors.filter((_, i) => i !== index);
    set({ placedDecors: next });
    save(coins, ownedAnimals, islandLevel, next);
    socket.emit('sync_state', { ownedAnimals, islandLevel, placedDecors: next });
  },

  resetIsland: () => {
    const next = { coins: 0, ownedAnimals: ['bunny'], islandLevel: 1, placedDecors: [] as PlacedDecor[] };
    set(next);
    save(next.coins, next.ownedAnimals, next.islandLevel, next.placedDecors);
    socket.emit('sync_state', { ownedAnimals: next.ownedAnimals, islandLevel: next.islandLevel, placedDecors: next.placedDecors });
  },

  upgradeIsland: (toLevel) => {
    const { coins, ownedAnimals, islandLevel, placedDecors } = get();
    const current = getIslandLevel(islandLevel);
    if (toLevel !== islandLevel + 1 || coins < current.upgradeCost) return false;
    const nextCoins = coins - current.upgradeCost;
    set({ coins: nextCoins, islandLevel: toLevel });
    save(nextCoins, ownedAnimals, toLevel, placedDecors);
    socket.emit('sync_state', { ownedAnimals, islandLevel: toLevel, placedDecors });
    return true;
  },

  setShopOpen: (open) => set({ shopOpen: open }),
}));

// Commit focus session on page close
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    const { myId, players } = useGameStore.getState();
    const me = myId ? players[myId] : null;
    if (me?.isFocusing) {
      socket.emit('stop_focus');
    }
  });
}
