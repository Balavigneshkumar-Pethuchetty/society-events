import React from 'react';
import { Box, Button, Container, Paper, Step, StepLabel, Stepper, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuth } from '../contexts/AuthContext';

const STEPS = [
  { label: 'Registered', icon: <CheckCircleIcon />, done: true },
  { label: 'Admin Review', icon: <HourglassTopIcon />, done: false },
  { label: 'Access Granted', icon: <VerifiedUserIcon />, done: false },
];

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

          <Typography fontSize={56} lineHeight={1} mb={2}>⏳</Typography>

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
          <Box sx={{ bgcolor: 'grey.50', border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2, mb: 4, textAlign: 'left' }}>
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
