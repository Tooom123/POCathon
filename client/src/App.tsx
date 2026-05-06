import { useEffect, useState } from 'react';
import { useGameStore } from './stores/gameStore';
import { useAuthStore } from './stores/authStore';
import { useSocket } from './hooks/useSocket';
import { useUserStream } from './hooks/useUserStream';
import Lobby from './components/Lobby';
import GameScene from './components/GameScene';
import PairingScreen from './components/PairingScreen';
import { fetchProfile } from './api/userApi';

export default function App() {
  useSocket();
  useUserStream();
  const lobbyCode = useGameStore((s) => s.lobbyCode);
  const initFromProfile = useGameStore((s) => s.initFromProfile);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const token = useAuthStore((s) => s.token);
  const tryRefreshIfNeeded = useAuthStore((s) => s.tryRefreshIfNeeded);
  const [profileLoaded, setProfileLoaded] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      setProfileLoaded(false);
      return;
    }
    tryRefreshIfNeeded();
    fetchProfile(token)
      .then((profile) => {
        initFromProfile(profile);
        setProfileLoaded(true);
      })
      .catch(() => {
        useAuthStore.getState().clearAuth();
      });
  }, [isAuthenticated, token]);

  if (!isAuthenticated) return <PairingScreen />;
  if (!profileLoaded) return <div className="lobby"><div className="lobby-card"><p className="lobby-sub">Chargement du profil...</p></div></div>;
  return lobbyCode ? <GameScene /> : <Lobby />;
}
