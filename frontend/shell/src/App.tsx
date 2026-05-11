import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { Box, Typography } from '@mui/material';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SocietyProvider } from './contexts/SocietyContext';
import { Nav } from './components/Nav';
import { Home } from './pages/Home';
import { theme } from './theme';

function LoadingScreen() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        bgcolor: '#1e293b',
        color: '#fff',
      }}
    >
      <Typography fontSize={48} lineHeight={1}>🏛</Typography>
      <Box
        sx={{
          width: 36, height: 36,
          border: '3px solid rgba(255,255,255,0.2)',
          borderTopColor: '#fff',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          '@keyframes spin': { to: { transform: 'rotate(360deg)' } },
        }}
      />
      <Typography fontWeight={500}>Connecting to Society Events…</Typography>
      <Typography fontSize={13} sx={{ color: 'rgba(203,213,225,0.8)' }}>
        Redirecting to login if needed
      </Typography>
    </Box>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <Box
      component="main"
      sx={{
        minHeight: 'calc(100vh - 64px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1.5,
        color: 'text.secondary',
      }}
    >
      <Typography fontSize={48} lineHeight={1}>🚧</Typography>
      <Typography variant="h5" color="text.primary">{label}</Typography>
      <Typography variant="body2">This micro-frontend will mount here.</Typography>
    </Box>
  );
}

function AppShell() {
  const { isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;

  return (
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/"             element={<Home />} />
        <Route path="/events"       element={<Placeholder label="Events MFE" />} />
        <Route path="/tickets"      element={<Placeholder label="Booking MFE" />} />
        <Route path="/checkout/:id" element={<Placeholder label="Payment MFE" />} />
        <Route path="/admin/*"      element={<Placeholder label="Admin MFE" />} />
        <Route path="*"             element={<Placeholder label="404 — Page not found" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <SocietyProvider>
          <AppShell />
        </SocietyProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
