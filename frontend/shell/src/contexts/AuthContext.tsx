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
}

interface AuthContextValue {
  isLoading: boolean;
  user: AuthUser | null;
  token: string | null;
  isPending: boolean; // registered in Keycloak but no role assigned yet
  login: () => void;
  register: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const KNOWN_ROLES = ['admin', 'committee_member', 'resident', 'security_guard'];
const ROLE_RANK: Record<string, number> = {
  admin: 1,
  committee_member: 2,
  resident: 3,
  security_guard: 4,
};

function parseUser(kc: typeof keycloak): AuthUser | null {
  const t = kc.tokenParsed as Record<string, unknown> | undefined;
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

// Guard against React Strict Mode double-effect.
// Stored on window so a Vite HMR module re-evaluation resets it properly
// (window persists across HMR but module scope does not).
declare global { interface Window { __kcInitCalled?: boolean } }

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading]   = useState(true);
  const [user,      setUser]        = useState<AuthUser | null>(null);
  const [token,     setToken]       = useState<string | null>(null);
  const refreshTimer                = useRef<ReturnType<typeof setInterval> | null>(null);

  const login    = useCallback(() => keycloak.login(), []);
  const register = useCallback(() => keycloak.register(), []);
  const logout   = useCallback(() => {
    // Trailing slash ensures the URI matches the "http://localhost:3000/*" pattern in Keycloak
    keycloak.logout({ redirectUri: window.location.origin + '/' });
  }, []);

  useEffect(() => {
    if (window.__kcInitCalled) return;
    window.__kcInitCalled = true;

    console.debug('[AuthContext] keycloak.init() starting — href:', window.location.href);

    keycloak
      .init({
        // onLoad omitted intentionally: 'check-sso' triggers an iframe to the
        // Keycloak origin (port 8080) which is blocked by its own X-Frame-Options
        // header when the app runs on a different origin (port 3000). Without
        // onLoad, keycloak-js still processes the auth-code callback in the URL
        // and restores tokens from sessionStorage on subsequent page loads.
        checkLoginIframe: false,
        pkceMethod: 'S256',
      })
      .then((authenticated) => {
        console.debug('[AuthContext] keycloak.init() resolved — authenticated:', authenticated, '| error:', (keycloak as any).authServerUrl);
        if (authenticated) {
          setUser(parseUser(keycloak));
          setToken(keycloak.token ?? null);

          // Refresh token 70 s before it expires (checked every 60 s)
          refreshTimer.current = setInterval(() => {
            keycloak
              .updateToken(70)
              .then((refreshed) => {
                if (refreshed) {
                  setToken(keycloak.token ?? null);
                  setUser(parseUser(keycloak));
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

    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, []);

  const isPending = !!user && user.primaryRole === 'pending';

  return (
    <AuthContext.Provider value={{ isLoading, user, token, isPending, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
