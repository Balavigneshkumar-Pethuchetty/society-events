import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { Alert, Box, Button, Typography } from '@mui/material';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SocietyProvider, useSociety } from './contexts/SocietyContext';
import { UserServiceProvider } from './contexts/UserServiceContext';
import { Nav } from './components/Nav';
import { Footer } from './components/Footer';
import { Home } from './pages/Home';
import { Landing } from './pages/Landing';
import { ForgotPassword } from './pages/ForgotPassword';
import { MobileLogin } from './pages/MobileLogin';
import { PhoneRegister } from './pages/PhoneRegister';
import { PendingApproval } from './pages/PendingApproval';
import { Profile } from './pages/Profile';
import { theme } from './theme';

type RemoteModule = Record<string, unknown> & {
  default?: unknown;
};

interface AdminRoutesProps {
  token?: string | null;
  page?: string;
  role?: string;
}

interface ManageRoutesProps {
  token?: string | null;
  page?: string;
  id?: string;
}

interface EventsAppProps {
  societyName?: string;
  city?: string;
  token?: string | null;
}

interface SponsorAppProps {
  firstName?: string;
}

interface BookingAppProps {
  token?: string | null;
}

interface PaymentAppProps {
  token?: string | null;
}

interface TicketsAppProps {
  token?: string | null;
}

// ── MFE unavailable fallback ──────────────────────────────────────────────────
// Shown when a remote's remoteEntry.js can't be fetched (container not running,
// network error, 404, etc.). Prevents a white blank page.
function MfeUnavailable({ name }: { name: string }) {
  return (
    <Box
      component="main"
      sx={{
        minHeight: 'calc(100vh - 64px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        px: 3,
      }}
    >
      <Typography fontSize={40} lineHeight={1}>⚠️</Typography>
      <Typography variant="h6" fontWeight={700}>{name} is unavailable</Typography>
      <Alert severity="error" sx={{ maxWidth: 480 }}>
        The <strong>{name}</strong> service could not be loaded. Make sure the MFE container
        is running and nginx is proxying correctly, then reload the page.
      </Alert>
      <Button variant="outlined" onClick={() => window.location.reload()}>
        Retry
      </Button>
    </Box>
  );
}

function getRemoteComponent<TProps>(
  module: RemoteModule,
  exportName: string,
): React.ComponentType<TProps> {
  const defaultModule = module.default as RemoteModule | undefined;
  const component = module[exportName] ?? defaultModule?.[exportName] ?? module.default;

  if (!component) {
    throw new Error(`Remote export ${exportName} was not found.`);
  }

  return component as React.ComponentType<TProps>;
}

// ── Remote lazy imports with graceful error handling ──────────────────────────
// .catch() on each import means a failed fetch (404, ERR_CONNECTION_REFUSED)
// renders MfeUnavailable instead of throwing an uncaught error that blanks the page.

const RemoteManageRoutes = React.lazy(() =>
  import('mfe_admin/ManageRoutes')
    .then((m) => ({ default: getRemoteComponent<ManageRoutesProps>(m, 'ManageRoutes') }))
    .catch(() => ({ default: () => <MfeUnavailable name="Event Manager" /> }))
);

const RemoteAdminRoutes = React.lazy(() => {
  console.log('[shell] fetching mfe_admin/AdminRoutes…');
  return import('mfe_admin/AdminRoutes')
    .then((m) => {
      console.log('[shell] mfe_admin/AdminRoutes loaded, exports:', Object.keys(m));
      return { default: getRemoteComponent<AdminRoutesProps>(m, 'AdminRoutes') };
    })
    .catch((err: unknown) => {
      console.error('[shell] mfe_admin/AdminRoutes FAILED to load:', err);
      return { default: () => <MfeUnavailable name="Admin Panel" /> };
    });
});

const RemoteSponsorApp = React.lazy(() =>
  import('mfe_admin/SponsorApp')
    .then((m) => ({ default: getRemoteComponent<SponsorAppProps>(m, 'SponsorApp') }))
    .catch(() => ({ default: () => <MfeUnavailable name="Sponsor Portal" /> }))
);

const RemoteEventsApp = React.lazy(() =>
  import('mfe_events/EventsApp')
    .then((m) => ({ default: getRemoteComponent<EventsAppProps>(m, 'EventsApp') }))
    .catch(() => ({ default: () => <MfeUnavailable name="Events" /> }))
);

const RemoteBookingApp = React.lazy(() =>
  import('mfe_booking/BookingApp')
    .then((m) => ({ default: getRemoteComponent<BookingAppProps>(m, 'BookingApp') }))
    .catch(() => ({ default: () => <MfeUnavailable name="Booking" /> }))
);

const RemotePaymentApp = React.lazy(() =>
  import('mfe_payment/PaymentApp')
    .then((m) => ({ default: getRemoteComponent<PaymentAppProps>(m, 'PaymentApp') }))
    .catch(() => ({ default: () => <MfeUnavailable name="Payments" /> }))
);

const RemoteTicketsApp = React.lazy(() =>
  import('mfe_tickets/TicketsApp')
    .then((m) => ({ default: getRemoteComponent<TicketsAppProps>(m, 'TicketsApp') }))
    .catch(() => ({ default: () => <MfeUnavailable name="Tickets" /> }))
);

// ── Shared UI pieces ──────────────────────────────────────────────────────────
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

