import { create } from 'zustand';
import { getTotalIncome, getIslandLevel } from '../animals';

export interface PlayerState {
  id: string;
  name: string;
  totalWorkSeconds: number;
  isFocusing: boolean;
  focusStartedAt: number | null;
  unlockedAnimals: number;
  islandIndex: number;
}

interface GameStore {
  lobbyCode: string | null;
  myId: string | null;
  players: Record<string, PlayerState>;
  visitingIslandId: string | null;

  coins: number;
  ownedAnimals: string[];
  islandLevel: number;
  lastTickTime: number;

  shopOpen: boolean;

  setLobby: (code: string, myId: string, players: Record<string, PlayerState>) => void;
  addPlayer: (player: PlayerState) => void;
  removePlayer: (id: string) => void;
  updatePlayer: (player: PlayerState) => void;
  updatePlayerTick: (id: string, liveTotal: number, liveUnlocked: number) => void;
  visitIsland: (id: string | null) => void;

  tickCoins: () => void;
  buyAnimal: (animalId: string, cost: number) => boolean;
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

function save(coins: number, ownedAnimals: string[], islandLevel: number) {
  localStorage.setItem(SAVE_KEY, JSON.stringify({ coins, ownedAnimals, islandLevel }));
}

const saved = loadSaved();

export const useGameStore = create<GameStore>((set, get) => ({
  lobbyCode: null,
  myId: null,
  players: {},
  visitingIslandId: null,
  shopOpen: false,

  // Start with 1 bunny so the player can immediately earn coins
  coins: saved.coins ?? 0,
  ownedAnimals: saved.ownedAnimals ?? ['bunny'],
  islandLevel: saved.islandLevel ?? 1,
  lastTickTime: Date.now(),

  setLobby: (code, myId, players) => set({ lobbyCode: code, myId, players }),
  addPlayer: (player) => set((s) => ({ players: { ...s.players, [player.id]: player } })),
  removePlayer: (id) => set((s) => { const { [id]: _, ...rest } = s.players; return { players: rest }; }),
  updatePlayer: (player) => set((s) => ({ players: { ...s.players, [player.id]: player } })),
  updatePlayerTick: (id, liveTotal, liveUnlocked) =>
    set((s) => {
      const p = s.players[id];
      if (!p) return {};
      return { players: { ...s.players, [id]: { ...p, totalWorkSeconds: liveTotal, unlockedAnimals: liveUnlocked } } };
    }),
  visitIsland: (id) => set({ visitingIslandId: id }),

  tickCoins: () => {
    const { lastTickTime, ownedAnimals, coins, islandLevel, players, myId } = get();
    const now = Date.now();
    const me = myId ? players[myId] : null;
    // Income only accumulates during an active focus session
    if (!me?.isFocusing) {
      set({ lastTickTime: now }); // reset to avoid burst when focus starts
      return;
    }
    const dt = Math.min((now - lastTickTime) / 1000, 5);
    const income = getTotalIncome(ownedAnimals);
    const next = coins + income * dt;
    set({ coins: next, lastTickTime: now });
    save(next, ownedAnimals, islandLevel);
  },

  buyAnimal: (animalId, cost) => {
    const { coins, ownedAnimals, islandLevel } = get();
    const { capacity } = getIslandLevel(islandLevel);
    if (coins < cost || ownedAnimals.length >= capacity) return false;
    const nextAnimals = [...ownedAnimals, animalId];
    const nextCoins = coins - cost;
    set({ coins: nextCoins, ownedAnimals: nextAnimals });
    save(nextCoins, nextAnimals, islandLevel);
    return true;
  },

  upgradeIsland: (toLevel) => {
    const { coins, ownedAnimals, islandLevel } = get();
    const current = getIslandLevel(islandLevel);
    if (toLevel !== islandLevel + 1 || coins < current.upgradeCost) return false;
    const nextCoins = coins - current.upgradeCost;
    set({ coins: nextCoins, islandLevel: toLevel });
    save(nextCoins, ownedAnimals, toLevel);
    return true;
  },

  setShopOpen: (open) => set({ shopOpen: open }),
}));
