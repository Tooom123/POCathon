import { useEffect, useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useAuthStore } from '../stores/authStore';
import { ISLAND_LEVELS, RARITY_COLORS, RARITY_LABELS, formatCoins, getIslandLevel, SHOP_DECORS } from '../animals';
import { fetchShopAnimals, fetchShopDecors, ShopAnimal, ShopDecor } from '../api/userApi';

type Tab = 'animals' | 'island' | 'decor';

export default function Shop() {
  const { coins, ownedAnimals, islandLevel, buyAnimal, upgradeIsland, buyDecor, placedDecors, setShopOpen, productiveSeconds, islandCapacity, islandDecorCapacity, islandUpgradeCost } = useGameStore();
  const token = useAuthStore((s) => s.token);
  const [tab, setTab] = useState<Tab>('animals');
  const [shakeId, setShakeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [serverAnimals, setServerAnimals] = useState<ShopAnimal[] | null>(null);
  const [serverDecors, setServerDecors] = useState<ShopDecor[] | null>(null);

  useEffect(() => {
    if (!token) return;
    fetchShopAnimals(token).then(setServerAnimals).catch(() => {});
    fetchShopDecors(token).then(setServerDecors).catch(() => {});
  }, [token]);

  async function tryBuyAnimal(animalId: string) {
    if (busy) return;
    setBusy(true);
    const ok = await buyAnimal(animalId);
    setBusy(false);
    if (ok && token) {
      fetchShopAnimals(token).then(setServerAnimals).catch(() => {});
      fetchShopDecors(token).then(setServerDecors).catch(() => {});
    } else if (!ok) {
      setShakeId(animalId);
      setTimeout(() => setShakeId(null), 450);
    }
  }

  async function tryUpgradeIsland() {
    if (busy) return;
    setBusy(true);
    const ok = await upgradeIsland();
    setBusy(false);
    if (!ok) {
      setShakeId('island');
      setTimeout(() => setShakeId(null), 450);
    }
  }

  const islandInfo = getIslandLevel(islandLevel);
  const atCapacity = ownedAnimals.length >= islandCapacity;

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
            🐾 {ownedAnimals.length} / {islandCapacity}
            {atCapacity && ' — île pleine !'}
          </span>
          <span className="shop-focus-time">⏱ {fmtSec(productiveSeconds)} de focus</span>
        </div>

        {/* ANIMALS TAB */}
        {tab === 'animals' && (
          <div className="shop-grid">
            {serverAnimals === null ? (
              <p style={{ color: '#6a8a6a', padding: '16px' }}>Chargement...</p>
            ) : serverAnimals.map((animal) => {
              const isLegendary = animal.rarity === 'legendary';
              const showMystery = !animal.unlocked && isLegendary;
              const previewSrc = `/previews/animals/animal-${animal.id}.png`;

              return (
                <div
                  key={animal.id}
                  className={`shop-card ${!animal.unlocked ? 'shop-card--locked' : ''} ${animal.owned ? 'shop-card--owned' : ''}`}
                  style={{ '--rarity-color': RARITY_COLORS[animal.rarity as keyof typeof RARITY_COLORS] ?? '#aaa' } as React.CSSProperties}
                >
                  <div className="shop-card-rarity-bar" style={{ background: RARITY_COLORS[animal.rarity as keyof typeof RARITY_COLORS] ?? '#aaa' }} />

                  <div className="shop-card-img-wrap">
                    {showMystery ? (
                      <div className="shop-card-mystery">?</div>
                    ) : (
                      <>
                        <img src={previewSrc} alt={animal.name} className="shop-card-img" draggable={false} />
                        {!animal.unlocked && <div className="shop-card-lock-overlay">🔒</div>}
                      </>
                    )}
                    {animal.owned && <div className="shop-card-owned-badge">✓</div>}
                  </div>

                  <div className="shop-card-name">{showMystery ? '???' : animal.name}</div>
                  <div className="shop-card-rarity-label" style={{ color: RARITY_COLORS[animal.rarity as keyof typeof RARITY_COLORS] ?? '#aaa' }}>
                    {RARITY_LABELS[animal.rarity as keyof typeof RARITY_LABELS] ?? animal.rarity}
                  </div>
                  {!showMystery && <div className="shop-card-income">+{formatCoins(animal.income_per_sec)}/s</div>}

                  {!animal.unlocked ? (
                    <div className="shop-card-lock-msg">
                      {showMystery ? '???' : `🔒 Focus encore ${fmtSec(animal.unlock_seconds - productiveSeconds)}`}
                    </div>
                  ) : animal.owned ? (
                    <div className="shop-card-lock-msg" style={{ color: '#55cc55' }}>✓ Possédé</div>
                  ) : atCapacity ? (
                    <div className="shop-card-lock-msg cap-full">Île pleine</div>
                  ) : (
                    <>
                      <button
                        className={`shop-btn-buy ${!animal.can_afford || busy ? 'shop-btn-buy--disabled' : ''} ${shakeId === animal.id ? 'shake' : ''}`}
                        onClick={() => tryBuyAnimal(animal.id)}
                        disabled={busy || animal.owned}
                      >
                        🪙 {formatCoins(animal.cost)}
                      </button>
                      {!animal.can_afford && shakeId === animal.id && (
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
                  Capacité : {islandCapacity} animaux · {islandInfo.gridN}×{islandInfo.gridN} blocs
                </div>
              </div>
            </div>

            <div className="upgrade-list">
              {ISLAND_LEVELS.filter((lvl) => lvl.level > 1).map((lvl) => {
                const isDone = lvl.level <= islandLevel;
                const isNext = lvl.level === islandLevel + 1;
                const prevLevel = getIslandLevel(lvl.level - 1);
                const addedSlots = lvl.capacity - prevLevel.capacity;
                const cost = islandUpgradeCost ?? prevLevel.upgradeCost;
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
                          className={`shop-btn-buy upgrade-btn ${!canAfford || busy ? 'shop-btn-buy--disabled' : ''} ${shakeId === 'island' ? 'shake' : ''}`}
                          onClick={() => tryUpgradeIsland()}
                          disabled={busy}
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
              <span className={placedDecors.length >= islandDecorCapacity ? 'cap-full' : ''}>
                🌲 {placedDecors.length} / {islandDecorCapacity}
                {placedDecors.length >= islandDecorCapacity && ' — slots pleins !'}
              </span>
            </div>
            {serverDecors === null ? (
              <p style={{ color: '#6a8a6a', padding: '16px' }}>Chargement...</p>
            ) : serverDecors.map((decor) => {
              const clientDecor = SHOP_DECORS.find((d) => d.id === decor.id);
              const scale = clientDecor?.scale ?? 1;
              const slotsFull = placedDecors.length >= islandDecorCapacity;

              return (
                <div key={decor.id} className={`shop-card ${!decor.unlocked ? 'shop-card--locked' : ''}`}>
                  <div className="shop-card-img-wrap">
                    <img src={`/previews/decors/${decor.id}.png`} alt={decor.name} className="shop-card-img" draggable={false} />
                    {!decor.unlocked && <div className="shop-card-lock-overlay">🔒</div>}
                    {decor.count > 0 && <div className="shop-card-owned-badge">×{decor.count}</div>}
                  </div>
                  <div className="shop-card-name">{decor.name}</div>
                  <div className="shop-card-income">+{formatCoins(decor.income_per_sec)}/s</div>
                  {!decor.unlocked ? (
                    <div className="shop-card-lock-msg">
                      🔒 Focus encore {fmtSec(decor.unlock_seconds - productiveSeconds)}
                    </div>
                  ) : slotsFull ? (
                    <div className="shop-card-lock-msg cap-full">Slots pleins</div>
                  ) : (
                    <>
                      <button
                        className={`shop-btn-buy ${!decor.can_buy || busy ? 'shop-btn-buy--disabled' : ''} ${shakeId === `decor-${decor.id}` ? 'shake' : ''}`}
                        disabled={busy}
                        onClick={async () => {
                          if (busy) return;
                          setBusy(true);
                          const ok = await buyDecor(decor.id as any, scale);
                          setBusy(false);
                          if (ok && token) {
                            fetchShopDecors(token).then(setServerDecors).catch(() => {});
                          } else if (!ok) {
                            setShakeId(`decor-${decor.id}`);
                            setTimeout(() => setShakeId(null), 450);
                          }
                        }}
                      >
                        🪙 {formatCoins(decor.cost)}
                      </button>
                      {!decor.can_buy && shakeId === `decor-${decor.id}` && (
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
