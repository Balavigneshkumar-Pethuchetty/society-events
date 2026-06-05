import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import keycloak from '../keycloak';

export interface AuthUser {
  sub: string;
  name: string;
  email: string;
  initials: string;
  roles: string[];
  primaryRole: string;
  authMode: 'keycloak' | 'mobile';
}

interface AuthContextValue {
  isLoading: boolean;
  user: AuthUser | null;
  token: string | null;
  isPending: boolean;
  login: () => void;
  loginWithGoogle: () => void;
  register: () => void;
  logout: () => void;
  /** Called by MobileLogin after successful OTP verification */
  loginWithOTPToken: (accessToken: string, sessionToken: string, expiresIn: number) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const KNOWN_ROLES = ['admin', 'committee_member', 'resident', 'security_guard', 'sponsor'];
const ROLE_RANK: Record<string, number> = {
  admin: 1,
  committee_member: 2,
  resident: 3,
  security_guard: 4,
  sponsor: 5,
};

// ── JWT helpers (no library — browser-safe base64url decode) ─────────────────

function b64url(s: string): string {
  return s.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice((s.length + 4) % 4 === 0 ? 4 : (s.length + 4) % 4);
}

function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(b64url(payload)));
  } catch {
    return null;
  }
}

// ── User parsers ──────────────────────────────────────────────────────────────

function parseKeycloakUser(kc: typeof keycloak): AuthUser | null {
  const t = kc.tokenParsed as Record<string, unknown> | undefined;
  if (!t) return null;
  return buildUser(t, 'keycloak');
}

function parseMobileToken(token: string): AuthUser | null {
  const t = decodeJwt(token);
  if (!t) return null;
  return buildUser(t, 'mobile');
}

function buildUser(t: Record<string, unknown>, mode: 'keycloak' | 'mobile'): AuthUser {
  const firstName = (t['given_name'] as string) ?? '';
  const lastName  = (t['family_name'] as string) ?? '';
  const name = [firstName, lastName].filter(Boolean).join(' ')
    || (t['preferred_username'] as string)
    || (t['email'] as string)
    || 'User';

  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const realmRoles = ((t['realm_access'] as Record<string, string[]>)?.roles ?? [])
    .filter((r) => KNOWN_ROLES.includes(r));

  const primaryRole = realmRoles.sort(
    (a, b) => (ROLE_RANK[a] ?? 99) - (ROLE_RANK[b] ?? 99),
  )[0] ?? 'pending';

  return {
    sub:  t['sub'] as string,
    name,
    email: (t['email'] as string) ?? '',
    initials,
    roles: realmRoles,
    primaryRole,
    authMode: mode,
  };
}

// ── Mobile session storage keys ───────────────────────────────────────────────

const MOBILE_ACCESS_TOKEN_KEY  = 'otp_access_token';
const MOBILE_SESSION_TOKEN_KEY = 'otp_session_token';
const MOBILE_EXPIRES_AT_KEY    = 'otp_expires_at';

// ── Double-init guard (React Strict Mode / Vite HMR) ─────────────────────────

