/**
 * DrillIQ web auth: talks to the NestJS API (POST /api/auth/login, /refresh,
 * /logout) and persists the token pair + user summary in localStorage.
 */
export interface AuthUser {
  id: string;
  email: string;
  role: string;
  clientId: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

const STORAGE_KEY = 'drilliq.auth';

export function loadAuth(): AuthResult | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthResult) : null;
  } catch {
    return null;
  }
}

export function saveAuth(auth: AuthResult | null): void {
  if (auth) localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  else localStorage.removeItem(STORAGE_KEY);
}

export function getAccessToken(): string | null {
  return loadAuth()?.accessToken ?? null;
}

/** Authorization header for authenticated API calls (empty when logged out). */
export function authHeader(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiLogin(email: string, password: string): Promise<AuthResult> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Invalid email or password.');
    let detail = '';
    try {
      const body = (await res.json()) as { message?: string | string[] };
      detail = Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? '');
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Login failed (${res.status}).`);
  }
  return (await res.json()) as AuthResult;
}

/** Best-effort server-side logout; never throws (local state is cleared regardless). */
export async function apiLogout(refreshToken?: string): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    /* ignore network/auth errors on logout */
  }
}
