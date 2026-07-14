import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import keycloak from '../keycloak';
import { userService } from '../api/userService';

export interface AuthUser {
  sub: string;
  name: string;
  email: string;
  initials: string;
  roles: string[];
  primaryRole: string;
}

interface AuthContextValue {
  isLoading: boolean;
  user: AuthUser | null;
  token: string | null;
  isPending: boolean;
  login: () => void;
  loginWithGoogle: () => void;
  loginWithPhone: (sessionToken: string, accessToken: string) => void;
  register: () => void;
  logout: () => void;
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

// Decodes a JWT's payload without verifying the signature — verification
// already happened server-side (Keycloak, or the otp-bridge exchange for
// phone sessions); this is purely for reading display claims client-side.
function decodeJwtClaims(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(payload.length + (4 - (payload.length % 4)) % 4, '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function parseUserFromClaims(t: Record<string, unknown> | undefined | null): AuthUser | null {
  if (!t) return null;

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
  };
}

// ── Double-init guard (React Strict Mode / Vite HMR) ─────────────────────────

declare global { interface Window { __kcInitCalled?: boolean } }

// Phone-OTP login is entirely independent of keycloak-js: the otp-bridge
// token exchange returns no refresh_token and mints tokens under a
// different client (azp=otp-bridge, not society-frontend), so keycloak-js's
// own updateToken() can't be used to keep it alive. Instead the backend
// hands back an opaque session token that's silently re-exchanged for a
// fresh access token every 60s — see services/user's /auth/phone-login/*.
const PHONE_SESSION_KEY = 'otp_session_token';

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [user,      setUser]      = useState<AuthUser | null>(null);
  const [token,     setToken]     = useState<string | null>(null);
  const refreshTimer              = useRef<ReturnType<typeof setInterval> | null>(null);
  const phoneSessionToken         = useRef<string | null>(null);

  const login           = useCallback(() => keycloak.login(), []);
  const loginWithGoogle = useCallback(() => keycloak.login({ idpHint: 'google' }), []);
  const register        = useCallback(() => keycloak.register(), []);

  const clearPhoneSession = useCallback(() => {
    if (refreshTimer.current) clearInterval(refreshTimer.current);
    phoneSessionToken.current = null;
    sessionStorage.removeItem(PHONE_SESSION_KEY);
    setUser(null);
    setToken(null);
  }, []);

  const armPhoneRefreshTimer = useCallback((sessionToken: string) => {
    if (refreshTimer.current) clearInterval(refreshTimer.current);
    refreshTimer.current = setInterval(() => {
      userService.phoneLogin
        .refresh(sessionToken)
        .then(({ access_token }) => {
          setToken(access_token);
          setUser(parseUserFromClaims(decodeJwtClaims(access_token)));
        })
        .catch(() => clearPhoneSession());
    }, 60_000);
  }, [clearPhoneSession]);

  // Called by the phone-login page once /auth/phone-login/verify succeeds.
  const loginWithPhone = useCallback((sessionToken: string, accessToken: string) => {
    sessionStorage.setItem(PHONE_SESSION_KEY, sessionToken);
    phoneSessionToken.current = sessionToken;
    setUser(parseUserFromClaims(decodeJwtClaims(accessToken)));
    setToken(accessToken);
    armPhoneRefreshTimer(sessionToken);
  }, [armPhoneRefreshTimer]);

  const logout = useCallback(() => {
    if (phoneSessionToken.current) {
      userService.phoneLogin.logout(phoneSessionToken.current).catch(() => {});
      clearPhoneSession();
      return;
    }
    keycloak.logout({ redirectUri: window.location.origin + '/' });
  }, [clearPhoneSession]);

  // ── Initialisation ────────────────────────────────────────────────────────
  useEffect(() => {
    if (window.__kcInitCalled) return;
    window.__kcInitCalled = true;

    const storedSessionToken = sessionStorage.getItem(PHONE_SESSION_KEY);

    async function resumePhoneSession(sessionToken: string): Promise<boolean> {
      try {
        const { access_token } = await userService.phoneLogin.refresh(sessionToken);
        phoneSessionToken.current = sessionToken;
        setUser(parseUserFromClaims(decodeJwtClaims(access_token)));
        setToken(access_token);
        armPhoneRefreshTimer(sessionToken);
        return true;
      } catch {
        sessionStorage.removeItem(PHONE_SESSION_KEY);
        return false;
      }
    }

    function initKeycloak() {
      keycloak
        .init({
          onLoad: 'check-sso',
          silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
          checkLoginIframe: false,
          pkceMethod: 'S256',
        })
        .then((authenticated) => {
          if (authenticated) {
            setUser(parseUserFromClaims(keycloak.tokenParsed as Record<string, unknown> | undefined));
            setToken(keycloak.token ?? null);

            if (refreshTimer.current) clearInterval(refreshTimer.current);
            refreshTimer.current = setInterval(() => {
              keycloak
                .updateToken(70)
                .then((refreshed) => {
                  if (refreshed) {
                    setToken(keycloak.token ?? null);
                    setUser(parseUserFromClaims(keycloak.tokenParsed as Record<string, unknown> | undefined));
                  }
                })
                .catch(() => keycloak.login());
            }, 60_000);
          }

          setIsLoading(false);
        })
        .catch((err) => {
          console.error('[AuthContext] keycloak.init() failed:', err);
          setIsLoading(false);
        });
    }

    (async () => {
      if (storedSessionToken && (await resumePhoneSession(storedSessionToken))) {
        setIsLoading(false);
        return;
      }
      initKeycloak();
    })();

    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [armPhoneRefreshTimer]);

  const isPending = !!user && user.primaryRole === 'pending';

  return (
    <AuthContext.Provider
      value={{ isLoading, user, token, isPending, login, loginWithGoogle, loginWithPhone, register, logout }}
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