declare global { interface Window { __kcInitCalled?: boolean } }

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [user,      setUser]      = useState<AuthUser | null>(null);
  const [token,     setToken]     = useState<string | null>(null);
  const refreshTimer              = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Keycloak actions ───────────────────────────────────────────────────────
  const login           = useCallback(() => keycloak.login(), []);
  const loginWithGoogle = useCallback(() => keycloak.login({ idpHint: 'google' }), []);
  const register        = useCallback(() => keycloak.register(), []);

  const logout = useCallback(() => {
    // Read session token BEFORE clearing storage
    const sessionToken = sessionStorage.getItem(MOBILE_SESSION_TOKEN_KEY);
    if (sessionToken) {
      // Fire-and-forget bridge session revocation
      fetch('/api/otp/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_token: sessionToken }),
      }).catch(() => {/* ignore */});
    }

    sessionStorage.removeItem(MOBILE_ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(MOBILE_SESSION_TOKEN_KEY);
    sessionStorage.removeItem(MOBILE_EXPIRES_AT_KEY);

    if (user?.authMode === 'mobile') {
      setUser(null);
      setToken(null);
      return;
    }
    keycloak.logout({ redirectUri: window.location.origin + '/' });
  }, [user]);

  // ── Mobile OTP token setter (called from MobileLogin page) ────────────────
  const loginWithOTPToken = useCallback(
    (accessToken: string, sessionToken: string, expiresIn: number) => {
      const expiresAt = Date.now() + expiresIn * 1000;
      sessionStorage.setItem(MOBILE_ACCESS_TOKEN_KEY, accessToken);
      sessionStorage.setItem(MOBILE_SESSION_TOKEN_KEY, sessionToken);
      sessionStorage.setItem(MOBILE_EXPIRES_AT_KEY, String(expiresAt));

      const parsedUser = parseMobileToken(accessToken);
      setUser(parsedUser);
      setToken(accessToken);

      // Set up refresh: refresh 70 s before expiry, check every 60 s
      if (refreshTimer.current) clearInterval(refreshTimer.current);
      refreshTimer.current = setInterval(async () => {
        const storedSession = sessionStorage.getItem(MOBILE_SESSION_TOKEN_KEY);
        const storedExpiry  = Number(sessionStorage.getItem(MOBILE_EXPIRES_AT_KEY) ?? 0);
        if (!storedSession) return;

        const secondsLeft = (storedExpiry - Date.now()) / 1000;
        if (secondsLeft > 70) return; // not yet

        try {
          const resp = await fetch('/api/otp/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_token: storedSession }),
          });
          if (!resp.ok) throw new Error('refresh failed');
          const data = await resp.json();
          const newExpiry = Date.now() + (data.expires_in ?? 300) * 1000;
          sessionStorage.setItem(MOBILE_ACCESS_TOKEN_KEY, data.access_token);
          sessionStorage.setItem(MOBILE_EXPIRES_AT_KEY, String(newExpiry));
          setToken(data.access_token);
          setUser(parseMobileToken(data.access_token));
        } catch {
          // Session expired — force logout
          sessionStorage.removeItem(MOBILE_ACCESS_TOKEN_KEY);
          sessionStorage.removeItem(MOBILE_SESSION_TOKEN_KEY);
          sessionStorage.removeItem(MOBILE_EXPIRES_AT_KEY);
          setUser(null);
          setToken(null);
        }
      }, 60_000);
    },
    [],
  );

  // ── Initialisation ────────────────────────────────────────────────────────
  useEffect(() => {
    if (window.__kcInitCalled) return;
    window.__kcInitCalled = true;

    keycloak
      .init({
        onLoad: 'check-sso',
        silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
        checkLoginIframe: false,
        pkceMethod: 'S256',
      })
      .then((authenticated) => {
        if (authenticated) {
          setUser(parseKeycloakUser(keycloak));
          setToken(keycloak.token ?? null);

          if (refreshTimer.current) clearInterval(refreshTimer.current);
          refreshTimer.current = setInterval(() => {
            keycloak
              .updateToken(70)
              .then((refreshed) => {
                if (refreshed) {
                  setToken(keycloak.token ?? null);
                  setUser(parseKeycloakUser(keycloak));
                }
              })
              .catch(() => keycloak.login());
          }, 60_000);

          setIsLoading(false);
          return;
        }

        // Not authenticated via Keycloak — check for mobile OTP session
        const mobileToken   = sessionStorage.getItem(MOBILE_ACCESS_TOKEN_KEY);
        const sessionToken  = sessionStorage.getItem(MOBILE_SESSION_TOKEN_KEY);
        const expiresAt     = Number(sessionStorage.getItem(MOBILE_EXPIRES_AT_KEY) ?? 0);

        if (mobileToken && sessionToken && expiresAt > Date.now()) {
          loginWithOTPToken(mobileToken, sessionToken, (expiresAt - Date.now()) / 1000);
        }

        setIsLoading(false);
      })
      .catch((err) => {
        console.error('[AuthContext] keycloak.init() failed:', err);
        setIsLoading(false);
      });

    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [loginWithOTPToken]);

  const isPending = !!user && user.primaryRole === 'pending';

  return (
    <AuthContext.Provider
      value={{ isLoading, user, token, isPending, login, loginWithGoogle, register, logout, loginWithOTPToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
