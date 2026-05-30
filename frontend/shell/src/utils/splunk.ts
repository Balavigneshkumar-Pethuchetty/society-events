/**
 * Frontend error reporter — sends JS errors to the user-service log proxy
 * which forwards them to Splunk (society_app_errors index, 30-day retention).
 *
 * User identity is read from the live Keycloak token so every event carries
 * sub / username / email / role without needing React context.
 */

import keycloak from '../keycloak';

const LOG_ENDPOINT   = '/api/users/frontend-logs';
const _KNOWN_ROLES   = new Set(['admin','committee_member','resident','security_guard','sponsor']);

interface LogPayload {
  level?:  'error' | 'warn' | 'info';
  message: string;
  source?: string;
  url?:    string;
  stack?:  string;
  extra?:  Record<string, unknown>;
}

function getUserInfo(): Record<string, unknown> {
  const t = keycloak.tokenParsed as Record<string, unknown> | undefined;
  if (!t) return { user: 'anonymous' };

  const firstName = (t['given_name'] as string) ?? '';
  const lastName  = (t['family_name'] as string) ?? '';
  const roles     = ((t['realm_access'] as Record<string, string[]>)?.roles ?? []);
  const role      = roles.find(r => _KNOWN_ROLES.has(r)) ?? 'unknown';

  return {
    user_id:  t['sub']                as string | undefined,
    username: t['preferred_username'] as string | undefined,
    email:    t['email']              as string | undefined,
    name:     [firstName, lastName].filter(Boolean).join(' ') || t['preferred_username'],
    role,
  };
}

function ship(payload: LogPayload): void {
  const body = JSON.stringify({
    level: 'error',
    ...payload,
    extra: { ...payload.extra, ...getUserInfo() },
  });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(LOG_ENDPOINT, new Blob([body], { type: 'application/json' }));
    } else {
      fetch(LOG_ENDPOINT, {
        method:    'POST',
        headers:   { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Never let logging throw
  }
}

/** Manually log an error from any component or service. */
export function logError(message: string, opts: Partial<LogPayload> = {}): void {
  ship({ level: 'error', message, url: window.location.href, ...opts });
}

/** Wire up global window.onerror + unhandledrejection handlers. Call once at app startup. */
export function initErrorTracking(): void {
  window.onerror = (msg, src, line, col, error) => {
    ship({
      level:   'error',
      message: String(msg),
      source:  src,
      url:     window.location.href,
      stack:   error?.stack,
      extra:   { line, col },
    });
    return false;
  };

  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    ship({
      level:   'error',
      message: `Unhandled promise rejection: ${String(e.reason)}`,
      source:  'promise',
      url:     window.location.href,
      stack:   (e.reason as Error)?.stack,
    });
  });
}
