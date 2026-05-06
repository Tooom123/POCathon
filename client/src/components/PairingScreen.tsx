import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { checkHealth, requestToken, openTokenStream, TokenResponse } from '../api/trackerApi';

type Phase = 'checking' | 'offline' | 'requesting' | 'waiting' | 'error';

export default function PairingScreen() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const [phase, setPhase] = useState<Phase>('checking');
  const [tokenData, setTokenData] = useState<TokenResponse | null>(null);
  const instructionsRef = useRef<string | null>(null);
  const [copied, setCopied] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  function closeStream() {
    esRef.current?.close();
    esRef.current = null;
  }

  async function startPairing() {
    closeStream();
    setPhase('requesting');
    try {
      const data = await requestToken();
      instructionsRef.current = data.instructions ?? null;
      setTokenData(data);
      setPhase('waiting');

      const es = openTokenStream(
        data.token,
        (update) => {
          // SSE events don't include instructions — preserve the original
          setTokenData((prev) => ({ ...prev, ...update, instructions: prev?.instructions }));
          if (update.status === 'linked' && update.user_id) {
            closeStream();
            setAuth(update.token, update.user_id, update.expires_at);
          } else if (update.status === 'expired' || update.status === 'not_found') {
            closeStream();
            // Auto-restart pairing after brief pause
            setTimeout(startPairing, 1500);
          }
        },
        () => {
          // SSE error — reconnect after delay
          closeStream();
          setTimeout(() => {
            if (phase === 'waiting') startPairing();
          }, 3000);
        },
      );
      esRef.current = es;
    } catch {
      setPhase('error');
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const alive = await checkHealth();
      if (cancelled) return;
      if (!alive) {
        setPhase('offline');
        return;
      }
      startPairing();
    })();
    return () => {
      cancelled = true;
      closeStream();
    };
  }, []);

  function copyInstructions() {
    const text = tokenData?.instructions;
    if (!text) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text: string) {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.focus();
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="lobby">
      <div className="lobby-cubes" aria-hidden>
        {[...Array(8)].map((_, i) => (
          <div key={i} className={`lobby-cube lobby-cube--${i}`} />
        ))}
      </div>

      <div className="lobby-card">
        <div className="lobby-logo">
          <span className="lobby-logo-icon">🔗</span>
          <h1 className="lobby-title">Lier mon <span className="lobby-title-accent">Tracker</span></h1>
        </div>

        {phase === 'checking' && (
          <p className="lobby-sub">Connexion au serveur...</p>
        )}

        {phase === 'offline' && (
          <>
            <p className="lobby-sub" style={{ color: '#e05252' }}>
              Serveur inaccessible. Vérifiez que <code>tracker-server</code> tourne sur le port 8000.
            </p>
            <button className="cube-btn cube-btn--green" onClick={() => { setPhase('checking'); startPairing(); }}>
              Réessayer
            </button>
          </>
        )}

        {phase === 'requesting' && (
          <p className="lobby-sub">Génération du token...</p>
        )}

        {phase === 'waiting' && tokenData && (
          <>
            <p className="lobby-sub">Lancez cette commande sur votre PC :</p>

            <div className="lobby-field">
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: '0.95rem',
                  background: '#1a2a1a',
                  border: '1px solid #3a5a3a',
                  borderRadius: 8,
                  padding: '10px 14px',
                  color: '#a8d5a2',
                  letterSpacing: '0.02em',
                  userSelect: 'all',
                }}
              >
                {tokenData.instructions}
              </div>
            </div>

            <div style={{ textAlign: 'center', margin: '12px 0' }}>
              <span
                style={{
                  display: 'inline-block',
                  fontSize: '2.5rem',
                  fontFamily: 'monospace',
                  fontWeight: 800,
                  letterSpacing: '0.3em',
                  color: '#fff',
                  background: '#223322',
                  border: '2px solid #4a7a4a',
                  borderRadius: 10,
                  padding: '8px 20px',
                }}
              >
                {tokenData.token}
              </span>
            </div>

            <button className="cube-btn cube-btn--blue" onClick={copyInstructions} style={{ width: '100%' }}>
              {copied ? '✓ Copié !' : '📋 Copier la commande'}
            </button>

            <p style={{ textAlign: 'center', color: '#6a8a6a', fontSize: '0.82rem', marginTop: 12 }}>
              En attente de liaison... Le token expire dans 10 min.
            </p>
          </>
        )}

        {phase === 'error' && (
          <>
            <p className="lobby-sub" style={{ color: '#e05252' }}>
              Erreur lors de la génération du token.
            </p>
            <button className="cube-btn cube-btn--green" onClick={startPairing}>
              Réessayer
            </button>
          </>
        )}
      </div>
    </div>
  );
}
