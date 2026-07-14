import React, { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import {
  AppBar, Toolbar, Box, Button, Chip, Drawer,
  Divider, IconButton, List, ListItemButton, ListItemText,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import LoginIcon from '@mui/icons-material/Login';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import { NotificationBell } from './NotificationBell';
import { UserMenu } from './UserMenu';
import { ThemeToggle } from './ThemeToggle';
import { useAuth } from '../contexts/AuthContext';
import { useSociety } from '../contexts/SocietyContext';
import { NAV_BG } from '../theme';

const CATEGORIES = [
  { label: '🎆 Festival',   slug: 'festival' },
  { label: '🏆 Sports',     slug: 'sports' },
  { label: '💜 Wellness',   slug: 'wellness' },
  { label: '🏛 Governance', slug: 'governance' },
  { label: '⭐ Kids',       slug: 'kids' },
];

// Base links every authenticated role sees
const BASE_LINKS = [
  { label: 'Home',              to: '/',               end: true },
  { label: 'Events',            to: '/events',         end: false },
  { label: 'My Tickets',        to: '/tickets',        end: false },
  { label: 'My Registrations',  to: '/registrations',  end: false },
];

const navBtnSx = {
  color: 'rgba(203,213,225,0.9)',
  minWidth: 0,
  px: 1.5,
  py: 0.75,
  '&.active': { color: '#fff', backgroundColor: 'rgba(99,102,241,0.28)' },
  '&:hover':  { backgroundColor: 'rgba(255,255,255,0.08)', color: '#fff' },
};

export function Nav() {
  const { shortName, name } = useSociety();
  const { user, login, register } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const role    = user?.primaryRole ?? '';
  const isGuard = role === 'security_guard';
  const isGuest = !user;

  const isSponsor = role === 'sponsor';

  const primaryLinks = isGuard
    ? [{ label: 'QR Scanner', to: '/scanner', end: false }]
    : isSponsor
    ? [
        { label: 'Events',           to: '/events',  end: false },
        { label: 'My Sponsorships',  to: '/sponsor', end: false },
      ]
    : [
        ...BASE_LINKS,
        ...(role === 'committee_member' || role === 'admin'
          ? [{ label: 'Manage', to: '/manage', end: false }]
          : []),
        ...(role === 'admin' || role === 'committee_member'
          ? [{ label: 'Admin', to: '/admin', end: false }]
          : []),
      ];

  return (
    <>
      <AppBar position="sticky" sx={{ bgcolor: NAV_BG, boxShadow: '0 4px 12px rgba(0,0,0,0.10)' }}>
        <Toolbar sx={{ gap: 1, minHeight: '60px !important' }}>

          {/* Logo */}
          <Button
            component={Link}
            to="/"
            disableRipple
            sx={{ color: '#fff', fontWeight: 700, fontSize: 15, gap: 1, mr: 1, flexShrink: 0, '&:hover': { background: 'none' } }}
          >
            <span style={{ fontSize: 20, fontWeight: 400 }}>🏛</span>
            <Box component="span" sx={{ display: { xs: 'none', sm: 'block' } }}>{name}</Box>
            <Box component="span" sx={{ display: { xs: 'block', sm: 'none' } }}>{shortName}</Box>
          </Button>

          {/* Authenticated: primary nav links */}
          {!isGuest && (
            <Box component="nav" sx={{ display: { xs: 'none', md: 'flex' }, gap: 0.5, flexShrink: 0 }}>
              {primaryLinks.map((l) => (
                <Button key={l.to} component={NavLink} to={l.to} end={l.end} sx={navBtnSx}>
                  {l.label}
                </Button>
              ))}
            </Box>
          )}

          {/* Authenticated non-guard, non-sponsor: category chips */}
          {!isGuest && !isGuard && !isSponsor && (
            <Box sx={{ display: { xs: 'none', lg: 'flex' }, gap: 0.5, flex: 1, overflow: 'hidden' }}>
              {CATEGORIES.map((c) => (
                <Chip
                  key={c.slug}
                  label={c.label}
                  component={Link}
                  to={`/events?category=${c.slug}`}
                  size="small"
                  clickable
                  sx={{
                    color: 'rgba(203,213,225,0.9)',
                    bgcolor: 'transparent',
                    border: '1px solid rgba(255,255,255,0.12)',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.08)', color: '#fff' },
                  }}
                />
              ))}
            </Box>
          )}

          {/* Guard: scanner shortcut */}
          {isGuard && (
            <Button
              component={NavLink}
              to="/scanner"
              variant="contained"
              startIcon={<QrCodeScannerIcon />}
              sx={{ ml: 1, bgcolor: '#10b981', '&:hover': { bgcolor: '#059669' }, fontWeight: 700 }}
            >
              Scan QR
            </Button>
          )}

          <Box sx={{ flex: 1 }} />

          <ThemeToggle />

          {/* Guest: Sign In + Register buttons */}
          {isGuest ? (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="text"
                startIcon={<LoginIcon />}
                onClick={login}
                sx={{
                  color: 'rgba(203,213,225,0.9)',
                  fontWeight: 600,
                  display: { xs: 'none', sm: 'flex' },
                  '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.08)' },
                }}
              >
                Sign In
              </Button>
              <Button
                variant="contained"
                startIcon={<PersonAddIcon />}
                onClick={register}
                sx={{ fontWeight: 700, bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' }, px: { xs: 2, sm: 3 } }}
              >
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Register</Box>
                <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>Join</Box>
              </Button>
            </Box>
          ) : (
            <>
              <NotificationBell />
              <UserMenu />
            </>
          )}

          {/* Mobile hamburger — only for authenticated users */}
          {!isGuest && (
            <IconButton
              aria-label="Open menu"
              onClick={() => setDrawerOpen(true)}
              sx={{ display: { md: 'none' }, color: 'rgba(203,213,225,0.9)' }}
            >
              <MenuIcon />
            </IconButton>
          )}
        </Toolbar>
      </AppBar>

      {/* Mobile Drawer — authenticated only */}
      {!isGuest && (
        <Drawer
          anchor="top"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          PaperProps={{ sx: { bgcolor: NAV_BG, color: '#fff', pt: 1 } }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 2, pb: 1 }}>
            <IconButton onClick={() => setDrawerOpen(false)} sx={{ color: 'rgba(203,213,225,0.9)' }}>
              <CloseIcon />
            </IconButton>
          </Box>
          <List disablePadding>
            {primaryLinks.map((l) => (
              <ListItemButton
                key={l.to}
                component={NavLink}
                to={l.to}
                end={l.end}
                onClick={() => setDrawerOpen(false)}
                sx={{
                  color: 'rgba(203,213,225,0.9)',
                  '&.active': { color: '#fff', bgcolor: 'rgba(99,102,241,0.28)' },
                  '&:hover':  { bgcolor: 'rgba(255,255,255,0.08)' },
                }}
              >
                <ListItemText primary={l.label} primaryTypographyProps={{ fontWeight: 500 }} />
              </ListItemButton>
            ))}
          </List>
          <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', my: 1 }} />
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, px: 2, pb: 2 }}>
            {CATEGORIES.map((c) => (
              <Chip
                key={c.slug}
                label={c.label}
                component={Link}
                to={`/events?category=${c.slug}`}
                size="small"
                clickable
                onClick={() => setDrawerOpen(false)}
                sx={{
                  color: 'rgba(203,213,225,0.9)',
                  bgcolor: 'transparent',
                  border: '1px solid rgba(255,255,255,0.12)',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.08)', color: '#fff' },
                }}
              />
            ))}
          </Box>
        </Drawer>
      )}
    </>
  );
}
