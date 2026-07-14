import React, { useState } from 'react';
import {
  Box, Button, Container, TextField, Typography, Alert, CircularProgress,
} from '@mui/material';
import PhoneIcon from '@mui/icons-material/Phone';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useAuth } from '../contexts/AuthContext';
import { userService, OtpChannel } from '../api/userService';
import { PhoneInputField } from '../components/PhoneInputField';
import { OtpChannelSelector } from '../components/OtpChannelSelector';

const darkChannelSx = {
  '& .MuiToggleButton-root': {
    color: '#94a3b8',
    borderColor: 'rgba(255,255,255,0.15)',
    '&.Mui-selected': { color: '#fff', bgcolor: 'rgba(99,102,241,0.25)', borderColor: '#6366f1' },
    '&.Mui-selected:hover': { bgcolor: 'rgba(99,102,241,0.35)' },
  },
};

const darkFieldSx = {
  '& .MuiOutlinedInput-root': {
    color: '#fff',
    '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' },
    '&:hover fieldset': { borderColor: 'rgba(99,102,241,0.5)' },
    '&.Mui-focused fieldset': { borderColor: '#6366f1' },
  },
  '& .MuiInputLabel-root': { color: '#94a3b8' },
  '& .MuiInputLabel-root.Mui-focused': { color: '#6366f1' },
  '& .MuiSelect-icon': { color: '#94a3b8' },
  '& .MuiFormHelperText-root': { color: '#64748b' },
};

// Login only — for residents who already have an account with a
// phone_verified=TRUE number on file. There's no signup path here; someone
// with no account (or an unverified number) is pointed back to
// Google/password sign-in + Profile phone verification instead.
export function PhoneLogin() {
  const { login, loginWithPhone } = useAuth();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [channel, setChannel] = useState<OtpChannel>('sms');
  const [code, setCode] = useState('');
  const [requestId, setRequestId] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await userService.phoneLogin.request(phone.trim(), channel);
      if (!res.ok || !res.request_id) {
        setErrorMsg(
          res.error === 'not_eligible'
            ? "No verified account found for this number. Sign in with Google/password and verify your phone under Profile first."
            : res.error === 'rate_limited' || res.error === 'cooldown'
              ? 'Please wait a moment before requesting another code.'
              : res.error || 'Could not send a login code. Please try again.',
        );
        setStatus('error');
        return;
      }
      setRequestId(res.request_id);
      setStep('code');
      setStatus('idle');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setStatus('error');
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await userService.phoneLogin.verify(requestId, code.trim());
      if (!res.verified || !res.access_token || !res.session_token) {
        setErrorMsg(
          res.status === 'expired' ? 'This code has expired. Please request a new one.'
          : res.status === 'locked' ? 'Too many incorrect attempts. Please request a new code.'
          : res.attempts_remaining !== null && res.attempts_remaining !== undefined
            ? `Incorrect code. ${res.attempts_remaining} attempt(s) remaining.`
            : 'Incorrect code. Please try again.',
        );
        setStatus('idle');
        return;
      }
      loginWithPhone(res.session_token, res.access_token);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setStatus('error');
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)',
        px: 2,
      }}
    >
      <Container maxWidth="xs">
        <Box
          sx={{
            bgcolor: '#1e293b',
            borderRadius: 3,
            p: { xs: 3, sm: 5 },
            boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            border: '1px solid rgba(99,102,241,0.2)',
          }}
        >
          <Box sx={{ textAlign: 'center', mb: 3.5 }}>
            <Box
              sx={{
                width: 60, height: 60, borderRadius: '50%',
                bgcolor: 'rgba(99,102,241,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                mx: 'auto', mb: 2,
              }}
            >
              <PhoneIcon sx={{ fontSize: 30, color: '#6366f1' }} />
            </Box>
            <Typography variant="h5" fontWeight={800} color="#fff">Sign in with Phone</Typography>
            <Typography variant="body2" sx={{ color: '#94a3b8', mt: 0.75 }}>
              {step === 'phone'
                ? 'For accounts with an already-verified phone number.'
                : `Enter the code sent to ${phone}`}
            </Typography>
          </Box>

          {errorMsg && (
            <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2 }}>
              {errorMsg}
            </Alert>
          )}

          {step === 'phone' ? (
            <Box component="form" onSubmit={handleRequestOtp}>
              <Box sx={{ mb: 2.5 }}>
                <PhoneInputField
                  value={phone}
                  onChange={setPhone}
                  label="Phone Number"
                  required
                  autoFocus
                  disabled={status === 'loading'}
                  helperText="Use the number registered with your account"
                  sx={darkFieldSx}
                />
              </Box>

              <OtpChannelSelector
                phone={phone}
                value={channel}
                onChange={setChannel}
                sx={darkChannelSx}
                captionColor="#64748b"
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={status === 'loading' || !phone.trim()}
                sx={{
                  py: 1.5, fontWeight: 700, fontSize: 15,
                  bgcolor: '#6366f1',
                  '&:hover': { bgcolor: '#4f46e5' },
                  '&:disabled': { bgcolor: 'rgba(99,102,241,0.4)' },
                  mb: 2,
                }}
              >
                {status === 'loading'
                  ? <><CircularProgress size={18} sx={{ mr: 1, color: '#fff' }} /> Sending…</>
                  : 'Send Code'}
              </Button>
            </Box>
          ) : (
            <Box component="form" onSubmit={handleVerifyOtp}>
              <TextField
                fullWidth
                label="Verification Code"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                autoFocus
                disabled={status === 'loading'}
                sx={{ mb: 1, ...darkFieldSx }}
              />
              <Typography variant="body2" sx={{ color: '#64748b', mb: 2.5 }}>
                {channel === 'telegram'
                  ? "Sent via Telegram — check your chat with the bot. It should arrive within seconds."
                  : "SMS delivery can occasionally take a few minutes depending on your carrier. If you don't receive a code, wait a bit before requesting another."}
              </Typography>

              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={status === 'loading' || !code.trim()}
                sx={{
                  py: 1.5, fontWeight: 700, fontSize: 15,
                  bgcolor: '#6366f1',
                  '&:hover': { bgcolor: '#4f46e5' },
                  '&:disabled': { bgcolor: 'rgba(99,102,241,0.4)' },
                  mb: 2,
                }}
              >
                {status === 'loading'
                  ? <><CircularProgress size={18} sx={{ mr: 1, color: '#fff' }} /> Verifying…</>
                  : 'Verify & Sign In'}
              </Button>
            </Box>
          )}

          <Button
            fullWidth
            variant="text"
            startIcon={<ArrowBackIcon />}
            onClick={() => login()}
            sx={{ color: '#94a3b8', '&:hover': { color: '#c7d2fe' } }}
          >
            Back to Sign In
          </Button>
        </Box>
      </Container>
    </Box>
  );
}
