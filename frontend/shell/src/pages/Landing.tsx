import React from 'react';
import {
  Box, Button, Card, CardContent, Chip, Container,
  Divider, Grid, Stack, Typography,
} from '@mui/material';
import LoginIcon from '@mui/icons-material/Login';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import EventIcon from '@mui/icons-material/Event';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import GroupsIcon from '@mui/icons-material/Groups';
import SecurityIcon from '@mui/icons-material/Security';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import QrCodeIcon from '@mui/icons-material/QrCode';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import { useAuth } from '../contexts/AuthContext';
import { useSociety } from '../contexts/SocietyContext';

const FEATURES = [
  {
    icon: <EventIcon sx={{ fontSize: 36 }} />,
    color: '#6366f1',
    title: 'Browse Events',
    desc: 'Festivals, sports days, wellness sessions and community governance meetings — all in one place.',
  },
  {
    icon: <ConfirmationNumberIcon sx={{ fontSize: 36 }} />,
    color: '#10b981',
    title: 'Book & Pay Online',
    desc: 'Reserve seats instantly and pay via UPI, card or net banking. Get a QR-code ticket on confirmation.',
  },
  {
    icon: <GroupsIcon sx={{ fontSize: 36 }} />,
    color: '#0ea5e9',
    title: 'Community First',
    desc: 'Stay connected with announcements and real-time updates from your society committee.',
  },
  {
    icon: <NotificationsActiveIcon sx={{ fontSize: 36 }} />,
    color: '#f59e0b',
    title: 'Instant Notifications',
    desc: 'Never miss an event. Get alerts for new events, booking confirmations, and reminders.',
  },
  {
    icon: <QrCodeIcon sx={{ fontSize: 36 }} />,
    color: '#ec4899',
    title: 'QR-Code Entry',
    desc: 'Show your digital ticket QR code at the gate for a smooth, paperless check-in experience.',
  },
  {
    icon: <SecurityIcon sx={{ fontSize: 36 }} />,
    color: '#7c3aed',
    title: 'Secure & Private',
    desc: 'Your data stays within the society. Secured by Keycloak SSO with role-based access control.',
  },
];

const STATS = [
  { value: '30+', label: 'Events per year' },
  { value: '500+', label: 'Resident families' },
  { value: '5', label: 'Event categories' },
  { value: '24h', label: 'Approval turnaround' },
];

const CATEGORIES = [
  { label: '🎆 Festival', color: '#f59e0b' },
  { label: '🏆 Sports', color: '#10b981' },
  { label: '💜 Wellness', color: '#ec4899' },
  { label: '🏛 Governance', color: '#6366f1' },
  { label: '⭐ Kids', color: '#0ea5e9' },
];

const HOW_IT_WORKS = [
  { step: '01', icon: <PersonAddIcon sx={{ fontSize: 28 }} />, title: 'Register', desc: 'Sign up with your email. The committee verifies your residency and activates your account within 24 hours.' },
  { step: '02', icon: <EventIcon sx={{ fontSize: 28 }} />, title: 'Discover Events', desc: 'Browse upcoming events filtered by category. View details, schedules, and available seats.' },
  { step: '03', icon: <EmojiEventsIcon sx={{ fontSize: 28 }} />, title: 'Book & Attend', desc: 'Reserve your spot, pay online, and show your QR-code ticket at the gate. It\'s that simple.' },
];

