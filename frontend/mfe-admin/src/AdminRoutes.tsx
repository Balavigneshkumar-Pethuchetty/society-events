import React from 'react';
import { Box, Typography } from '@mui/material';
import { SponsorManagement } from './pages/SponsorManagement';
import { SponsorshipRefunds } from './pages/SponsorshipRefunds';
import { UserApproval } from './pages/UserApproval';

function ComingSoon() {
  return (
    <Box component="main" sx={{ minHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.5, color: 'text.secondary' }}>
      <Typography fontSize={48} lineHeight={1}>🚧</Typography>
      <Typography variant="h5" color="text.primary">Admin MFE</Typography>
      <Typography variant="body2">This page is under construction.</Typography>
    </Box>
  );
}

interface AdminRoutesProps {
  token?: string | null;
  onLogin?: () => void;
  // Routing decision is made by the shell's wrapper and passed as a prop,
  // avoiding any dependency on React Router context across the federation boundary.
  page?: string;
}

export function AdminRoutes({ token = null, onLogin, page }: AdminRoutesProps) {
  console.log('[AdminRoutes] render — page:', JSON.stringify(page), '| token present:', !!token);
  if (!page || page === 'users') {
    console.log('[AdminRoutes] → rendering UserApproval');
    return <UserApproval token={token} onLogin={onLogin} />;
  }
  if (page === 'sponsors') return <SponsorManagement />;
  if (page === 'refunds') return <SponsorshipRefunds />;
  console.log('[AdminRoutes] → rendering ComingSoon (unmatched page)');
  return <ComingSoon />;
}
