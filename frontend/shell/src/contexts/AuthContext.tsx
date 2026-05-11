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
  )[0] ?? 'resident';

  return {
    sub:  t['sub'] as string,
    name,
    email: (t['email'] as string) ?? '',
    initials,
    roles: realmRoles,
    primaryRole,
  };
}

let initCalled = false; // guard against React Strict Mode double-effect

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading]   = useState(true);
  const [user,      setUser]        = useState<AuthUser | null>(null);
  const [token,     setToken]       = useState<string | null>(null);
  const refreshTimer                = useRef<ReturnType<typeof setInterval> | null>(null);

  const logout = useCallback(() => {
    keycloak.logout({ redirectUri: window.location.origin });
  }, []);

  useEffect(() => {
    if (initCalled) return;
    initCalled = true;

    keycloak
      .init({
        onLoad: 'login-required',
        checkLoginIframe: false,
        pkceMethod: 'S256',
      })
      .then((authenticated) => {
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
      .catch(() => setIsLoading(false));

    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ isLoading, user, token, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