function MfeFallback({ label }: { label: string }) {
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
      <Box
        sx={{
          width: 32, height: 32,
          border: '3px solid',
          borderColor: 'divider',
          borderTopColor: 'primary.main',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          '@keyframes spin': { to: { transform: 'rotate(360deg)' } },
        }}
      />
      <Typography variant="body2">Loading {label}…</Typography>
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

// ── Role guard ────────────────────────────────────────────────────────────────
function ProtectedRoute({
  allowedRoles,
  children,
}: {
  allowedRoles: string[];
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const role = user?.primaryRole ?? '';
  if (!allowedRoles.includes(role)) {
    return (
      <Box
        component="main"
        sx={{
          minHeight: 'calc(100vh - 64px)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 2, px: 3,
        }}
      >
        <Typography fontSize={48} lineHeight={1}>🔒</Typography>
        <Typography variant="h5" fontWeight={700}>Access Denied</Typography>
        <Alert severity="error" sx={{ maxWidth: 420 }}>
          You don't have permission to view this page.
        </Alert>
        <Button variant="outlined" onClick={() => { window.location.href = '/'; }}>
          Go to Home
        </Button>
      </Box>
    );
  }
  return <>{children}</>;
}

// ── Wrappers ──────────────────────────────────────────────────────────────────
function SponsorWrapper() {
  const { user } = useAuth();
  return (
    <React.Suspense fallback={<MfeFallback label="Sponsor Portal" />}>
      <RemoteSponsorApp firstName={user?.name.split(' ')[0]} />
    </React.Suspense>
  );
}

function ManageWrapper() {
  const { token } = useAuth();
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);
  const manageIndex = segments.lastIndexOf('manage');
  const page = manageIndex >= 0 ? segments[manageIndex + 1] : undefined;
  const id   = manageIndex >= 0 ? segments[manageIndex + 2] : undefined;
  return (
    <React.Suspense fallback={<MfeFallback label="Event Manager" />}>
      <RemoteManageRoutes token={token} page={page} id={id} />
    </React.Suspense>
  );
}

function AdminWrapper() {
  const { token, user } = useAuth();
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);
  const adminIndex = segments.lastIndexOf('admin');
  const page = adminIndex >= 0 ? segments[adminIndex + 1] : undefined;
  return (
    <React.Suspense fallback={<MfeFallback label="Admin Panel" />}>
      <RemoteAdminRoutes token={token} page={page} role={user?.primaryRole} />
    </React.Suspense>
  );
}

// ── App shell ─────────────────────────────────────────────────────────────────
function AppShell() {
  const { isLoading, user, isPending, token } = useAuth();
  const { name: societyName, city } = useSociety();

  useEffect(() => {
    document.title = `${societyName} Events`;
  }, [societyName]);

  if (isLoading) return <LoadingScreen />;

  if (!user) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/forgot-password"  element={<ForgotPassword />} />
          <Route path="/mobile-login"     element={<MobileLogin />} />
          <Route path="/phone-register"   element={<PhoneRegister />} />
          <Route path="*" element={
            <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
              <Nav />
              <Box sx={{ flex: 1 }}><Landing /></Box>
              <Footer />
            </Box>
          } />
        </Routes>
      </BrowserRouter>
    );
  }

  if (isPending) {
    return (
      <BrowserRouter>
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <Nav />
          <Box sx={{ flex: 1 }}><PendingApproval /></Box>
          <Footer />
        </Box>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Nav />
        <Box sx={{ flex: 1 }}>
          <Routes>
            <Route path="/"        element={<Home />} />
            <Route path="/profile" element={<Profile />} />

            <Route path="/events/*" element={
              <React.Suspense fallback={<MfeFallback label="Events" />}>
                <RemoteEventsApp societyName={societyName} city={city} token={token} />
              </React.Suspense>
            } />

            <Route path="/tickets/*" element={
              <React.Suspense fallback={<MfeFallback label="My Tickets" />}>
                <RemoteTicketsApp token={token} />
              </React.Suspense>
            } />

            <Route path="/registrations/*" element={
              <React.Suspense fallback={<MfeFallback label="My Registrations" />}>
                <RemoteBookingApp token={token} />
              </React.Suspense>
            } />

            <Route path="/checkout/*" element={
              <React.Suspense fallback={<MfeFallback label="Checkout" />}>
                <RemotePaymentApp token={token} />
              </React.Suspense>
            } />

            <Route path="/payments/*" element={
              <React.Suspense fallback={<MfeFallback label="Payments" />}>
                <RemotePaymentApp token={token} />
              </React.Suspense>
            } />

            <Route path="/manage/*" element={
              <ProtectedRoute allowedRoles={['admin', 'committee_member']}>
                <ManageWrapper />
              </ProtectedRoute>
            } />
            <Route path="/admin/*" element={
              <ProtectedRoute allowedRoles={['admin', 'committee_member']}>
                <AdminWrapper />
              </ProtectedRoute>
            } />

            <Route path="/sponsor"    element={<SponsorWrapper />} />
            <Route path="/scanner"    element={<Placeholder label="QR Scanner MFE — Security Guard" />} />
            <Route path="/entry-log"  element={<Placeholder label="Entry Log MFE — Security Guard" />} />
            <Route path="*"           element={<Placeholder label="404 — Page not found" />} />
          </Routes>
        </Box>
        <Footer />
      </Box>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <UserServiceProvider>
          <SocietyProvider>
            <AppShell />
          </SocietyProvider>
        </UserServiceProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
