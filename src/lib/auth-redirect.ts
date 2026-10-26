const APP_SCHEME = 'elopadel:';
const EXPO_SCHEME = 'exp:';
const AUTH_CALLBACK_ROUTE = 'auth-callback';

/**
 * Returns a redirect URL only when it points to the app's auth callback.
 * Session tokens are never sent to http(s) destinations, including same-origin
 * pages, because an open local path could forward the credential elsewhere.
 */
export function resolveAppRedirect(rawRedirect: string | null): string | null {
  if (!rawRedirect) return null;

  let parsed: URL;
  try {
    parsed = new URL(rawRedirect);
  } catch {
    return null;
  }

  if (parsed.username || parsed.password) return null;

  if (parsed.protocol === APP_SCHEME) {
    const route = `${parsed.hostname}${parsed.pathname}`.replace(/^\/+/, '');
    return route === AUTH_CALLBACK_ROUTE ? parsed.toString() : null;
  }

  if (parsed.protocol === EXPO_SCHEME) {
    const route = parsed.pathname.replace(/^\/+/, '');
    if (route === `--/${AUTH_CALLBACK_ROUTE}` && isLocalDevelopmentHost(parsed.hostname)) {
      return parsed.toString();
    }
  }

  return null;
}

export function isLocalDevelopmentHost(hostname: string): boolean {
  if (!hostname) return false;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  return hostname.endsWith('.local');
}
