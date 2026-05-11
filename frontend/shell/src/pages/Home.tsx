import React from 'react';
import { Link } from 'react-router-dom';
import {
  Accordion, AccordionDetails, AccordionSummary,
  Box, Button, Card, CardActionArea, CardContent,
  Container, Grid, Typography,
} from '@mui/material';
import EventIcon from '@mui/icons-material/Event';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import PaymentsIcon from '@mui/icons-material/Payments';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useAuth } from '../contexts/AuthContext';
import { useSociety } from '../contexts/SocietyContext';

const MFE_SLOTS = [
  {
    icon: <EventIcon sx={{ fontSize: 28 }} />,
    title: 'Events',
    desc: 'Browse upcoming festivals, sports days, wellness sessions and more.',
    path: '/events',
    cta: 'Browse Events',
    color: '#6366f1',
  },
  {
    icon: <ConfirmationNumberIcon sx={{ fontSize: 28 }} />,
    title: 'My Tickets',
    desc: 'View your registrations and show the QR code at the gate.',
    path: '/tickets',
    cta: 'View Tickets',
    color: '#10b981',
  },
  {
    icon: <PaymentsIcon sx={{ fontSize: 28 }} />,
    title: 'Payments',
    desc: 'Check payment history and manage refunds.',
    path: '/payments',
    cta: 'Payment History',
    color: '#f59e0b',
  },
];

const ROLE_WELCOME: Record<string, string> = {
  admin:            'You have full admin access.',
  committee_member: 'You can create and manage events.',
  resident:         'Register for events and track your tickets.',
  security_guard:   'Use the QR scanner at the entry gate.',
};

const DEBUG_ROWS = (user: ReturnType<typeof useAuth>['user']) => [
  ['Name',            user?.name],
  ['Email',           user?.email],
  ['Sub (keycloak)',  user?.sub],
  ['Roles',           user?.roles.join(', ')],
  ['Primary role',    user?.primaryRole],
] as const;

export function Home() {
  const { user }       = useAuth();
  const { name, city } = useSociety();
  const firstName      = user?.name.split(' ')[0] ?? 'there';
  const roleHint       = ROLE_WELCOME[user?.primaryRole ?? 'resident'];

  return (
    <Box component="main">

      {/* Hero */}
      <Box sx={{ background: 'linear-gradient(135deg,#1e293b 0%,#312e81 100%)', color: '#fff', py: { xs: 5, md: 8 }, px: 3 }}>
        <Container maxWidth="lg">
          <Typography sx={{ fontSize: 13, color: '#a5b4fc', fontWeight: 500, mb: 1, letterSpacing: 0.5 }}>
            {name} · {city}
          </Typography>
          <Typography variant="h4" fontWeight={800} sx={{ lineHeight: 1.15, mb: 1.25, fontSize: { xs: 26, md: 36 } }}>
            Welcome back, {firstName} 👋
          </Typography>
          <Typography sx={{ fontSize: 16, color: '#c7d2fe', mb: 3.5 }}>{roleHint}</Typography>
          <Button
            component={Link}
            to="/events"
            variant="contained"
            size="large"
            sx={{ fontWeight: 600, px: 3.5, bgcolor: 'primary.main', '&:hover': { bgcolor: '#4f46e5' } }}
          >
            Browse Events →
          </Button>
        </Container>
      </Box>

      {/* MFE cards */}
      <Box sx={{ py: 6, px: { xs: 2, sm: 3 } }}>
        <Container maxWidth="lg">
          <Typography variant="h6" fontWeight={700} sx={{ mb: 3 }}>
            What would you like to do?
          </Typography>
          <Grid container spacing={2.5}>
            {MFE_SLOTS.map((s) => (
              <Grid item xs={12} sm={6} md={4} key={s.title}>
                <Card
                  variant="outlined"
                  sx={{
                    height: '100%',
                    transition: 'box-shadow 0.2s, transform 0.2s',
                    '&:hover': { boxShadow: 4, transform: 'translateY(-2px)' },
                  }}
                >
                  <CardActionArea
                    component={Link}
                    to={s.path}
                    sx={{ height: '100%', p: 3, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1.5 }}
                  >
                    <Box sx={{ width: 48, height: 48, borderRadius: 1.5, bgcolor: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                      {s.icon}
                    </Box>
                    <Typography fontWeight={700} fontSize={17}>{s.title}</Typography>
                    <Typography fontSize={14} color="text.secondary" sx={{ flex: 1 }}>{s.desc}</Typography>
                    <Typography fontSize={13} fontWeight={600} color="primary.main">{s.cta} →</Typography>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Debug panel */}
      <Box sx={{ bgcolor: '#f0fdf4', borderTop: '1px solid #bbf7d0', py: 2 }}>
        <Container maxWidth="lg">
          <Accordion disableGutters elevation={0} sx={{ bgcolor: 'transparent' }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: '#166534' }} />} sx={{ px: 0 }}>
              <Typography fontSize={13} fontWeight={600} color="#166534">
                🔑 Token details (dev only)
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 0, pt: 0 }}>
              {DEBUG_ROWS(user).map(([label, val]) => (
                <Box key={label} sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mb: 0.75 }}>
                  <Typography fontSize={13} color="text.secondary" sx={{ minWidth: 160, flexShrink: 0 }}>{label}</Typography>
                  <Box component="code" sx={{ bgcolor: '#dcfce7', px: 0.75, py: 0.25, borderRadius: 0.5, fontSize: 12, fontFamily: "'Fira Code', monospace", color: '#166534', wordBreak: 'break-all' }}>
                    {val}
                  </Box>
                </Box>
              ))}
            </AccordionDetails>
          </Accordion>
        </Container>
      </Box>

    </Box>
  );
}
