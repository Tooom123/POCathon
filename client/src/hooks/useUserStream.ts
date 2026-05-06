import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';

const BASE_URL = 'http://localhost:8000';

export function useUserStream() {
  const token = useAuthStore((s) => s.token);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const initFromProfile = useGameStore((s) => s.initFromProfile);

  useEffect(() => {
    if (!isAuthenticated || !token) return;

    const es = new EventSource(`${BASE_URL}/user/stream?token=${encodeURIComponent(token)}`);

    es.onmessage = (e) => {
      try {
        const profile = JSON.parse(e.data);
        initFromProfile(profile);
      } catch {
        // ignore malformed frames
      }
    };

    // EventSource reconnects automatically on network errors — no manual handling needed

    return () => es.close();
  }, [isAuthenticated, token]);
}
