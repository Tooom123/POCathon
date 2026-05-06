import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { formatCoins, getTotalIncome, getIslandLevel } from '../animals';
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
  const { myId, players, lobbyCode, coins, ownedAnimals, islandLevel, setShopOpen, shopOpen, tickCoins } = useGameStore();
  const me = myId ? players[myId] : null;

  const sessionStart = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Passive income every 250ms
  useEffect(() => {
    const id = setInterval(tickCoins, 250);
    return () => clearInterval(id);
  }, []);

  // Live focus timer — starts at click, no server round-trip wait
  useEffect(() => {
    if (!me?.isFocusing) {
      setElapsed(0);
      return;
    }
    if (!sessionStart.current) sessionStart.current = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - sessionStart.current!) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [me?.isFocusing]);

  function toggleFocus() {
    if (!me) return;
    if (me.isFocusing) {
      socket.emit('stop_focus');
      sessionStart.current = null;
      setElapsed(0);
    } else {
      sessionStart.current = Date.now();
      setElapsed(0);
      socket.emit('start_focus');
    }
  }

  if (!me) return null;

  const totalDisplay = me.totalWorkSeconds + elapsed;
  const focusingCount = Object.values(players).filter((p) => p.isFocusing).length;
  const incomePerSec = getTotalIncome(ownedAnimals);
  const { capacity, label: islandLabel } = getIslandLevel(islandLevel);
  const atCapacity = ownedAnimals.length >= capacity;

  return (
    <div className="hud">
      {/* TOP BAR */}
      <div className="hud-top">
        <div className="hud-lobby-badge">
          <span className="hud-lobby-label">LOBBY</span>
          <span className="hud-lobby-code">{lobbyCode}</span>
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

        <button
          className={`focus-btn ${me.isFocusing ? 'focus-btn--stop' : 'focus-btn--start'}`}
          onClick={toggleFocus}
        >
          {me.isFocusing ? '⏹ Stop' : '▶ Focus'}
        </button>

        <button className="shop-btn" onClick={() => setShopOpen(!shopOpen)}>
          🐾 Shop
        </button>

        <div className={`hud-capacity ${atCapacity ? 'hud-capacity--full' : ''}`}>
          <span className="hud-stat-label">{islandLabel}</span>
          <span>{ownedAnimals.length}/{capacity} 🐾</span>
        </div>
      </div>
    </div>
  );
}
