import { useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { SHOP_ANIMALS, ISLAND_LEVELS, RARITY_COLORS, RARITY_LABELS, formatCoins, getIslandLevel } from '../animals';

type Tab = 'animals' | 'island';

export default function Shop() {
  const { coins, ownedAnimals, islandLevel, buyAnimal, upgradeIsland, setShopOpen, players, myId } = useGameStore();
  const [tab, setTab] = useState<Tab>('animals');

  const me = myId ? players[myId] : null;
  const totalSeconds = me?.totalWorkSeconds ?? 0;
  const islandInfo = getIslandLevel(islandLevel);
  const atCapacity = ownedAnimals.length >= islandInfo.capacity;

  return (
    <div className="shop-overlay" onMouseDown={() => setShopOpen(false)}>
      <div className="shop-panel" onMouseDown={(e) => e.stopPropagation()}>

        <div className="shop-header">
          <div className="shop-tabs">
            <button className={`shop-tab ${tab === 'animals' ? 'shop-tab--active' : ''}`} onClick={() => setTab('animals')}>
              🐾 Animaux
            </button>
            <button className={`shop-tab ${tab === 'island' ? 'shop-tab--active' : ''}`} onClick={() => setTab('island')}>
              🏝️ Île
            </button>
          </div>
          <div className="shop-coins">🪙 {formatCoins(coins)}</div>
          <button className="shop-close" onMouseDown={(e) => { e.stopPropagation(); setShopOpen(false); }}>✕</button>
        </div>

        <div className="shop-capacity-bar">
          <span>{islandInfo.label}</span>
          <span className={atCapacity ? 'cap-full' : ''}>
            🐾 {ownedAnimals.length} / {islandInfo.capacity}
            {atCapacity && ' — île pleine ! Agrandissez →'}
          </span>
        </div>

        {/* ANIMALS TAB */}
        {tab === 'animals' && (
          <div className="shop-grid">
            {SHOP_ANIMALS.map((animal) => {
              const owned = ownedAnimals.filter((id) => id === animal.id).length;
              const isUnlocked = totalSeconds >= animal.unlockSeconds;
              const canAfford = coins >= animal.cost;
              const blocked = atCapacity;
              const previewSrc = `/previews/animals/animal-${animal.id}.png`;

              return (
                <div
                  key={animal.id}
                  className={`shop-card ${!isUnlocked ? 'shop-card--locked' : ''} ${owned > 0 ? 'shop-card--owned' : ''}`}
                  style={{ '--rarity-color': RARITY_COLORS[animal.rarity] } as React.CSSProperties}
                >
                  <div className="shop-card-rarity-bar" style={{ background: RARITY_COLORS[animal.rarity] }} />

                  {/* Animal preview image */}
                  <div className="shop-card-img-wrap">
                    {isUnlocked ? (
                      <img
                        src={previewSrc}
                        alt={animal.name}
                        className="shop-card-img"
                        draggable={false}
                      />
                    ) : (
                      <div className="shop-card-locked-img">🔒</div>
                    )}
                  </div>

                  <div className="shop-card-name">{isUnlocked ? animal.name : '???'}</div>
                  <div className="shop-card-rarity-label" style={{ color: RARITY_COLORS[animal.rarity] }}>
                    {RARITY_LABELS[animal.rarity]}
                  </div>
                  {isUnlocked && <div className="shop-card-income">+{formatCoins(animal.incomePerSec)}/s</div>}
                  {owned > 0 && <div className="shop-card-owned-badge">×{owned}</div>}

                  {!isUnlocked ? (
                    <div className="shop-card-lock-msg">Focus {fmtSec(animal.unlockSeconds - totalSeconds)} de plus</div>
                  ) : blocked ? (
                    <div className="shop-card-lock-msg cap-full">Île pleine</div>
                  ) : (
                    <button
                      className={`shop-btn-buy ${!canAfford ? 'shop-btn-buy--disabled' : ''}`}
                      onClick={() => buyAnimal(animal.id, animal.cost)}
                      disabled={!canAfford}
                    >
                      🪙 {formatCoins(animal.cost)}
                    </button>
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
                  Capacité : {islandInfo.capacity} animaux · Grille {islandInfo.gridN}×{islandInfo.gridN} blocs
                </div>
              </div>
            </div>

            <div className="upgrade-list">
              {ISLAND_LEVELS.filter((lvl) => lvl.level > 1).map((lvl) => {
                const isDone = lvl.level <= islandLevel;
                const isNext = lvl.level === islandLevel + 1;
                const prevLevel = getIslandLevel(lvl.level - 1);
                const addedSlots = lvl.capacity - prevLevel.capacity;
                const canAfford = coins >= prevLevel.upgradeCost;

                return (
                  <div key={lvl.level} className={`upgrade-card ${isDone ? 'upgrade-card--done' : ''} ${isNext ? 'upgrade-card--next' : ''}`}>
                    <div className="upgrade-level">Niv. {lvl.level}</div>
                    <div className="upgrade-name">{lvl.label}</div>
                    <div className="upgrade-stats">+{addedSlots} places · {lvl.gridN}×{lvl.gridN} blocs</div>
                    {isDone ? (
                      <div className="upgrade-done">✓ Débloqué</div>
                    ) : isNext ? (
                      <button
                        className={`shop-btn-buy upgrade-btn ${!canAfford ? 'shop-btn-buy--disabled' : ''}`}
                        onClick={() => upgradeIsland(lvl.level)}
                        disabled={!canAfford}
                      >
                        🪙 {formatCoins(prevLevel.upgradeCost)}
                      </button>
                    ) : (
                      <div className="upgrade-locked-msg">Après niv. {lvl.level - 1}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function fmtSec(s: number): string {
  if (s <= 0) return '0s';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h${m}m`;
  return `${m}m`;
}
