import React, { useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Container, Divider,
  InputAdornment, Stack, TextField, Typography,
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import LockIcon from '@mui/icons-material/Lock';
import EmailIcon from '@mui/icons-material/Email';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Link, useNavigate } from 'react-router-dom';
import { PhoneInputField } from '../components/PhoneInputField';

type Step = 'form' | 'otp' | 'success';

const OTP_API = '/api/otp';

interface FormData {
  username: string;
  password: string;
  confirmPassword: string;
  phone: string;
  name: string;
  email: string;
}

const INITIAL: FormData = {
  username: '', password: '', confirmPassword: '',
  phone: '', name: '', email: '',
};

export function PhoneRegister() {
  const navigate = useNavigate();

  const [step,    setStep]   = useState<Step>('form');
  const [form,    setForm]   = useState<FormData>(INITIAL);
  const [otp,     setOtp]    = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]  = useState('');
  const [masked,  setMasked] = useState('');

  const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  // ── Validation ────────────────────────────────────────────────────────────
  function validate(): string {
    if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(form.username))
      return 'Username: 3–50 chars — letters, digits, _ . - only';
    if (form.password.length < 8)
      return 'Password must be at least 8 characters';
    if (form.password === form.password.toLowerCase())
      return 'Password must contain at least one uppercase letter';
    if (!/\d/.test(form.password))
      return 'Password must contain at least one digit';
    if (form.password !== form.confirmPassword)
      return 'Passwords do not match';
    if (!/^\+[1-9]\d{6,14}$/.test(form.phone))
      return 'Please enter a complete mobile number';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      return 'Enter a valid email address or leave it blank';
    return '';
  }

  // ── Step 1: send OTP ──────────────────────────────────────────────────────
  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const err = validate();
    if (err) { setError(err); return; }

    setLoading(true);
    try {
      const resp = await fetch(`${OTP_API}/register/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: form.phone.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.detail ?? 'Failed to send OTP. Please try again.');
        return;
      }
      setMasked(data.phone_masked ?? form.phone);
      setStep('otp');
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: confirm OTP + create account ──────────────────────────────────
  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(otp.trim())) {
      setError('OTP must be exactly 6 digits');
      return;
    }
    setLoading(true);
    try {
      const resp = await fetch(`${OTP_API}/register/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone:    form.phone.trim(),
          otp:      otp.trim(),
          username: form.username.trim(),
          password: form.password,
          name:     form.name.trim() || form.username.trim(),
          email:    form.email.trim() || undefined,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.detail ?? 'Registration failed. Please try again.');
        return;
      }
      setStep('success');
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)',
          display: 'flex', alignItems: 'center', py: 6, px: 2,
        }}
      >
        <Container maxWidth="xs">
          <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 4, boxShadow: 8, textAlign: 'center' }}>
            <Typography fontSize={52} mb={2}>🎉</Typography>
            <Typography variant="h5" fontWeight={800} mb={1}>Registration Submitted!</Typography>
            <Typography color="text.secondary" fontSize={14} mb={3}>
              Your account is pending committee approval. You'll be notified once activated.
              This typically takes less than 24 hours.
            </Typography>
            <Alert severity="info" sx={{ mb: 3, textAlign: 'left' }}>
              <strong>Account recovery:</strong> If you lose phone access, use the
              username + password you just set to log in via the standard login page,
              or contact the committee admin.
            </Alert>
            <Button
              variant="contained"
              fullWidth
              size="large"
              onClick={() => navigate('/mobile-login', { replace: true })}
              sx={{ fontWeight: 700, bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}
            >
              Sign In with Mobile OTP
            </Button>
            <Button
              variant="text"
              fullWidth
              size="small"
              onClick={() => navigate('/', { replace: true })}
              sx={{ mt: 1, color: 'text.secondary' }}
            >
              Go to Home
            </Button>
          </Box>
        </Container>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)',
        display: 'flex', alignItems: 'flex-start', py: 6, px: 2,
      }}
    >
      <Container maxWidth="xs">
        <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: { xs: 3, sm: 4 }, boxShadow: 8 }}>
          <Button
            component={Link} to="/"
            startIcon={<ArrowBackIcon />}
            size="small" sx={{ mb: 2, color: 'text.secondary' }}
          >
            Back
          </Button>

          <Typography fontSize={36} textAlign="center" mb={1}>📱</Typography>
          <Typography variant="h5" fontWeight={800} textAlign="center" mb={0.5}>
            {step === 'form' ? 'Register with Phone' : 'Verify Phone Number'}
          </Typography>
          <Typography color="text.secondary" textAlign="center" fontSize={13} mb={3}>
            {step === 'form'
              ? 'Create an account using your mobile number. Your account requires committee approval.'
              : `Enter the 6-digit OTP sent to ${masked}`}
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          {step === 'form' ? (
            <Box component="form" onSubmit={handleSendOtp}>
              <Stack spacing={2}>
                {/* Mandatory */}
                <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase">
                  Required
                </Typography>
                <TextField
                  label="Username"
                  value={form.username}
                  onChange={set('username')}
                  fullWidth required autoFocus
                  helperText="3–50 chars: letters, digits, _ . - only"
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><PersonIcon color="action" /></InputAdornment>,
                  }}
                />
                <PhoneInputField
                  value={form.phone}
                  onChange={(e164) => setForm((f) => ({ ...f, phone: e164 }))}
                  required
                />
                <TextField
                  label="Password"
                  type="password"
                  value={form.password}
                  onChange={set('password')}
                  fullWidth required
                  helperText="Min 8 chars, one uppercase, one digit"
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><LockIcon color="action" /></InputAdornment>,
                  }}
                />
                <TextField
                  label="Confirm Password"
                  type="password"
                  value={form.confirmPassword}
                  onChange={set('confirmPassword')}
                  fullWidth required
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><LockIcon color="action" /></InputAdornment>,
                  }}
                />

                <Divider />

                {/* Optional */}
                <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase">
                  Optional
                </Typography>
                <TextField
                  label="Display Name"
                  value={form.name}
                  onChange={set('name')}
                  fullWidth
                  placeholder="Your full name"
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><PersonIcon color="action" /></InputAdornment>,
                  }}
                />
                <TextField
                  label="Email Address"
                  type="email"
                  value={form.email}
                  onChange={set('email')}
                  fullWidth
                  helperText="Enables email notifications and Google login linkage"
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><EmailIcon color="action" /></InputAdornment>,
                  }}
                />

                <Button
                  type="submit"
                  variant="contained"
                  fullWidth size="large"
                  disabled={loading}
                  sx={{ fontWeight: 700, py: 1.5, bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}
                >
                  {loading ? <CircularProgress size={24} color="inherit" /> : 'Send OTP to Verify Phone'}
                </Button>
              </Stack>
            </Box>
          ) : (
            <Box component="form" onSubmit={handleConfirm}>
              <Stack spacing={2}>
                <TextField
                  label="6-digit OTP"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  fullWidth required autoFocus
                  inputProps={{ maxLength: 6, inputMode: 'numeric', pattern: '[0-9]*' }}
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><LockIcon color="action" /></InputAdornment>,
                  }}
                />
                <Button
                  type="submit"
                  variant="contained"
                  fullWidth size="large"
                  disabled={loading || otp.length !== 6}
                  sx={{ fontWeight: 700, py: 1.5, bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}
                >
                  {loading ? <CircularProgress size={24} color="inherit" /> : 'Confirm & Create Account'}
                </Button>
                <Button
                  variant="text" fullWidth size="small"
                  onClick={() => { setStep('form'); setOtp(''); setError(''); }}
                  sx={{ color: 'text.secondary' }}
                >
                  Back to form
                </Button>
              </Stack>
            </Box>
          )}

          <Typography mt={3} textAlign="center" fontSize={13} color="text.secondary">
            Already registered?{' '}
            <Link to="/mobile-login" style={{ color: '#6366f1', fontWeight: 600 }}>
              Sign in with OTP
            </Link>
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}
