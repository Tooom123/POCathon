import { create } from 'zustand';
import { refreshToken } from '../api/trackerApi';

const TOKEN_KEY = 'tracker_token';
const USER_ID_KEY = 'tracker_user_id';
const EXPIRES_KEY = 'tracker_expires_at';

export interface AuthState {
  token: string | null;
  userId: string | null;
  expiresAt: string | null;
  isAuthenticated: boolean;

  setAuth: (token: string, userId: string, expiresAt: string) => void;
  clearAuth: () => void;
  tryRefreshIfNeeded: () => Promise<void>;
}

function loadFromStorage() {
  const token = localStorage.getItem(TOKEN_KEY);
  const userId = localStorage.getItem(USER_ID_KEY);
  const expiresAt = localStorage.getItem(EXPIRES_KEY);
  const valid = !!(token && expiresAt && new Date(expiresAt) > new Date());
  return { token: valid ? token : null, userId: valid ? userId : null, expiresAt: valid ? expiresAt : null };
}

const stored = loadFromStorage();

export const useAuthStore = create<AuthState>((set, get) => ({
  token: stored.token,
  userId: stored.userId,
  expiresAt: stored.expiresAt,
  isAuthenticated: stored.token !== null,

  setAuth: (token, userId, expiresAt) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_ID_KEY, userId);
    localStorage.setItem(EXPIRES_KEY, expiresAt);
    set({ token, userId, expiresAt, isAuthenticated: true });
  },

  clearAuth: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_ID_KEY);
    localStorage.removeItem(EXPIRES_KEY);
    set({ token: null, userId: null, expiresAt: null, isAuthenticated: false });
  },

  tryRefreshIfNeeded: async () => {
    const { token, expiresAt, setAuth, clearAuth } = get();
    if (!token || !expiresAt) return;
    const hoursLeft = (new Date(expiresAt).getTime() - Date.now()) / 3_600_000;
    if (hoursLeft >= 24) return;
    try {
      const data = await refreshToken(token);
      setAuth(data.token, data.user_id!, data.expires_at);
    } catch {
      clearAuth();
    }
  },
}));
