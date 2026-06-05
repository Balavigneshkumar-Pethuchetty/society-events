import React, { useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Container,
  InputAdornment, Stack, TextField, Typography,
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PhoneInputField } from '../components/PhoneInputField';

type Step = 'phone' | 'otp';

const OTP_API  = '/api/otp';

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
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)',
        display: 'flex',
        alignItems: 'center',
        py: 6,
        px: 2,
      }}
    >
      <Container maxWidth="xs">
        <Box
          sx={{
            bgcolor: 'background.paper',
            borderRadius: 3,
            p: { xs: 3, sm: 4 },
            boxShadow: 8,
          }}
        >
          {/* Back link */}
          <Button
            component={Link}
            to="/"
            startIcon={<ArrowBackIcon />}
            size="small"
            sx={{ mb: 2, color: 'text.secondary' }}
          >
            Back
          </Button>

          <Typography fontSize={36} textAlign="center" mb={1}>📱</Typography>
          <Typography variant="h5" fontWeight={800} textAlign="center" mb={0.5}>
            Mobile OTP Login
          </Typography>
          <Typography color="text.secondary" textAlign="center" fontSize={14} mb={3}>
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
                  sx={{ fontWeight: 700, py: 1.5, bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}
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
                        <LockIcon color="action" />
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
                  sx={{ fontWeight: 700, py: 1.5, bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}
                >
                  {loading ? <CircularProgress size={24} color="inherit" /> : 'Verify & Sign In'}
                </Button>
                <Button
                  variant="text"
                  fullWidth
                  size="small"
                  onClick={() => { setStep('phone'); setOtp(''); setError(''); }}
                  sx={{ color: 'text.secondary' }}
                >
                  Change number / Resend OTP
                </Button>
              </Stack>
            </Box>
          )}

          <Typography mt={3} textAlign="center" fontSize={13} color="text.secondary">
            Don't have an account?{' '}
            <Link to="/phone-register" style={{ color: '#6366f1', fontWeight: 600 }}>
              Register with phone
            </Link>
          </Typography>
          <Typography mt={1} textAlign="center" fontSize={13} color="text.secondary">
            Or use{' '}
            <Link to="/" style={{ color: '#6366f1' }}>
              Google login
            </Link>
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}
