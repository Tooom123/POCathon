import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';
import { fetchProfile } from '../api/userApi';

const POLL_INTERVAL_MS = 15_000;

export function useProfileSync() {
  const token = useAuthStore((s) => s.token);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const initFromProfile = useGameStore((s) => s.initFromProfile);

  useEffect(() => {
    if (!isAuthenticated || !token) return;

    const poll = async () => {
      try {
        const profile = await fetchProfile(token);
        initFromProfile(profile);
      } catch {
        // Silent — next poll will retry
      }
    };

    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isAuthenticated, token]);
}
