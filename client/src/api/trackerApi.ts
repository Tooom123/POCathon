const BASE_URL = 'http://localhost:8000';

export interface TokenResponse {
  token: string;
  status: 'pending' | 'linked' | 'expired' | 'not_found';
  user_id: string | null;
  expires_at: string;
  expires_in_seconds?: number;
  instructions?: string;
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function requestToken(): Promise<TokenResponse> {
  const res = await fetch(`${BASE_URL}/auth/token`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to request token: ${res.status}`);
  return res.json();
}

export async function getTokenStatus(token: string): Promise<TokenResponse> {
  const res = await fetch(`${BASE_URL}/auth/token/${token}/status`);
  if (res.status === 404) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  if (res.status === 410) throw Object.assign(new Error('expired'), { code: 'expired' });
  if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
  return res.json();
}

export function openTokenStream(
  token: string,
  onUpdate: (data: TokenResponse) => void,
  onError: (err: Event) => void,
): EventSource {
  const es = new EventSource(`${BASE_URL}/auth/token/${token}/stream`);
  es.onmessage = (e) => {
    try {
      onUpdate(JSON.parse(e.data));
    } catch {
      // ignore parse errors
    }
  };
  es.onerror = onError;
  return es;
}

export async function refreshToken(token: string): Promise<TokenResponse> {
  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw Object.assign(new Error('unauthorized'), { code: 401 });
  if (res.status === 403) throw Object.assign(new Error('forbidden'), { code: 403 });
  if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
  return res.json();
}
