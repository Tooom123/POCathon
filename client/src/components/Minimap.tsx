import { useGameStore } from '../stores/gameStore';

// Mirrors getIslandPosition() in GameScene.tsx
function getIslandPosition(index: number, total: number): [number, number, number] {
  if (total === 1) return [0, 0, 0];
  const spacing = 28;
  const x = (index - (total - 1) / 2) * spacing;
  const z = (index % 2 === 0 ? 0 : -8) + Math.sin(index * 1.1) * 4;
  return [x, 0, z];
}

const SIZE = 160;       // px
const PADDING = 12;

export default function Minimap({ onIslandClick }: { onIslandClick?: (id: string, pos: [number, number, number]) => void }) {
  const { players, myId, visitingIslandId, visitIsland } = useGameStore();
  const list = Object.values(players);
  if (list.length === 0) return null;

  // Compute world bounds
  const positions = list.map((_, i) => getIslandPosition(i, list.length));
  const xs = positions.map(p => p[0]);
  const zs = positions.map(p => p[2]);
  const minX = Math.min(...xs) - 4;
  const maxX = Math.max(...xs) + 4;
  const minZ = Math.min(...zs) - 4;
  const maxZ = Math.max(...zs) + 4;
  const wW = maxX - minX || 1;
  const wH = maxZ - minZ || 1;

  // Square fit (preserve aspect by using max dim)
  const worldDim = Math.max(wW, wH);
  const inner = SIZE - PADDING * 2;

  function project(x: number, z: number): [number, number] {
    const cx = (x - (minX + maxX) / 2) / worldDim;
    const cz = (z - (minZ + maxZ) / 2) / worldDim;
    return [SIZE / 2 + cx * inner, SIZE / 2 + cz * inner];
  }

  return (
    <div className="minimap">
      <div className="minimap-title">CARTE</div>
      <svg width={SIZE} height={SIZE} className="minimap-svg">
        {list.map((p, i) => {
          const [wx, , wz] = positions[i];
          const [px, py] = project(wx, wz);
          const isMe = p.id === myId;
          const isVisited = visitingIslandId === p.id;
          const fill = p.isFocusing ? '#ff9944' : '#4aac58';
          return (
            <g key={p.id} style={{ cursor: 'pointer' }}
               onClick={() => {
                 const next = visitingIslandId === p.id ? null : p.id;
                 visitIsland(next);
                 if (onIslandClick) onIslandClick(p.id, positions[i]);
               }}>
              {isVisited && (
                <circle cx={px} cy={py} r={9} fill="none" stroke="#ffffff" strokeWidth={1.5} />
              )}
              <circle cx={px} cy={py} r={isMe ? 6 : 5} fill={fill}
                      stroke={isMe ? '#fff' : '#0d1117'} strokeWidth={isMe ? 2 : 1} />
              {p.isFocusing && (
                <circle cx={px} cy={py} r={9} fill="none" stroke={fill} strokeWidth={1} opacity={0.5}>
                  <animate attributeName="r" values="6;12;6" dur="1.5s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.6;0;0.6" dur="1.5s" repeatCount="indefinite" />
                </circle>
              )}
              <text x={px} y={py + 18} textAnchor="middle" fill="#9ab09a" fontSize="8" fontWeight="700">
                {p.name.slice(0, 8)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
