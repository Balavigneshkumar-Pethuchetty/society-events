import React, { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import {
  AppBar, Toolbar, Box, Button, Chip, Drawer,
  Divider, IconButton, List, ListItemButton, ListItemText,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import { NotificationBell } from './NotificationBell';
import { UserMenu } from './UserMenu';
import { useSociety } from '../contexts/SocietyContext';
import { NAV_BG } from '../theme';

const CATEGORIES = [
  { label: '🎆 Festival',   slug: 'festival' },
  { label: '🏆 Sports',     slug: 'sports' },
  { label: '💜 Wellness',   slug: 'wellness' },
  { label: '🏛 Governance', slug: 'governance' },
  { label: '⭐ Kids',       slug: 'kids' },
];

const PRIMARY_LINKS = [
  { label: 'Home',       to: '/',        end: true },
  { label: 'Events',     to: '/events',  end: false },
  { label: 'My Tickets', to: '/tickets', end: false },
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
  const [drawerOpen, setDrawerOpen] = useState(false);

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
            <span style={{ fontSize: 20 }}>🏛</span>
            <Box component="span" sx={{ display: { xs: 'none', sm: 'block' } }}>{name}</Box>
            <Box component="span" sx={{ display: { xs: 'block', sm: 'none' } }}>{shortName}</Box>
          </Button>

          {/* Primary links — hidden on mobile */}
          <Box component="nav" sx={{ display: { xs: 'none', md: 'flex' }, gap: 0.5, flexShrink: 0 }}>
            {PRIMARY_LINKS.map((l) => (
              <Button key={l.to} component={NavLink} to={l.to} end={l.end} sx={navBtnSx}>
                {l.label}
              </Button>
            ))}
          </Box>

          {/* Category chips — hidden below lg */}
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

          <Box sx={{ flex: 1 }} />

          <NotificationBell />
          <UserMenu />

          {/* Mobile hamburger */}
          <IconButton
            aria-label="Open menu"
            onClick={() => setDrawerOpen(true)}
            sx={{ display: { md: 'none' }, color: 'rgba(203,213,225,0.9)' }}
          >
            <MenuIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      {/* Mobile Drawer */}
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
          {PRIMARY_LINKS.map((l) => (
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
    </>
  );
}
