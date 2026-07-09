import React, { useState } from 'react';
import {
  Alert, Box, Button, CircularProgress,
  InputAdornment, Stack, TextField, Typography,
} from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import LockIcon from '@mui/icons-material/Lock';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PhoneInputField } from '../components/PhoneInputField';

type Step = 'phone' | 'otp';

const OTP_API  = '/api/otp';

// Matches the Keycloak custom login theme (~/auth-service/keycloak/themes/society-events)
// so the OTP flow doesn't look like a different product mid-login. PhoneInputField and the
// OTP TextField are plain MUI components with no dark-mode styling of their own, so this
// nested ThemeProvider is what actually re-skins them — not sx overrides on each field.
const darkAuthTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#6366f1' },
    background: { paper: 'rgba(30, 41, 59, 0.94)' },
    text: { primary: '#f8fafc', secondary: '#94a3b8' },
  },
  shape: { borderRadius: 8 },
  typography: { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
  components: {
    MuiButton: { styleOverrides: { root: { textTransform: 'none' } } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(30, 41, 59, 0.94)',
          '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.12)' },
          '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.24)' },
          '&.Mui-focused fieldset': { borderColor: '#6366f1', borderWidth: 2 },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: { backgroundColor: 'rgba(30, 41, 59, 0.94)' },
      },
    },
  },
});

const STATS: [string, string][] = [
  ['30+', 'Events per year'],
  ['500+', 'Resident families'],
  ['24h', 'Approval turnaround'],
];
const CATEGORIES = ['Festival', 'Sports', 'Wellness', 'Governance'];

