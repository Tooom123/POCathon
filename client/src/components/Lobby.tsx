import { useState } from 'react';
import socket from '../socket';
import { useGameStore } from '../stores/gameStore';

export default function Lobby() {
  const [name, setName] = useState('');
  const [lobbyName, setLobbyName] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'menu' | 'join'>('menu');

  function connect(lobbyCode?: string) {
    if (!name.trim()) return;
    const { ownedAnimals, islandLevel, placedDecors, productiveSeconds } = useGameStore.getState();
    socket.connect();
    socket.emit('join_lobby', {
      code: lobbyCode,
      playerName: name.trim(),
      lobbyName: lobbyName.trim() || null,
      ownedAnimals,
      islandLevel,
      placedDecors,
      totalWorkSeconds: productiveSeconds,
    });
  }

  return (
    <div className="lobby">
      <AnimalBanners />

      <div className="lobby-card">
        <div className="lobby-logo">
          <img src="/previews/animals/animal-deer-cropped.png" alt="deer" className="lobby-logo-img" />
          <h1 className="lobby-title">Focus<span className="lobby-title-accent">Island</span></h1>
        </div>
        <p className="lobby-sub">Travaillez. Progressez. Peuplez votre île.</p>

        <div className="lobby-field">
          <label className="lobby-label">Votre nom</label>
          <input
            className="lobby-input"
            placeholder="Ex : Thomas"
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && mode === 'menu' && connect()}
          />
        </div>

        {mode === 'menu' && (
          <div className="lobby-actions">
            <div className="lobby-field">
              <label className="lobby-label">Nom du lobby <span style={{ color: '#3a5a3a' }}>(optionnel)</span></label>
              <input
                className="lobby-input"
                placeholder="Ex : Séance du mardi"
                value={lobbyName}
                maxLength={30}
                onChange={(e) => setLobbyName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && connect()}
              />
            </div>
            <button className="cube-btn cube-btn--green" onClick={() => connect()}>
              ▶ Créer un lobby
            </button>
            <button className="cube-btn cube-btn--blue" onClick={() => setMode('join')}>
              🔗 Rejoindre
            </button>
          </div>
        )}

        {mode === 'join' && (
          <div className="lobby-actions">
            <div className="lobby-field">
              <label className="lobby-label">Code du lobby</label>
              <input
                className="lobby-input lobby-input--code"
                placeholder="ABCDE"
                value={code}
                maxLength={5}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && connect(code)}
              />
            </div>
            <button className="cube-btn cube-btn--green" onClick={() => connect(code)}>
              ▶ Rejoindre
            </button>
            <button className="cube-btn cube-btn--ghost" onClick={() => setMode('menu')}>
              ← Retour
            </button>
          </div>
        )}

      </div>

      <div className="lobby-footer">
        Tom &amp; Mehdi — Hackathon POC 06/05/2026
      </div>
    </div>
  );
}

const ALL_ANIMALS = [
  'beaver','bee','bunny','caterpillar','cat','chick','cow','crab',
  'deer','dog','elephant','fish','fox','giraffe','hog','koala',
  'lion','monkey','panda','parrot','penguin','pig','polar','tiger',
];


function AnimalBanners() {
  return (
    <div className="lobby-banners" aria-hidden>
      {[0, 1, 2].map((i) => {
        // Repeat enough to fill any screen width — 6 copies of the full 24-animal list
        const repeated = Array.from({ length: 6 }, () => ALL_ANIMALS).flat();
        const reverse = i % 2 === 1;
        return (
          <div key={i} className={`lobby-banner lobby-banner--${reverse ? 'rtl' : 'ltr'}`}>
            <div className="lobby-banner-track">
              {repeated.map((id, j) => (
                <img
                  key={j}
                  src={`/previews/animals/animal-${id}.png`}
                  alt={id}
                  className="lobby-banner-img"
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
