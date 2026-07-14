import React, { useState } from 'react';
import { Alert, Box, Button, CircularProgress, Container, Paper, Step, StepLabel, Stepper, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuth } from '../contexts/AuthContext';
import { useUserService } from '../contexts/UserServiceContext';
import { PhoneInputField } from '../components/PhoneInputField';
import { ProfileAvatar } from '../components/ProfileAvatar';

const STEPS = [
  { label: 'Registered', icon: <CheckCircleIcon />, done: true },
  { label: 'Admin Review', icon: <HourglassTopIcon />, done: false },
  { label: 'Access Granted', icon: <VerifiedUserIcon />, done: false },
];

// ── Optional phone capture — committee may use it to reach out during review ───
function PhonePrompt() {
  const { dbUser, updateProfile } = useUserService();
  const [phone,  setPhone]  = useState('');
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  if (dbUser?.phone || saved) {
    return (
      <Alert severity="success" icon={<CheckCircleIcon />} sx={{ mb: 4, textAlign: 'left' }}>
        Phone number on file: <strong>{dbUser?.phone ?? phone}</strong>
      </Alert>
    );
  }

  const handleSave = async () => {
    if (!phone) return;
    setError(null);
    setSaving(true);
    try {
      await updateProfile({ phone });
      setSaved(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save phone number');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2, mb: 4, textAlign: 'left' }}>
      <Typography fontSize={12} color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing={0.6} mb={1.5}>
        Add a phone number (optional)
      </Typography>
      <Typography fontSize={12} color="text.secondary" mb={1.5}>
        Helps the committee reach you during review.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError(null)}>{error}</Alert>}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <PhoneInputField value={phone} onChange={setPhone} size="small" />
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!phone || saving}
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : null}
          sx={{ fontWeight: 700, mt: 0.25, flexShrink: 0 }}
        >
          Save
        </Button>
      </Box>
    </Box>
  );
}

export function PendingApproval() {
  const { user, logout } = useAuth();
  const firstName = user?.name.split(' ')[0] ?? 'there';

  return (
    <Box
      sx={{
        minHeight: 'calc(100vh - 64px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 3,
      }}
    >
      <Container maxWidth="sm">
        <Paper variant="outlined" sx={{ p: { xs: 3, md: 5 }, borderRadius: 2, textAlign: 'center' }}>

          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
            <ProfileAvatar size={72} />
          </Box>

          <Typography variant="h5" fontWeight={700} mb={1}>
            Almost there, {firstName}!
          </Typography>
          <Typography color="text.secondary" fontSize={15} mb={4}>
            Your account has been created. A committee member will review and
            activate your membership — usually within 24 hours.
          </Typography>

          {/* Progress steps */}
          <Stepper activeStep={1} sx={{ mb: 4 }}>
            {STEPS.map((s) => (
              <Step key={s.label} completed={s.done}>
                <StepLabel>{s.label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          {/* User details box */}
          <Box sx={{ bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2, mb: 4, textAlign: 'left' }}>
            <Typography fontSize={12} color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing={0.6} mb={1}>
              Your Registration Details
            </Typography>
            {[['Name', user?.name], ['Email', user?.email]].map(([label, val]) => (
              <Box key={label} sx={{ display: 'flex', gap: 1.5, mb: 0.5 }}>
                <Typography fontSize={13} color="text.secondary" sx={{ minWidth: 60 }}>{label}</Typography>
                <Typography fontSize={13} fontWeight={500}>{val}</Typography>
              </Box>
            ))}
          </Box>

          <PhonePrompt />

          <Typography fontSize={13} color="text.secondary" mb={3}>
            You'll receive an email at <strong>{user?.email}</strong> once your account is activated.
            If you haven't heard back in 48 hours, contact the society office.
          </Typography>

          <Button
            variant="outlined"
            startIcon={<LogoutIcon />}
            onClick={logout}
            color="inherit"
            size="small"
          >
            Sign Out
          </Button>

        </Paper>
      </Container>
    </Box>
  );
}
