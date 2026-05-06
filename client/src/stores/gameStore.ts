import { create } from 'zustand';
import { DecorModel, getTotalIncome, getTotalDecorIncome, getIslandLevel } from '../animals';
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
  placedDecors?: PlacedDecor[];
  incomePerSec: number;
}

interface GameStore {
  lobbyCode: string | null;
  lobbyName: string | null;
  myId: string | null;
  players: Record<string, PlayerState>;
  visitingIslandId: string | null;
  shopOpen: boolean;

  coins: number;
  ownedAnimals: string[];
  islandLevel: number;
  placedDecors: PlacedDecor[];
  lastTickTime: number;
  incomePerSec: number;

  setLobby: (code: string, name: string | null, myId: string, players: Record<string, PlayerState>) => void;
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
  upgradeIsland: () => boolean;
  resetIsland: () => void;
  setShopOpen: (open: boolean) => void;
}

const SAVE_KEY = 'focusisland-v3';

function loadSaved() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function save(coins: number, ownedAnimals: string[], islandLevel: number, placedDecors: PlacedDecor[] = []) {
  localStorage.setItem(SAVE_KEY, JSON.stringify({ coins, ownedAnimals, islandLevel, placedDecors }));
}

function randomDecorPosition(decorId: DecorModel, scale: number): PlacedDecor {
  const angle = Math.random() * Math.PI * 2;
  const r = 1.6 + Math.random() * 0.8;
  return { id: decorId, x: Math.cos(angle) * r, z: Math.sin(angle) * r, rotY: Math.random() * Math.PI * 2, scale };
}

const saved = loadSaved();

export const useGameStore = create<GameStore>((set, get) => ({
  lobbyCode: null,
  lobbyName: null,
  myId: null,
  players: {},
  visitingIslandId: null,
  shopOpen: false,

  coins: saved.coins ?? 0,
  ownedAnimals: saved.ownedAnimals ?? ['bunny'],
  islandLevel: saved.islandLevel ?? 1,
  placedDecors: saved.placedDecors ?? [],
  lastTickTime: Date.now(),
  incomePerSec: getTotalIncome(saved.ownedAnimals ?? ['bunny']) + getTotalDecorIncome((saved.placedDecors ?? []).map((d: PlacedDecor) => d.id)),

  setLobby: (code, name, myId, players) => set({ lobbyCode: code, lobbyName: name, myId, players }),
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
          [id]: { ...p, totalWorkSeconds: liveTotal, unlockedAnimals: liveUnlocked, ...(incomePerSec !== undefined ? { incomePerSec } : {}) },
        },
      };
    }),
  visitIsland: (id) => set({ visitingIslandId: id }),

  tickCoins: () => {
    const { lastTickTime, ownedAnimals, coins, islandLevel, placedDecors, players, myId } = get();
    const me = myId ? players[myId] : null;
    if (!me?.isFocusing) {
      set({ lastTickTime: Date.now() });
      return;
    }
    const dt = (Date.now() - lastTickTime) / 1000;
    const income = getTotalIncome(ownedAnimals) + getTotalDecorIncome(placedDecors.map((d) => d.id));
    const next = coins + income * dt;
    set({ coins: next, lastTickTime: Date.now(), incomePerSec: income });
    save(next, ownedAnimals, islandLevel, placedDecors);
  },

  buyAnimal: (animalId, cost) => {
    const { coins, ownedAnimals, islandLevel, placedDecors } = get();
    if (coins < cost) return false;
    const nextCoins = coins - cost;
    const next = [...ownedAnimals, animalId];
    const income = getTotalIncome(next) + getTotalDecorIncome(placedDecors.map((d) => d.id));
    set({ coins: nextCoins, ownedAnimals: next, incomePerSec: income });
    save(nextCoins, next, islandLevel, placedDecors);
    socket.emit('sync_state', { ownedAnimals: next, islandLevel, placedDecors });
    return true;
  },

  removeAnimal: (index) => {
    const { ownedAnimals, islandLevel, placedDecors } = get();
    const next = ownedAnimals.filter((_, i) => i !== index);
    const income = getTotalIncome(next) + getTotalDecorIncome(placedDecors.map((d) => d.id));
    set({ ownedAnimals: next, incomePerSec: income });
    save(get().coins, next, islandLevel, placedDecors);
    socket.emit('sync_state', { ownedAnimals: next, islandLevel, placedDecors });
  },

  buyDecor: (decorId, cost, scale) => {
    const { coins, ownedAnimals, islandLevel, placedDecors } = get();
    const { decorCapacity } = getIslandLevel(islandLevel);
    if (coins < cost || placedDecors.length >= decorCapacity) return false;
    const nextCoins = coins - cost;
    const newDecor = randomDecorPosition(decorId, scale);
    const next = [...placedDecors, newDecor];
    const income = getTotalIncome(ownedAnimals) + getTotalDecorIncome(next.map((d) => d.id));
    set({ coins: nextCoins, placedDecors: next, incomePerSec: income });
    save(nextCoins, ownedAnimals, islandLevel, next);
    socket.emit('sync_state', { ownedAnimals, islandLevel, placedDecors: next });
    return true;
  },

  removeDecor: (index) => {
    const { ownedAnimals, islandLevel, placedDecors } = get();
    const next = placedDecors.filter((_, i) => i !== index);
    const income = getTotalIncome(ownedAnimals) + getTotalDecorIncome(next.map((d) => d.id));
    set({ placedDecors: next, incomePerSec: income });
    save(get().coins, ownedAnimals, islandLevel, next);
    socket.emit('sync_state', { ownedAnimals, islandLevel, placedDecors: next });
  },

  upgradeIsland: () => {
    const { coins, ownedAnimals, islandLevel, placedDecors } = get();
    const { upgradeCost } = getIslandLevel(islandLevel);
    if (!upgradeCost || coins < upgradeCost) return false;
    const nextCoins = coins - upgradeCost;
    const nextLevel = islandLevel + 1;
    set({ coins: nextCoins, islandLevel: nextLevel });
    save(nextCoins, ownedAnimals, nextLevel, placedDecors);
    socket.emit('sync_state', { ownedAnimals, islandLevel: nextLevel, placedDecors });
    return true;
  },

  resetIsland: () => {
    save(0, ['bunny'], 1, []);
    set({ coins: 0, ownedAnimals: ['bunny'], islandLevel: 1, placedDecors: [], incomePerSec: 0 });
    socket.emit('sync_state', { ownedAnimals: ['bunny'], islandLevel: 1, placedDecors: [] });
  },

  setShopOpen: (open) => set({ shopOpen: open }),
}));

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    const { myId, players } = useGameStore.getState();
    const me = myId ? players[myId] : null;
    if (me?.isFocusing) socket.emit('stop_focus');
  });
}
