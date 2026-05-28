import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import keycloak from './keycloak';

interface StandaloneAuthValue {
  isLoading: boolean;
  token: string | null;
  login: () => void;
  logout: () => void;
}

const StandaloneAuthContext = createContext<StandaloneAuthValue | null>(null);

declare global {
  interface Window {
    __mfeAdminKcInitCalled?: boolean;
  }
}

function silentCheckSsoUri() {
  return `${window.location.origin}${import.meta.env.BASE_URL}silent-check-sso.html`;
}

export function StandaloneAuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const login = useCallback(() => {
    keycloak.login({ redirectUri: window.location.href });
  }, []);

  const logout = useCallback(() => {
    keycloak.logout({ redirectUri: `${window.location.origin}${import.meta.env.BASE_URL}` });
  }, []);

  useEffect(() => {
    if (window.__mfeAdminKcInitCalled) return;
    window.__mfeAdminKcInitCalled = true;

    keycloak
      .init({
        onLoad: 'check-sso',
        silentCheckSsoRedirectUri: silentCheckSsoUri(),
        checkLoginIframe: false,
        pkceMethod: 'S256',
      })
      .then((authenticated) => {
        if (authenticated) {
          setToken(keycloak.token ?? null);
          refreshTimer.current = setInterval(() => {
            keycloak
              .updateToken(70)
              .then(() => setToken(keycloak.token ?? null))
              .catch(() => login());
          }, 60_000);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Keycloak initialization failed.');
        setIsLoading(false);
      });

    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [login]);

  if (isLoading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Stack alignItems="center" spacing={2}>
          <CircularProgress size={30} />
          <Typography color="text.secondary">Checking Keycloak session...</Typography>
        </Stack>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 4, maxWidth: 640 }}>
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={login}>Sign in</Button>}>
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <StandaloneAuthContext.Provider value={{ isLoading, token, login, logout }}>
      {children}
    </StandaloneAuthContext.Provider>
  );
}

export function useStandaloneAuth(): StandaloneAuthValue {
  const ctx = useContext(StandaloneAuthContext);
  if (!ctx) throw new Error('useStandaloneAuth must be used within StandaloneAuthProvider');
  return ctx;
}
