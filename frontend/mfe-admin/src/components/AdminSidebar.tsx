import React from 'react';
import { Box, Drawer, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

const SIDEBAR: { label: string; path: string }[] = [
  { label: 'Dashboard',          path: '/admin' },
  { label: 'Users',              path: '/admin/users' },
  { label: 'Building',           path: '/admin/building' },
  { label: 'Units',              path: '/admin/units' },
  { label: 'Events',             path: '/admin/events' },
  { label: 'Sponsors',           path: '/admin/sponsors' },
  { label: 'Categories',         path: '/admin/categories' },
  { label: 'Payments & Refunds', path: '/admin/refunds' },
  { label: 'Reports',            path: '/admin/reports' },
  { label: 'Settings',           path: '/admin/settings' },
];

function navigate(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
}

function SidebarContent({ active, onNavigate }: { active: string; onNavigate?: () => void }) {
  return (
    <Box sx={{ pt: 1 }}>
      {SIDEBAR.map(({ label, path }) => (
        <Box
          key={label}
          onClick={() => { navigate(path); onNavigate?.(); }}
          sx={{
            px: 2.5, py: 1.25, fontSize: 14, cursor: 'pointer',
            color: label === active ? '#6366f1' : '#475569',
            fontWeight: label === active ? 700 : 400,
            bgcolor: label === active ? '#ede9fe' : 'transparent',
            borderRight: label === active ? '3px solid #6366f1' : '3px solid transparent',
            transition: 'all .15s',
            '&:hover': { bgcolor: label === active ? '#ede9fe' : '#f1f5f9', color: label === active ? '#6366f1' : '#0f172a' },
          }}
        >
          {label}
        </Box>
      ))}
    </Box>
  );
}

interface AdminSidebarProps {
  active: string;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function AdminSidebar({ active, mobileOpen, onMobileClose }: AdminSidebarProps) {
  return (
    <>
      {/* Mobile: slide-in drawer */}
      <Drawer
        anchor="left"
        open={mobileOpen}
        onClose={onMobileClose}
        ModalProps={{ keepMounted: true }}
        PaperProps={{ sx: { width: 240, bgcolor: '#f8fafc' } }}
        sx={{ display: { xs: 'block', md: 'none' } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography fontWeight={700} fontSize={14} color="#475569">Admin Menu</Typography>
          <IconButton size="small" onClick={onMobileClose} aria-label="Close menu">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        <SidebarContent active={active} onNavigate={onMobileClose} />
      </Drawer>

      {/* Desktop: permanent sidebar */}
      <Box
        sx={{
          width: 220,
          flexShrink: 0,
          display: { xs: 'none', md: 'block' },
          borderRight: '1px solid',
          borderColor: 'divider',
          bgcolor: '#f8fafc',
          minHeight: 'calc(100vh - 64px)',
        }}
      >
        <SidebarContent active={active} />
      </Box>
    </>
  );
}
