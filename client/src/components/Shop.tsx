import { useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { SHOP_ANIMALS, SHOP_DECORS, ISLAND_LEVELS, RARITY_COLORS, RARITY_LABELS, formatCoins, getIslandLevel } from '../animals';

type Tab = 'animals' | 'island' | 'decor';

export default function Shop() {
  const { coins, ownedAnimals, islandLevel, buyAnimal, upgradeIsland, buyDecor, placedDecors, setShopOpen } = useGameStore();
  const [tab, setTab] = useState<Tab>('animals');
  const [shakeId, setShakeId] = useState<string | null>(null);

  function tryBuy(id: string, fn: () => boolean) {
    const ok = fn();
    if (!ok) {
      setShakeId(id);
      setTimeout(() => setShakeId(null), 450);
    }
  }

  const islandInfo = getIslandLevel(islandLevel);
  const { capacity, decorCapacity } = islandInfo;
  const atCapacity = ownedAnimals.length >= capacity;

  return (
    <div className="shop-overlay" onMouseDown={() => setShopOpen(false)}>
      <div className="shop-panel" onMouseDown={(e) => e.stopPropagation()}>

        <button className="shop-close" onMouseDown={(e) => { e.stopPropagation(); setShopOpen(false); }}>✕</button>

        <div className="shop-header">
          <div className="shop-tabs">
            <button className={`shop-tab ${tab === 'animals' ? 'shop-tab--active' : ''}`} onClick={() => setTab('animals')}>🐾 Animaux</button>
            <button className={`shop-tab ${tab === 'island' ? 'shop-tab--active' : ''}`} onClick={() => setTab('island')}>🏝️ Île</button>
            <button className={`shop-tab ${tab === 'decor' ? 'shop-tab--active' : ''}`} onClick={() => setTab('decor')}>🌲 Décor</button>
          </div>
          <div className="shop-coins">🪙 {formatCoins(coins)}</div>
        </div>

        <div className="shop-capacity-bar">
          <span>{islandInfo.label}</span>
          <span className={atCapacity ? 'cap-full' : ''}>
            🐾 {ownedAnimals.length} / {capacity}
            {atCapacity && ' — île pleine !'}
          </span>
        </div>

        {/* ANIMALS TAB */}
        {tab === 'animals' && (
          <div className="shop-grid">
            {SHOP_ANIMALS.map((animal) => {
              const owned = ownedAnimals.includes(animal.id);
              const previewSrc = `/previews/animals/animal-${animal.id}.png`;
              const canAfford = coins >= animal.cost;

              return (
                <div
                  key={animal.id}
                  className={`shop-card ${owned ? 'shop-card--owned' : ''}`}
                  style={{ '--rarity-color': RARITY_COLORS[animal.rarity as keyof typeof RARITY_COLORS] ?? '#aaa' } as React.CSSProperties}
                >
                  <div className="shop-card-rarity-bar" style={{ background: RARITY_COLORS[animal.rarity as keyof typeof RARITY_COLORS] ?? '#aaa' }} />
                  <div className="shop-card-img-wrap">
                    <img src={previewSrc} alt={animal.name} className="shop-card-img" draggable={false} />
                    {owned && <div className="shop-card-owned-badge">✓</div>}
                  </div>
                  <div className="shop-card-name">{animal.name}</div>
                  <div className="shop-card-rarity-label" style={{ color: RARITY_COLORS[animal.rarity as keyof typeof RARITY_COLORS] ?? '#aaa' }}>
                    {RARITY_LABELS[animal.rarity as keyof typeof RARITY_LABELS] ?? animal.rarity}
                  </div>
                  <div className="shop-card-income">+{formatCoins(animal.incomePerSec)}/s</div>

                  {owned ? (
                    <div className="shop-card-lock-msg" style={{ color: '#55cc55' }}>✓ Possédé</div>
                  ) : atCapacity ? (
                    <div className="shop-card-lock-msg cap-full">Île pleine</div>
                  ) : (
                    <>
                      <button
                        className={`shop-btn-buy ${!canAfford ? 'shop-btn-buy--disabled' : ''} ${shakeId === animal.id ? 'shake' : ''}`}
                        onClick={() => tryBuy(animal.id, () => buyAnimal(animal.id, animal.cost))}
                      >
                        🪙 {formatCoins(animal.cost)}
                      </button>
                      {!canAfford && shakeId === animal.id && (
                        <div className="shop-card-error">Pas assez de coins</div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ISLAND TAB */}
        {tab === 'island' && (
          <div className="island-upgrades">
            <div className="island-current">
              <div className="island-current-icon">🏝️</div>
              <div>
                <div className="island-current-name">{islandInfo.label} — Niveau {islandLevel}</div>
                <div className="island-current-stats">
                  Capacité : {capacity} animaux · {islandInfo.gridN}×{islandInfo.gridN} blocs
                </div>
              </div>
            </div>

            <div className="upgrade-list">
              {ISLAND_LEVELS.filter((lvl) => lvl.level > 1).map((lvl) => {
                const isDone = lvl.level <= islandLevel;
                const isNext = lvl.level === islandLevel + 1;
                const prevLevel = getIslandLevel(lvl.level - 1);
                const addedSlots = lvl.capacity - prevLevel.capacity;
                const cost = prevLevel.upgradeCost ?? 0;
                const canAfford = coins >= cost;

                return (
                  <div key={lvl.level} className={`upgrade-card ${isDone ? 'upgrade-card--done' : ''} ${isNext ? 'upgrade-card--next' : ''}`}>
                    <div className="upgrade-level">Niv. {lvl.level}</div>
                    <div className="upgrade-name">{lvl.label}</div>
                    <div className="upgrade-stats">+{addedSlots} places · {lvl.gridN}×{lvl.gridN} blocs</div>
                    {isDone ? (
                      <div className="upgrade-done">✓ Débloqué</div>
                    ) : isNext ? (
                      <>
                        <button
                          className={`shop-btn-buy upgrade-btn ${!canAfford ? 'shop-btn-buy--disabled' : ''} ${shakeId === 'island' ? 'shake' : ''}`}
                          onClick={() => tryBuy('island', () => upgradeIsland())}
                        >
                          🪙 {formatCoins(cost)}
                        </button>
                        {!canAfford && shakeId === 'island' && (
                          <div className="shop-card-error">Pas assez de coins</div>
                        )}
                      </>
                    ) : (
                      <div className="upgrade-locked-msg">Après niv. {lvl.level - 1}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* DECOR TAB */}
        {tab === 'decor' && (
          <div className="shop-grid">
            <div className="shop-capacity-bar" style={{ gridColumn: '1 / -1' }}>
              <span>Décors</span>
              <span className={placedDecors.length >= decorCapacity ? 'cap-full' : ''}>
                🌲 {placedDecors.length} / {decorCapacity}
                {placedDecors.length >= decorCapacity && ' — slots pleins !'}
              </span>
            </div>
            {SHOP_DECORS.map((decor) => {
              const slotsFull = placedDecors.length >= decorCapacity;
              const canAfford = coins >= decor.cost;
              const owned = placedDecors.filter((d) => d.id === decor.id).length;

              return (
                <div key={decor.id} className="shop-card">
                  <div className="shop-card-img-wrap">
                    <img src={`/previews/decors/${decor.id}.png`} alt={decor.name} className="shop-card-img" draggable={false} />
                    {owned > 0 && <div className="shop-card-owned-badge">×{owned}</div>}
                  </div>
                  <div className="shop-card-name">{decor.name}</div>
                  <div className="shop-card-income">+{formatCoins(decor.incomePerSec)}/s</div>
                  {slotsFull ? (
                    <div className="shop-card-lock-msg cap-full">Slots pleins</div>
                  ) : (
                    <>
                      <button
                        className={`shop-btn-buy ${!canAfford ? 'shop-btn-buy--disabled' : ''} ${shakeId === `decor-${decor.id}` ? 'shake' : ''}`}
                        onClick={() => tryBuy(`decor-${decor.id}`, () => buyDecor(decor.id, decor.cost, decor.scale))}
                      >
                        🪙 {formatCoins(decor.cost)}
                      </button>
                      {!canAfford && shakeId === `decor-${decor.id}` && (
                        <div className="shop-card-error">Pas assez de coins</div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

