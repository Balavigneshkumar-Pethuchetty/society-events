import React, { useState } from 'react';
import {
  Box, Button, Container, TextField, Typography, Alert, CircularProgress,
} from '@mui/material';
import LockResetIcon from '@mui/icons-material/LockReset';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useAuth } from '../contexts/AuthContext';
import { userService } from '../api/userService';

export function ForgotPassword() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('loading');
    setErrorMsg('');
    try {
      await userService.forgotPassword(email.trim());
      setStatus('success');
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
              <LockResetIcon sx={{ fontSize: 30, color: '#6366f1' }} />
            </Box>
            <Typography variant="h5" fontWeight={800} color="#fff">Forgot Password?</Typography>
            <Typography variant="body2" sx={{ color: '#94a3b8', mt: 0.75 }}>
              Enter your registered email and we'll send you a reset link.
            </Typography>
          </Box>

          {status === 'success' ? (
            <Box sx={{ textAlign: 'center' }}>
              <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }}>
                Password reset email sent! Check your inbox at <strong>{email}</strong>.
              </Alert>
              <Typography variant="body2" sx={{ color: '#94a3b8', mb: 3 }}>
                Didn't receive it? Check your spam folder or try again in a few minutes.
              </Typography>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<ArrowBackIcon />}
                onClick={() => login()}
                sx={{ color: '#a5b4fc', borderColor: 'rgba(165,180,252,0.4)' }}
              >
                Back to Sign In
              </Button>
            </Box>
          ) : (
            <Box component="form" onSubmit={handleSubmit}>
              {status === 'error' && (
                <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2 }}>
                  {errorMsg}
                </Alert>
              )}

              <TextField
                fullWidth
                label="Email Address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                disabled={status === 'loading'}
                sx={{
                  mb: 2.5,
                  '& .MuiOutlinedInput-root': {
                    color: '#fff',
                    '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' },
                    '&:hover fieldset': { borderColor: 'rgba(99,102,241,0.5)' },
                    '&.Mui-focused fieldset': { borderColor: '#6366f1' },
                  },
                  '& .MuiInputLabel-root': { color: '#94a3b8' },
                  '& .MuiInputLabel-root.Mui-focused': { color: '#6366f1' },
                }}
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={status === 'loading' || !email.trim()}
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
                  : 'Send Reset Link'}
              </Button>

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
          )}
        </Box>
      </Container>
    </Box>
  );
}
