import { useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { SHOP_ANIMALS, SHOP_DECORS, ISLAND_LEVELS, RARITY_COLORS, RARITY_LABELS, formatCoins, getIslandLevel } from '../animals';

type Tab = 'animals' | 'island' | 'decor';

export default function Shop() {
  const { coins, ownedAnimals, islandLevel, buyAnimal, upgradeIsland, buyDecor, placedDecors, setShopOpen, players, myId } = useGameStore();
  const [tab, setTab] = useState<Tab>('animals');
  const [shakeId, setShakeId] = useState<string | null>(null);

  function tryBuyAnimal(animalId: string, cost: number) {
    const ok = buyAnimal(animalId, cost);
    if (!ok) {
      setShakeId(animalId);
      setTimeout(() => setShakeId(null), 450);
    }
  }

  function tryUpgradeIsland(toLevel: number) {
    const ok = upgradeIsland(toLevel);
    if (!ok) {
      setShakeId(`island-${toLevel}`);
      setTimeout(() => setShakeId(null), 450);
    }
  }

  const me = myId ? players[myId] : null;

  // Live total focus seconds: committed + current session elapsed (using server timestamp)
  const committedSeconds = me?.totalWorkSeconds ?? 0;
  const sessionElapsed = me?.isFocusing && me?.focusStartedAt
    ? Math.floor((Date.now() - me.focusStartedAt) / 1000)
    : 0;
  const totalFocusSeconds = committedSeconds + sessionElapsed;

  const islandInfo = getIslandLevel(islandLevel);
  const atCapacity = ownedAnimals.length >= islandInfo.capacity;

  return (
    <div className="shop-overlay" onMouseDown={() => setShopOpen(false)}>
      <div className="shop-panel" onMouseDown={(e) => e.stopPropagation()}>

        {/* Close button — fixed top-right of panel */}
        <button className="shop-close" onMouseDown={(e) => { e.stopPropagation(); setShopOpen(false); }}>✕</button>

        {/* Header */}
        <div className="shop-header">
          <div className="shop-tabs">
            <button className={`shop-tab ${tab === 'animals' ? 'shop-tab--active' : ''}`} onClick={() => setTab('animals')}>
              🐾 Animaux
            </button>
            <button className={`shop-tab ${tab === 'island' ? 'shop-tab--active' : ''}`} onClick={() => setTab('island')}>
              🏝️ Île
            </button>
            <button className={`shop-tab ${tab === 'decor' ? 'shop-tab--active' : ''}`} onClick={() => setTab('decor')}>
              🌲 Décor
            </button>
          </div>
          <div className="shop-coins">🪙 {formatCoins(coins)}</div>
        </div>

        {/* Capacity bar */}
        <div className="shop-capacity-bar">
          <span>{islandInfo.label}</span>
          <span className={atCapacity ? 'cap-full' : ''}>
            🐾 {ownedAnimals.length} / {islandInfo.capacity}
            {atCapacity && ' — île pleine !'}
          </span>
          <span className="shop-focus-time">⏱ {fmtSec(totalFocusSeconds)} de focus</span>
        </div>

        {/* ANIMALS TAB */}
        {tab === 'animals' && (
          <div className="shop-grid">
            {SHOP_ANIMALS.map((animal) => {
              const owned = ownedAnimals.filter((id) => id === animal.id).length;
              const isUnlocked = totalFocusSeconds >= animal.unlockSeconds;
              const isLegendary = animal.rarity === 'legendary';
              const canAfford = coins >= animal.cost;
              const blocked = atCapacity;
              const previewSrc = `/previews/animals/animal-${animal.id}.png`;

              // What to show when locked:
              // - legendary: full mystery (??? + no image)
              // - others: show name + image with lock overlay
              const showMystery = !isUnlocked && isLegendary;

              return (
                <div
                  key={animal.id}
                  className={`shop-card ${!isUnlocked ? 'shop-card--locked' : ''} ${owned > 0 ? 'shop-card--owned' : ''}`}
                  style={{ '--rarity-color': RARITY_COLORS[animal.rarity] } as React.CSSProperties}
                >
                  <div className="shop-card-rarity-bar" style={{ background: RARITY_COLORS[animal.rarity] }} />

                  {/* Animal image */}
                  <div className="shop-card-img-wrap">
                    {showMystery ? (
                      <div className="shop-card-mystery">?</div>
                    ) : (
                      <>
                        <img src={previewSrc} alt={animal.name} className="shop-card-img" draggable={false} />
                        {!isUnlocked && <div className="shop-card-lock-overlay">🔒</div>}
                      </>
                    )}
                    {owned > 0 && <div className="shop-card-owned-badge">×{owned}</div>}
                  </div>

                  {/* Name */}
                  <div className="shop-card-name">{showMystery ? '???' : animal.name}</div>

                  {/* Rarity label */}
                  <div className="shop-card-rarity-label" style={{ color: RARITY_COLORS[animal.rarity] }}>
                    {RARITY_LABELS[animal.rarity]}
                  </div>

                  {/* Income — always show if not legendary mystery */}
                  {!showMystery && (
                    <div className="shop-card-income">+{formatCoins(animal.incomePerSec)}/s</div>
                  )}

                  {/* Action area */}
                  {!isUnlocked ? (
                    <div className="shop-card-lock-msg">
                      {showMystery ? '???' : `🔒 Focus encore ${fmtSec(animal.unlockSeconds - totalFocusSeconds)}`}
                    </div>
                  ) : blocked ? (
                    <div className="shop-card-lock-msg cap-full">Île pleine</div>
                  ) : (
                    <>
                      <button
                        className={`shop-btn-buy ${!canAfford ? 'shop-btn-buy--disabled' : ''} ${shakeId === animal.id ? 'shake' : ''}`}
                        onClick={() => tryBuyAnimal(animal.id, animal.cost)}
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
                  Capacité : {islandInfo.capacity} animaux · {islandInfo.gridN}×{islandInfo.gridN} blocs
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
                      <>
                        <button
                          className={`shop-btn-buy upgrade-btn ${!canAfford ? 'shop-btn-buy--disabled' : ''} ${shakeId === `island-${lvl.level}` ? 'shake' : ''}`}
                          onClick={() => tryUpgradeIsland(lvl.level)}
                        >
                          🪙 {formatCoins(prevLevel.upgradeCost)}
                        </button>
                        {!canAfford && shakeId === `island-${lvl.level}` && (
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
              <span className={placedDecors.length >= islandInfo.decorCapacity ? 'cap-full' : ''}>
                🌲 {placedDecors.length} / {islandInfo.decorCapacity}
                {placedDecors.length >= islandInfo.decorCapacity && ' — slots pleins !'}
              </span>
            </div>
            {SHOP_DECORS.map((decor) => {
              const isUnlocked = totalFocusSeconds >= decor.unlockSeconds;
              const canAfford = coins >= decor.cost;
              const slotsFull = placedDecors.length >= islandInfo.decorCapacity;
              const owned = placedDecors.filter((d) => d.id === decor.id).length;

              return (
                <div key={decor.id} className={`shop-card ${!isUnlocked ? 'shop-card--locked' : ''}`}>
                  <div className="shop-card-img-wrap">
                    <img src={`/previews/decors/${decor.id}.png`} alt={decor.name} className="shop-card-img" draggable={false} />
                    {!isUnlocked && <div className="shop-card-lock-overlay">🔒</div>}
                    {owned > 0 && <div className="shop-card-owned-badge">×{owned}</div>}
                  </div>
                  <div className="shop-card-name">{decor.name}</div>
                  <div className="shop-card-income">+{formatCoins(decor.incomePerSec)}/s</div>
                  {!isUnlocked ? (
                    <div className="shop-card-lock-msg">
                      🔒 Focus encore {fmtSec(decor.unlockSeconds - totalFocusSeconds)}
                    </div>
                  ) : slotsFull ? (
                    <div className="shop-card-lock-msg cap-full">Slots pleins</div>
                  ) : (
                    <>
                      <button
                        className={`shop-btn-buy ${!canAfford ? 'shop-btn-buy--disabled' : ''} ${shakeId === `decor-${decor.id}` ? 'shake' : ''}`}
                        onClick={() => {
                          const ok = buyDecor(decor.id, decor.cost, decor.scale);
                          if (!ok) {
                            setShakeId(`decor-${decor.id}`);
                            setTimeout(() => setShakeId(null), 450);
                          }
                        }}
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

function fmtSec(s: number): string {
  if (s <= 0) return '0s';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
