import { useEffect, useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { formatCoins } from '../animals';

function formatTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export default function Leaderboard() {
  const { players } = useGameStore();
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const { myId } = useGameStore();

  const entries = Object.values(players).map(p => {
    const sessionElapsed = p.isFocusing && p.focusStartedAt
      ? Math.floor((Date.now() - p.focusStartedAt) / 1000)
      : 0;
    const liveSeconds = p.totalWorkSeconds + sessionElapsed;
    return { ...p, liveSeconds };
  });

  entries.sort((a, b) => b.incomePerSec - a.incomePerSec || b.liveSeconds - a.liveSeconds);

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="leaderboard">
      <div className="leaderboard-title">🏆 Classement</div>
      <div className="leaderboard-list">
        {entries.map((p, i) => (
          <div
            key={p.id}
            className={`leaderboard-row ${p.id === myId ? 'leaderboard-row--me' : ''}`}
          >
            <span className="lb-rank">{medals[i] ?? `${i + 1}`}</span>
            <span className={`lb-online-dot ${p.isFocusing ? 'lb-online-dot--focus' : 'lb-online-dot--idle'}`} />
            <span className="lb-name">{p.name}</span>
            <div className="lb-stats">
              <span className="lb-income">
                🪙 {formatCoins(p.incomePerSec)}/s
              </span>
              <span className="lb-time">{formatTime(p.liveSeconds)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
