import { useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { SHOP_ANIMALS } from '../animals';

export default function AnimalManager({ visible }: { visible: boolean }) {
  const { ownedAnimals, removeAnimal } = useGameStore();
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
      removeAnimal(dragging);
      setDisappearing(null);
    }, 500);
  }

  // Count occurrences to show owned count
  const counts: Record<string, number[]> = {};
  ownedAnimals.forEach((id, idx) => {
    if (!counts[id]) counts[id] = [];
    counts[id].push(idx);
  });

  return (
    <div className="animal-manager">
      <div className="animal-manager-title">🐾 Vos animaux</div>

      <div className="animal-list">
        {ownedAnimals.map((id, idx) => {
          const animal = SHOP_ANIMALS.find((a) => a.id === id);
          if (!animal) return null;
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
              <img src={`/previews/animals/animal-${id}.png`} alt={animal.name} className="animal-chip-img" />
              <span>{animal.name}</span>
            </div>
          );
        })}
      </div>

      {/* Black hole drop target */}
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
