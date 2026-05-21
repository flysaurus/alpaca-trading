/**
 * Frontend API helper — wraps fetch with automatic session token injection.
 *
 * Reads the session token from sessionStorage and sends it as
 * Authorization: Bearer <token> on every request.
 *
 * ⚠️  This also handles re-authentication redirects.
 * If the API returns 401 (session expired), the user is
 * redirected to /login to re-enter their master password.
 */

let _redirecting = false;

export function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('alpaca_session_token');
}

export function setSessionToken(token: string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem('alpaca_session_token', token);
}

export function clearSessionToken(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem('alpaca_session_token');
}

export async function fetchApi(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getSessionToken();

  const headers: HeadersInit = {
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle session expiration
  if (response.status === 401 && !_redirecting) {
    const body = await response.clone().json().catch(() => ({}));
    if (body.error?.includes('session') || body.error?.includes('expired') || body.error?.includes('authenticate')) {
      _redirecting = true;
      clearSessionToken();
      window.location.href = '/login';
    }
  }

  return response;
}
