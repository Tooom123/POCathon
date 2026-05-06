import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { formatCoins, getIslandLevel } from '../animals';
import socket from '../socket';

function formatTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export default function HUD() {
  const { myId, players, lobbyCode, lobbyName, coins, ownedAnimals, islandLevel, incomePerSec, setShopOpen, shopOpen, resetIsland } = useGameStore();
  const me = myId ? players[myId] : null;

  const sessionStartMs = useRef<number | null>(null);
  const sessionStartISO = useRef<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const [muted, setMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Init audio once
  useEffect(() => {
    const audio = new Audio('/sounds/focus-music.wav');
    audio.loop = true;
    audio.volume = 0;
    audioRef.current = audio;
    return () => { audio.pause(); };
  }, []);

  // Fade in/out on focus toggle
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (me?.isFocusing && !muted) {
      audio.play().catch(() => {});
      fadeTo(audio, 0.75, 2000);
    } else {
      fadeTo(audio, 0, 1500, () => audio.pause());
    }
  }, [me?.isFocusing, muted]);

  function toggleMute() {
    const audio = audioRef.current;
    if (!audio) return;
    const next = !muted;
    setMuted(next);
    if (next) {
      fadeTo(audio, 0, 800, () => audio.pause());
    } else if (me?.isFocusing) {
      audio.play().catch(() => {});
      fadeTo(audio, 0.75, 800);
    }
  }


  // Live focus timer
  useEffect(() => {
    if (!me?.isFocusing) {
      setElapsed(0);
      return;
    }
    if (!sessionStartMs.current) {
      sessionStartMs.current = Date.now();
      sessionStartISO.current = new Date().toISOString();
    }
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - sessionStartMs.current!) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [me?.isFocusing]);

  // Auto-focus: start when tab is visible and focused, stop when hidden or blurred
  useEffect(() => {
    if (!me) return;

    function startFocus() {
      if (me!.isFocusing) return;
      sessionStartMs.current = Date.now();
      sessionStartISO.current = new Date().toISOString();
      setElapsed(0);
      socket.emit('start_focus');
    }

    function stopFocus() {
      if (!me!.isFocusing) return;
      socket.emit('stop_focus');
      sessionStartMs.current = null;
      sessionStartISO.current = null;
      setElapsed(0);
    }

    function handleVisibility() {
      if (document.visibilityState === 'visible') startFocus();
      else stopFocus();
    }

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', stopFocus);
    window.addEventListener('focus', startFocus);

    // Start immediately if tab is already visible
    if (document.visibilityState === 'visible') startFocus();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', stopFocus);
      window.removeEventListener('focus', startFocus);
    };
  }, [!!me]);

  if (!me) return null;

  const totalDisplay = me.totalWorkSeconds + elapsed;
  const focusingCount = Object.values(players).filter((p) => p.isFocusing).length;
  const { capacity, label: islandLabel } = getIslandLevel(islandLevel);
  const atCapacity = ownedAnimals.length >= capacity;

  return (
    <div className="hud">
      {/* TOP BAR */}
      <div className="hud-top">
        <div className="hud-lobby-badge">
          {lobbyName
            ? <span className="hud-lobby-name">{lobbyName}</span>
            : <><span className="hud-lobby-label">LOBBY</span><span className="hud-lobby-code">{lobbyCode}</span></>
          }
          <CopyCodeBtn code={lobbyCode} />
        </div>
        {focusingCount > 0 && (
          <div className="hud-social-badge">🔥 {focusingCount} en focus</div>
        )}
        <div className="hud-coins-badge" onClick={() => setShopOpen(!shopOpen)} style={{ cursor: 'pointer' }}>
          <span>🪙</span>
          <span className="coin-amount">{formatCoins(coins)}</span>
          <span className="coin-rate">+{formatCoins(incomePerSec)}/s</span>
        </div>
      </div>

      {/* BOTTOM BAR */}
      <div className="hud-bottom">
        <div className="hud-stat">
          <span className="hud-stat-label">TOTAL</span>
          <span className="hud-stat-value">{formatTime(totalDisplay)}</span>
        </div>

        {me.isFocusing && (
          <div className="hud-stat">
            <span className="hud-stat-label">SESSION</span>
            <span className="hud-stat-value hud-timer-active">{formatTime(elapsed)}</span>
          </div>
        )}

        <div className={`focus-indicator ${me.isFocusing ? 'focus-indicator--on' : 'focus-indicator--off'}`}>
          {me.isFocusing ? '🟢 Focus' : '⚫ Inactif'}
        </div>

        <button className="shop-btn" onClick={() => setShopOpen(!shopOpen)}>
          🐾 Shop
        </button>

        <button className="mute-btn" onClick={toggleMute} title={muted ? 'Activer la musique' : 'Couper la musique'}>
          {muted ? '🔇' : '🎵'}
        </button>

        <button
          className="reset-btn"
          onClick={() => { if (confirm('Réinitialiser l\'île et tous les animaux ?')) resetIsland(); }}
        >
          🔄 Reset
        </button>

        <div className={`hud-capacity ${atCapacity ? 'hud-capacity--full' : ''}`}>
          <span className="hud-stat-label">{islandLabel}</span>
          <span>{ownedAnimals.length}/{capacity} 🐾</span>
        </div>
      </div>
    </div>
  );
}

function fadeTo(audio: HTMLAudioElement, target: number, ms: number, onDone?: () => void) {
  const steps = 20;
  const interval = ms / steps;
  const delta = (target - audio.volume) / steps;
  let i = 0;
  const id = setInterval(() => {
    i++;
    audio.volume = Math.min(1, Math.max(0, audio.volume + delta));
    if (i >= steps) {
      clearInterval(id);
      audio.volume = target;
      onDone?.();
    }
  }, interval);
}

function CopyCodeBtn({ code }: { code: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!code) return null;

  function handleCopy() {
    navigator.clipboard.writeText(code!);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button className="hud-copy-btn" onClick={handleCopy} title="Copier le code du lobby">
      {copied ? '✓' : '⎘'}
    </button>
  );
}
