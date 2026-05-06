import { create } from 'zustand';
import { DecorModel } from '../animals';
import socket from '../socket';
import { useAuthStore } from './authStore';
import { fetchProfile, apiBuyAnimal, apiBuyDecor, apiUpgradeIsland, UserProfile } from '../api/userApi';

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
  // Server-synced state
  coins: number;
  ownedAnimals: string[];
  islandLevel: number;
  productiveSeconds: number;
  incomePerSec: number;
  islandCapacity: number;
  islandDecorCapacity: number;
  islandUpgradeCost: number | null;

  // Local-only (positions)
  placedDecors: PlacedDecor[];

  // Multiplayer state (game server)
  lobbyCode: string | null;
  lobbyName: string | null;
  myId: string | null;
  players: Record<string, PlayerState>;
  visitingIslandId: string | null;
  shopOpen: boolean;

  // Actions
  initFromProfile: (profile: UserProfile) => void;
  setLobby: (code: string, name: string | null, myId: string, players: Record<string, PlayerState>) => void;
  addPlayer: (player: PlayerState) => void;
  removePlayer: (id: string) => void;
  updatePlayer: (player: PlayerState) => void;
  updatePlayerTick: (id: string, liveTotal: number, liveUnlocked: number, incomePerSec?: number) => void;
  visitIsland: (id: string | null) => void;

  buyAnimal: (animalId: string) => Promise<boolean>;
  removeAnimal: (index: number) => void;
  buyDecor: (decorId: DecorModel, scale: number) => Promise<boolean>;
  removeDecor: (index: number) => void;
  upgradeIsland: () => Promise<boolean>;
  setShopOpen: (open: boolean) => void;
  resetIsland: () => void;
  refreshProfile: () => Promise<void>;
}

// Only positions are stored locally — ownership comes from server.
const POSITIONS_KEY = 'focusisland-decor-positions';

function loadPositions(): PlacedDecor[] {
  try {
    const raw = localStorage.getItem(POSITIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePositions(decors: PlacedDecor[]) {
  localStorage.setItem(POSITIONS_KEY, JSON.stringify(decors));
}

function randomDecorPosition(decorId: DecorModel, scale: number): PlacedDecor {
  const angle = Math.random() * Math.PI * 2;
  const r = 1.6 + Math.random() * 0.8;
  return { id: decorId, x: Math.cos(angle) * r, z: Math.sin(angle) * r, rotY: Math.random() * Math.PI * 2, scale };
}

// Reconcile local positions with server ownership counts.
// Keeps existing positions when possible; adds random positions for new items.
function reconcileDecors(serverDecors: string[], localDecors: PlacedDecor[]): PlacedDecor[] {
  const serverCounts: Record<string, number> = {};
  for (const id of serverDecors) serverCounts[id] = (serverCounts[id] ?? 0) + 1;

  const localByType: Record<string, PlacedDecor[]> = {};
  for (const d of localDecors) (localByType[d.id] ??= []).push(d);

  const result: PlacedDecor[] = [];
  for (const [id, count] of Object.entries(serverCounts)) {
    const existing = localByType[id] ?? [];
    for (let i = 0; i < count; i++) {
      result.push(i < existing.length ? existing[i] : randomDecorPosition(id as DecorModel, 1));
    }
  }
  return result;
}

async function _refetchAndApply(get: () => GameStore) {
  const token = useAuthStore.getState().token;
  if (!token) return;
  const profile = await fetchProfile(token);
  get().initFromProfile(profile);
}

export const useGameStore = create<GameStore>((set, get) => ({
  coins: 0,
  ownedAnimals: [],
  islandLevel: 1,
  productiveSeconds: 0,
  incomePerSec: 0,
  islandCapacity: 1,
  islandDecorCapacity: 0,
  islandUpgradeCost: null,

  placedDecors: loadPositions(),

  lobbyCode: null,
  lobbyName: null,
  myId: null,
  players: {},
  visitingIslandId: null,
  shopOpen: false,

  initFromProfile: (profile) => {
    const localDecors = get().placedDecors;
    const reconciledDecors = reconcileDecors(profile.decors, localDecors);
    savePositions(reconciledDecors);
    set({
      coins: profile.balance,
      ownedAnimals: profile.pets,
      islandLevel: profile.island_level,
      productiveSeconds: profile.productive_seconds,
      incomePerSec: profile.income_per_sec,
      islandCapacity: profile.island_capacity,
      islandDecorCapacity: profile.island_decor_capacity,
      islandUpgradeCost: profile.island_upgrade_cost,
      placedDecors: reconciledDecors,
    });
    // Keep game server in sync
    const { myId, players, lobbyCode } = get();
    if (lobbyCode && myId && players[myId]) {
      socket.emit('sync_state', {
        ownedAnimals: profile.pets,
        islandLevel: profile.island_level,
        placedDecors: reconciledDecors,
      });
    }
  },

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

  buyAnimal: async (animalId) => {
    const token = useAuthStore.getState().token;
    if (!token) return false;
    try {
      await apiBuyAnimal(token, animalId);
      await _refetchAndApply(get);
      return true;
    } catch {
      return false;
    }
  },

  removeAnimal: (index) => {
    const { ownedAnimals, islandLevel, placedDecors } = get();
    const next = ownedAnimals.filter((_, i) => i !== index);
    set({ ownedAnimals: next });
    socket.emit('sync_state', { ownedAnimals: next, islandLevel, placedDecors });
  },

  buyDecor: async (decorId, scale) => {
    const token = useAuthStore.getState().token;
    if (!token) return false;
    try {
      await apiBuyDecor(token, decorId);
      // Add position locally before refetch for immediate visual feedback
      const newDecor = randomDecorPosition(decorId, scale);
      const { placedDecors, ownedAnimals, islandLevel } = get();
      const nextDecors = [...placedDecors, newDecor];
      savePositions(nextDecors);
      set({ placedDecors: nextDecors });
      socket.emit('sync_state', { ownedAnimals, islandLevel, placedDecors: nextDecors });
      // Then sync coins/state from server
      await _refetchAndApply(get);
      return true;
    } catch {
      return false;
    }
  },

  removeDecor: (index) => {
    const { ownedAnimals, islandLevel, placedDecors } = get();
    const next = placedDecors.filter((_, i) => i !== index);
    savePositions(next);
    set({ placedDecors: next });
    socket.emit('sync_state', { ownedAnimals, islandLevel, placedDecors: next });
  },

  upgradeIsland: async () => {
    const token = useAuthStore.getState().token;
    if (!token) return false;
    try {
      await apiUpgradeIsland(token);
      await _refetchAndApply(get);
      return true;
    } catch {
      return false;
    }
  },

  resetIsland: () => {
    savePositions([]);
    set({ coins: 0, ownedAnimals: ['bunny'], islandLevel: 1, placedDecors: [] });
    socket.emit('sync_state', { ownedAnimals: ['bunny'], islandLevel: 1, placedDecors: [] });
  },

  setShopOpen: (open) => set({ shopOpen: open }),

  refreshProfile: async () => {
    await _refetchAndApply(get);
  },
}));

// Commit focus session on page close
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    const { myId, players } = useGameStore.getState();
    const me = myId ? players[myId] : null;
    if (me?.isFocusing) socket.emit('stop_focus');
  });
}
