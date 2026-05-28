import { Box, Typography } from '@mui/material';
import { EventFinance } from './pages/EventFinance';
import { ComplimentaryTickets } from './pages/ComplimentaryTickets';
import { VendorManagement } from './pages/VendorManagement';
import { RevenueDistribution } from './pages/RevenueDistribution';
import { TicketTypeSetup } from './pages/TicketTypeSetup';
import { FreeTokens } from './pages/FreeTokens';

function ComingSoon() {
  return (
    <Box component="main" sx={{ minHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.5, color: 'text.secondary' }}>
      <Typography fontSize={48} lineHeight={1}>🚧</Typography>
      <Typography variant="h5" color="text.primary">Event Manager MFE</Typography>
      <Typography variant="body2">This page is under construction.</Typography>
    </Box>
  );
}

interface ManageRoutesProps {
  // Routing decision is made by the shell's wrapper and passed as props,
  // avoiding any dependency on React Router context across the federation boundary.
  page?: string;
  id?: string;
}

export function ManageRoutes({ page, id: _id }: ManageRoutesProps) {
  if (page === 'finance')       return <EventFinance />;
  if (page === 'complimentary') return <ComplimentaryTickets />;
  if (page === 'vendors')       return <VendorManagement />;
  if (page === 'revenue')       return <RevenueDistribution />;
  if (page === 'tickets')       return <TicketTypeSetup />;
  if (page === 'tokens')        return <FreeTokens />;
  return <ComingSoon />;
}