export function Landing() {
  const { login, register } = useAuth();
  const { name, city } = useSociety();

  return (
    <Box component="main" sx={{ bgcolor: 'background.default' }}>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <Box
        sx={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)',
          color: '#fff',
          pt: { xs: 8, md: 12 },
          pb: { xs: 10, md: 14 },
          px: 3,
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative circles */}
        <Box sx={{ position: 'absolute', top: -80, right: -80, width: 320, height: 320, borderRadius: '50%', bgcolor: 'rgba(99,102,241,0.12)', pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', bottom: -60, left: -60, width: 240, height: 240, borderRadius: '50%', bgcolor: 'rgba(16,185,129,0.08)', pointerEvents: 'none' }} />

        <Container maxWidth="md" sx={{ position: 'relative' }}>
          <Typography sx={{ fontSize: { xs: 52, md: 64 }, lineHeight: 1, mb: 2.5 }}>🏛</Typography>

          <Typography
            variant="h2"
            fontWeight={900}
            sx={{
              fontSize: { xs: 28, sm: 38, md: 52 },
              lineHeight: 1.1,
              mb: 1.5,
              background: 'linear-gradient(90deg, #fff 0%, #c7d2fe 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {name}
          </Typography>

          <Typography sx={{ fontSize: { xs: 14, md: 17 }, color: '#a5b4fc', mb: 1, fontWeight: 500, letterSpacing: 0.5 }}>
            {city}
          </Typography>
          <Typography sx={{ fontSize: { xs: 15, md: 18 }, color: '#c7d2fe', mb: 5, maxWidth: 520, mx: 'auto' }}>
            Your society's resident events &amp; community portal — browse, book and attend events, all in one place.
          </Typography>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center" alignItems="center" sx={{ mb: 3.5 }}>
            <Button
              variant="contained"
              size="large"
              startIcon={<LoginIcon />}
              onClick={() => login()}
              sx={{
                px: 5, py: 1.75, fontWeight: 700, fontSize: 16,
                bgcolor: '#6366f1',
                boxShadow: '0 4px 20px rgba(99,102,241,0.5)',
                '&:hover': { bgcolor: '#4f46e5', boxShadow: '0 4px 24px rgba(99,102,241,0.7)' },
                minWidth: 180,
              }}
            >
              Sign In
            </Button>
            <Button
              variant="outlined"
              size="large"
              startIcon={<PersonAddIcon />}
              onClick={register}
              sx={{
                px: 5, py: 1.75, fontWeight: 700, fontSize: 16,
                color: '#fff',
                borderColor: 'rgba(255,255,255,0.45)',
                backdropFilter: 'blur(4px)',
                '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.1)' },
                minWidth: 220,
              }}
            >
              Register as Member
            </Button>
          </Stack>

          <Typography sx={{ fontSize: 13, color: 'rgba(165,180,252,0.8)' }}>
            New members: register with your email — the committee activates your account within 24 hours.
          </Typography>
        </Container>
      </Box>

      {/* ── Stats strip ──────────────────────────────────────────────── */}
      <Box sx={{ bgcolor: '#1e293b', py: 3.5 }}>
        <Container maxWidth="md">
          <Grid container spacing={0} justifyContent="center">
            {STATS.map((s, i) => (
              <React.Fragment key={s.label}>
                <Grid item xs={6} md={3}>
                  <Box sx={{ textAlign: 'center', py: { xs: 1.5, md: 0 } }}>
                    <Typography sx={{ fontSize: { xs: 28, md: 34 }, fontWeight: 900, color: '#6366f1', lineHeight: 1 }}>
                      {s.value}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: 'rgba(148,163,184,0.9)', mt: 0.5, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 500 }}>
                      {s.label}
                    </Typography>
                  </Box>
                </Grid>
                {i < STATS.length - 1 && (
                  <Grid item sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center' }}>
                    <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.1)', height: 40, alignSelf: 'center' }} />
                  </Grid>
                )}
              </React.Fragment>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* ── Event Categories ─────────────────────────────────────────── */}
      <Box sx={{ bgcolor: '#f8fafc', py: 5, px: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Container maxWidth="lg">
          <Typography variant="h6" fontWeight={700} textAlign="center" mb={0.75}>
            Events for every resident
          </Typography>
          <Typography textAlign="center" color="text.secondary" fontSize={14} mb={3}>
            Five categories covering everything your community loves
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', justifyContent: 'center' }}>
            {CATEGORIES.map((c) => (
              <Chip
                key={c.label}
                label={c.label}
                sx={{
                  fontSize: 14, px: 1, py: 2.5, fontWeight: 600,
                  bgcolor: '#fff',
                  border: `2px solid ${c.color}`,
                  color: c.color,
                  '&:hover': { bgcolor: c.color, color: '#fff' },
                  transition: 'all 0.2s',
                }}
              />
            ))}
          </Box>
        </Container>
      </Box>

      {/* ── Features grid ────────────────────────────────────────────── */}
      <Box sx={{ py: { xs: 7, md: 10 }, px: 3, bgcolor: 'background.default' }}>
        <Container maxWidth="lg">
          <Typography variant="h4" fontWeight={800} textAlign="center" mb={1} sx={{ fontSize: { xs: 24, md: 32 } }}>
            Everything your community needs
          </Typography>
          <Typography textAlign="center" color="text.secondary" fontSize={16} mb={6} maxWidth={500} mx="auto">
            Built specifically for housing society event management — from browsing to entry.
          </Typography>

          <Grid container spacing={3}>
            {FEATURES.map((f) => (
              <Grid item xs={12} sm={6} md={4} key={f.title}>
                <Card
                  variant="outlined"
                  sx={{
                    height: '100%',
                    borderRadius: 2,
                    transition: 'box-shadow 0.25s, transform 0.25s',
                    '&:hover': { boxShadow: 6, transform: 'translateY(-4px)' },
                  }}
                >
                  <CardContent sx={{ p: 3.5 }}>
                    <Box
                      sx={{
                        width: 56, height: 56, borderRadius: 2,
                        bgcolor: f.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', mb: 2.5,
                      }}
                    >
                      {f.icon}
                    </Box>
                    <Typography fontWeight={700} fontSize={17} mb={1}>{f.title}</Typography>
                    <Typography fontSize={14} color="text.secondary" lineHeight={1.6}>{f.desc}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <Box sx={{ py: { xs: 7, md: 10 }, px: 3, bgcolor: '#f8fafc', borderTop: '1px solid', borderColor: 'divider' }}>
        <Container maxWidth="md">
          <Typography variant="h4" fontWeight={800} textAlign="center" mb={1} sx={{ fontSize: { xs: 24, md: 32 } }}>
            Get started in minutes
          </Typography>
          <Typography textAlign="center" color="text.secondary" fontSize={15} mb={7}>
            Three simple steps to your first event booking
          </Typography>

          <Grid container spacing={4} alignItems="flex-start">
            {HOW_IT_WORKS.map((step, i) => (
              <Grid item xs={12} md={4} key={step.step}>
                <Box sx={{ textAlign: 'center', px: { md: 1 } }}>
                  {/* Step number + connector */}
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2.5 }}>
                    <Box
                      sx={{
                        width: 64, height: 64, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', boxShadow: '0 4px 16px rgba(99,102,241,0.35)',
                      }}
                    >
                      {step.icon}
                    </Box>
                  </Box>
                  <Typography
                    sx={{ fontSize: 11, fontWeight: 700, color: '#6366f1', letterSpacing: 1.5, textTransform: 'uppercase', mb: 0.75 }}
                  >
                    Step {step.step}
                  </Typography>
                  <Typography fontWeight={700} fontSize={18} mb={1}>{step.title}</Typography>
                  <Typography fontSize={14} color="text.secondary" lineHeight={1.65}>{step.desc}</Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* ── Bottom CTA ───────────────────────────────────────────────── */}
      <Box
        sx={{
          py: { xs: 7, md: 10 },
          px: 3,
          textAlign: 'center',
          background: 'linear-gradient(135deg, #1e293b 0%, #312e81 100%)',
          color: '#fff',
        }}
      >
        <Container maxWidth="sm">
          <Typography sx={{ fontSize: { xs: 40, md: 52 }, lineHeight: 1, mb: 2.5 }}>🏛</Typography>
          <Typography variant="h4" fontWeight={800} mb={1.5} sx={{ fontSize: { xs: 22, md: 30 }, color: '#fff' }}>
            Join the {name} community
          </Typography>
          <Typography sx={{ color: '#c7d2fe', fontSize: 15, mb: 5, maxWidth: 420, mx: 'auto' }}>
            Already a resident? Register your account and start booking events today.
          </Typography>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center" alignItems="center">
            <Button
              variant="contained"
              size="large"
              startIcon={<PersonAddIcon />}
              onClick={register}
              sx={{
                px: 5, py: 1.75, fontWeight: 700, fontSize: 15,
                bgcolor: '#6366f1',
                boxShadow: '0 4px 20px rgba(99,102,241,0.5)',
                '&:hover': { bgcolor: '#4f46e5' },
                minWidth: 220,
              }}
            >
              Register as Member
            </Button>
            <Button
              variant="text"
              size="large"
              startIcon={<LoginIcon />}
              onClick={() => login()}
              sx={{ color: '#c7d2fe', fontWeight: 600, fontSize: 15, '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.08)' }, minWidth: 160 }}
            >
              Sign In
            </Button>
          </Stack>

          <Typography sx={{ mt: 3, fontSize: 12, color: 'rgba(165,180,252,0.7)' }}>
            New members require residency verification · Typically activated within 24 hours
          </Typography>
        </Container>
      </Box>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <Box sx={{ py: 2.5, px: 3, bgcolor: '#0f172a', textAlign: 'center' }}>
        <Typography sx={{ fontSize: 12, color: 'rgba(148,163,184,0.6)' }}>
          © {new Date().getFullYear()} {name} · {city} · Society Events Portal
        </Typography>
      </Box>

    </Box>
  );
}
