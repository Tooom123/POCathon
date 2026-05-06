const BASE_URL = 'http://localhost:8000';

export interface UserProfile {
  user_id: string;
  balance: number;
  productive_seconds: number;
  income_per_sec: number;
  pets: string[];
  decors: string[];
  island_level: number;
  island_capacity: number;
  island_decor_capacity: number;
  island_upgrade_cost: number | null;
}

export interface ShopAnimal {
  id: string;
  name: string;
  emoji: string;
  cost: number;
  income_per_sec: number;
  rarity: string;
  unlock_seconds: number;
  owned: boolean;
  unlocked: boolean;
  can_afford: boolean;
}

export interface ShopDecor {
  id: string;
  name: string;
  emoji: string;
  cost: number;
  income_per_sec: number;
  unlock_seconds: number;
  count: number;
  unlocked: boolean;
  can_buy: boolean;
}

export interface BuyResult {
  animal_id: string;
  balance: number;
}

export interface UpgradeResult {
  level: number;
  capacity: number;
  upgrade_cost: number | null;
  balance: number;
}

function headers(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export interface SessionPayload {
  app: string;
  category: string;
  started_at: string;   // ISO-8601
  ended_at: string;
  duration: number;     // seconds
}

export async function reportSessions(userId: string, sessions: SessionPayload[]): Promise<void> {
  await fetch(`${BASE_URL}/webhook/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, sessions }),
  });
  // Errors are swallowed — sessions are best-effort
}

export async function fetchShopAnimals(token: string): Promise<ShopAnimal[]> {
  const res = await fetch(`${BASE_URL}/shop/animals`, { headers: headers(token) });
  if (!res.ok) throw new Error(`Shop animals fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchShopDecors(token: string): Promise<ShopDecor[]> {
  const res = await fetch(`${BASE_URL}/shop/decors`, { headers: headers(token) });
  if (!res.ok) throw new Error(`Shop decors fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchProfile(token: string): Promise<UserProfile> {
  const res = await fetch(`${BASE_URL}/user/profile`, { headers: headers(token) });
  if (!res.ok) throw new Error(`Profile fetch failed: ${res.status}`);
  return res.json();
}

export async function apiBuyAnimal(token: string, animalId: string): Promise<BuyResult> {
  const res = await fetch(`${BASE_URL}/shop/animals/${animalId}/buy`, {
    method: 'POST',
    headers: headers(token),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail ?? `Buy failed: ${res.status}`), { status: res.status });
  }
  return res.json();
}

export async function apiBuyDecor(token: string, decorId: string): Promise<BuyResult> {
  const res = await fetch(`${BASE_URL}/shop/decors/${decorId}/buy`, {
    method: 'POST',
    headers: headers(token),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail ?? `Buy decor failed: ${res.status}`), { status: res.status });
  }
  return res.json();
}

export async function apiUpgradeIsland(token: string): Promise<UpgradeResult> {
  const res = await fetch(`${BASE_URL}/user/island/upgrade`, {
    method: 'POST',
    headers: headers(token),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail ?? `Upgrade failed: ${res.status}`), { status: res.status });
  }
  return res.json();
}
