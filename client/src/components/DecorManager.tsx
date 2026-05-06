import { useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { SHOP_DECORS } from '../animals';

export default function DecorManager({ visible }: { visible: boolean }) {
  const { placedDecors, removeDecor } = useGameStore();
  if (!visible) return null;
  const [dragging, setDragging] = useState<number | null>(null);
  const [hoveringHole, setHoveringHole] = useState(false);
  const [disappearing, setDisappearing] = useState<number | null>(null);

  function onDragStart(index: number) {
    setDragging(index);
  }

  function onDragEnd() {
    setDragging(null);
    setHoveringHole(false);
  }

  function onDropToHole() {
    if (dragging === null) return;
    setDisappearing(dragging);
    setDragging(null);
    setHoveringHole(false);
    setTimeout(() => {
      removeDecor(dragging);
      setDisappearing(null);
    }, 500);
  }

  if (placedDecors.length === 0) return null;

  return (
    <div className="animal-manager animal-manager--decors">
      <div className="animal-manager-title">🌿 Décors placés</div>

      <div className="animal-list">
        {placedDecors.map((d, idx) => {
          const decor = SHOP_DECORS.find((x) => x.id === d.id);
          if (!decor) return null;
          const isDragging = dragging === idx;
          const isDisappearing = disappearing === idx;
          return (
            <div
              key={idx}
              className={`animal-chip ${isDragging ? 'animal-chip--dragging' : ''} ${isDisappearing ? 'animal-chip--disappearing' : ''}`}
              draggable
              onDragStart={() => onDragStart(idx)}
              onDragEnd={onDragEnd}
            >
              <img src={`/previews/decors/${d.id}.png`} alt={decor.name} className="animal-chip-img" />
              <span>{decor.name}</span>
            </div>
          );
        })}
      </div>

      <div
        className={`black-hole ${dragging !== null ? 'black-hole--active' : ''} ${hoveringHole ? 'black-hole--hover' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setHoveringHole(true); }}
        onDragLeave={() => setHoveringHole(false)}
        onDrop={onDropToHole}
      >
        <div className="black-hole-ring" />
        <div className="black-hole-core">🕳️</div>
        <div className="black-hole-label">{hoveringHole ? 'Relâcher !' : 'Supprimer'}</div>
      </div>
    </div>
  );
}