export function MobileLogin() {
  const { loginWithOTPToken } = useAuth();
  const navigate = useNavigate();

  const [step,        setStep]        = useState<Step>('phone');
  const [phone,       setPhone]       = useState('');
  const [otp,         setOtp]         = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [expiresIn,   setExpiresIn]   = useState(300);

  // ── Step 1: request OTP ───────────────────────────────────────────────────
  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
      setError('Enter a complete mobile number');
      return;
    }
    setLoading(true);
    try {
      const resp = await fetch(`${OTP_API}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.detail ?? 'Failed to send OTP. Please try again.');
        return;
      }
      setMaskedPhone(data.phone_masked ?? phone);
      setExpiresIn(data.expires_in ?? 300);
      setStep('otp');
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: verify OTP ────────────────────────────────────────────────────
  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(otp.trim())) {
      setError('OTP must be exactly 6 digits');
      return;
    }
    setLoading(true);
    try {
      const resp = await fetch(`${OTP_API}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), otp: otp.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.detail ?? 'OTP verification failed. Please try again.');
        return;
      }

      // Hand tokens to AuthContext — triggers sync + navigation via App.tsx
      loginWithOTPToken(data.access_token, data.session_token, data.expires_in ?? 300);

      // Sync user with User Service so local DB record is up to date
      await fetch('/api/users/users/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.access_token}` },
      }).catch(() => {/* non-fatal */});

      navigate('/', { replace: true });
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  const mins = Math.floor(expiresIn / 60);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: `
          radial-gradient(circle at 12% 18%, rgba(16, 185, 129, 0.16), transparent 28rem),
          radial-gradient(circle at 86% 14%, rgba(99, 102, 241, 0.26), transparent 34rem),
          linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)
        `,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        py: 6,
        px: 2,
      }}
    >
      <Box
        sx={{
          width: 'min(1120px, 100%)',
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.1fr) minmax(360px, 440px)' },
          gap: { xs: 4, md: 8 },
          alignItems: 'center',
        }}
      >
        {/* ── Left: branding hero (matches the Keycloak sign-in page) ── */}
        <Box sx={{ textAlign: { xs: 'center', md: 'left' }, minWidth: 0 }}>
          <Typography sx={{ fontSize: { xs: 44, md: 64 }, lineHeight: 1, mb: '22px' }}>🏛</Typography>
          <Typography sx={{ color: '#a5b4fc', fontSize: '0.92rem', fontWeight: 700, letterSpacing: '0.5px', mb: '12px' }}>
            Resident Events &amp; Community Portal
          </Typography>
          <Typography sx={{ color: '#fff', fontWeight: 900, fontSize: { xs: '2.1rem', md: '3.4rem' }, lineHeight: 1.05 }}>
            GM Global Techies Town
          </Typography>
          <Typography sx={{
            color: '#c7d2fe', fontSize: { xs: '1rem', md: '1.18rem' }, lineHeight: 1.7,
            mt: '22px', maxWidth: 540, mx: { xs: 'auto', md: 0 },
          }}>
            Browse society events, reserve seats, and manage community access with one secure account.
          </Typography>

          <Box sx={{
            display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            maxWidth: 620, mx: { xs: 'auto', md: 0 }, mt: '42px', py: '22px',
            bgcolor: 'rgba(30, 41, 59, 0.74)', border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 2, boxShadow: '0 16px 40px rgba(15, 23, 42, 0.28)',
          }}>
            {STATS.map(([n, l], i) => (
              <Box key={n} sx={{
                textAlign: 'center', px: '18px',
                borderLeft: i > 0 ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
              }}>
                <Typography sx={{ color: '#6366f1', fontWeight: 900, fontSize: { xs: '1.4rem', md: '2.2rem' }, lineHeight: 1 }}>
                  {n}
                </Typography>
                <Typography sx={{
                  color: 'rgba(148, 163, 184, 0.92)', fontSize: '0.74rem', fontWeight: 700,
                  letterSpacing: '0.6px', textTransform: 'uppercase', mt: '8px',
                }}>
                  {l}
                </Typography>
              </Box>
            ))}
          </Box>

          <Box sx={{
            display: { xs: 'none', sm: 'flex' }, flexWrap: 'wrap', gap: '10px', mt: '28px',
            justifyContent: { xs: 'center', md: 'flex-start' },
          }}>
            {CATEGORIES.map(c => (
              <Box key={c} sx={{
                display: 'inline-flex', alignItems: 'center', minHeight: 36, px: '14px',
                bgcolor: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.18)',
                borderRadius: 2, color: '#e0e7ff', fontSize: '0.88rem', fontWeight: 700,
              }}>
                {c}
              </Box>
            ))}
          </Box>
        </Box>

        {/* ── Right: auth panel ── */}
        <Box sx={{
          width: '100%', p: { xs: '28px 22px', sm: '34px' },
          bgcolor: 'rgba(15, 23, 42, 0.88)', border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: 2, boxShadow: '0 24px 64px rgba(0, 0, 0, 0.42)',
          backdropFilter: 'blur(16px)', position: 'relative', overflow: 'hidden',
          '&::before': {
            content: '""', position: 'absolute', inset: '0 0 auto', height: 4,
            background: 'linear-gradient(90deg, #6366f1, #10b981, #0ea5e9)',
          },
        }}>
          <ThemeProvider theme={darkAuthTheme}>
            <Button
              component={Link}
              to="/"
              startIcon={<ArrowBackIcon />}
              size="small"
              sx={{ mb: 2, color: '#94a3b8' }}
            >
              Back
            </Button>

            <Box sx={{ display: 'flex', gap: '14px', alignItems: 'center', mb: '26px' }}>
              <Box sx={{
                width: 48, height: 48, display: 'grid', placeItems: 'center', flexShrink: 0,
                background: 'linear-gradient(135deg, #6366f1, #4f46e5)', borderRadius: 2,
                boxShadow: '0 8px 22px rgba(99, 102, 241, 0.35)', fontSize: '1.45rem',
              }}>
                📱
              </Box>
              <Box>
                <Typography sx={{
                  color: '#94a3b8', fontSize: '0.78rem', fontWeight: 700,
                  letterSpacing: '0.5px', textTransform: 'uppercase', mb: '4px',
                }}>
                  Society Events
                </Typography>
                <Typography sx={{ color: '#f8fafc', fontSize: '1.28rem', fontWeight: 800, lineHeight: 1.2 }}>
                  {step === 'phone' ? 'Sign in with Mobile OTP' : 'Verify OTP'}
                </Typography>
              </Box>
            </Box>

            <Typography sx={{ color: '#94a3b8', fontSize: 14, mb: 3 }}>
              {step === 'phone'
                ? 'Enter your registered mobile number to receive an OTP'
                : `Enter the 6-digit OTP sent to ${maskedPhone} (valid ${mins} min)`}
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                {error}
              </Alert>
            )}

            {step === 'phone' ? (
              <Box component="form" onSubmit={handleSendOtp}>
                <Stack spacing={2}>
                  <PhoneInputField
                    value={phone}
                    onChange={setPhone}
                    label="Mobile Number"
                    size="medium"
                    required
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    fullWidth
                    size="large"
                    disabled={loading}
                    sx={{ fontWeight: 800, py: 1.5, bgcolor: '#6366f1', boxShadow: '0 4px 20px rgba(99, 102, 241, 0.5)', '&:hover': { bgcolor: '#4f46e5' } }}
                  >
                    {loading ? <CircularProgress size={24} color="inherit" /> : 'Send OTP'}
                  </Button>
                </Stack>
              </Box>
            ) : (
              <Box component="form" onSubmit={handleVerifyOtp}>
                <Stack spacing={2}>
                  <TextField
                    label="6-digit OTP"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    fullWidth
                    required
                    autoFocus
                    inputProps={{ maxLength: 6, inputMode: 'numeric', pattern: '[0-9]*' }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <LockIcon sx={{ color: '#94a3b8' }} />
                        </InputAdornment>
                      ),
                    }}
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    fullWidth
                    size="large"
                    disabled={loading || otp.length !== 6}
                    sx={{ fontWeight: 800, py: 1.5, bgcolor: '#6366f1', boxShadow: '0 4px 20px rgba(99, 102, 241, 0.5)', '&:hover': { bgcolor: '#4f46e5' } }}
                  >
                    {loading ? <CircularProgress size={24} color="inherit" /> : 'Verify & Sign In'}
                  </Button>
                  <Button
                    variant="text"
                    fullWidth
                    size="small"
                    onClick={() => { setStep('phone'); setOtp(''); setError(''); }}
                    sx={{ color: '#94a3b8' }}
                  >
                    Change number / Resend OTP
                  </Button>
                </Stack>
              </Box>
            )}

            <Typography mt={3} textAlign="center" fontSize={13} sx={{ color: '#94a3b8' }}>
              Don't have an account?{' '}
              <Link to="/phone-register" style={{ color: '#a5b4fc', fontWeight: 700, textDecoration: 'none' }}>
                Register with phone
              </Link>
            </Typography>
            <Typography mt={1} textAlign="center" fontSize={13} sx={{ color: '#94a3b8' }}>
              Or use{' '}
              <Link to="/" style={{ color: '#a5b4fc', textDecoration: 'none' }}>
                Google login
              </Link>
            </Typography>
          </ThemeProvider>
        </Box>
      </Box>
    </Box>
  );
}
