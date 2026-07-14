import React from 'react';
import { Box, Divider, Drawer, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

const SIDEBAR: { label: string; path: string; section?: string; adminOnly?: boolean }[] = [
  { label: 'Dashboard',            path: '/admin',                      adminOnly: true },
  { label: 'Users',                path: '/admin/users',                adminOnly: true },
  { label: 'Leave Requests',       path: '/admin/leave-requests',       adminOnly: true },
  { label: 'Building',             path: '/admin/building',             adminOnly: true },
  { label: 'Units',                path: '/admin/units',                adminOnly: true },
  { label: 'Events',               path: '/admin/events',               adminOnly: true },
  { label: 'Sponsors',             path: '/admin/sponsors',             adminOnly: true },
  { label: 'Categories',           path: '/admin/categories',           adminOnly: true },
  { label: 'Payment Approvals',    path: '/admin/payments',            section: 'Payments' },
  { label: 'Collector Registry',   path: '/admin/collector-registry' },
  { label: 'Payment Requests',     path: '/admin/reconciliation' },
  { label: 'Refund Tasks',         path: '/admin/pay-refunds' },
  { label: 'Sponsorship Refunds',  path: '/admin/refunds',             section: 'Sponsors', adminOnly: true },
  { label: 'Reports',              path: '/admin/reports',              adminOnly: true },
  { label: 'Settings',             path: '/admin/settings',             adminOnly: true },
];

function navigate(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
}

function SidebarContent({ active, onNavigate, role }: { active: string; onNavigate?: () => void; role?: string }) {
  const isCommittee = role === 'committee_member';
  const visible = SIDEBAR.filter(item => !(isCommittee && item.adminOnly));
  return (
    <Box sx={{ pt: 1 }}>
      {visible.map(({ label, path, section }) => (
        <React.Fragment key={label}>
          {section && (
            <Box sx={{ px: 2.5, pt: 1.5, pb: 0.5 }}>
              <Typography fontSize={10} fontWeight={700} color="text.secondary" textTransform="uppercase" letterSpacing={1}>
                {section}
              </Typography>
              <Divider sx={{ mt: 0.5 }} />
            </Box>
          )}
          <Box
            onClick={() => { navigate(path); onNavigate?.(); }}
            sx={{
              px: 2.5, py: 1.25, fontSize: 14, cursor: 'pointer',
              color: label === active ? '#6366f1' : 'text.secondary',
              fontWeight: label === active ? 700 : 400,
              bgcolor: label === active ? 'action.selected' : 'transparent',
              borderRight: label === active ? '3px solid #6366f1' : '3px solid transparent',
              transition: 'all .15s',
              '&:hover': { bgcolor: label === active ? 'action.selected' : 'action.hover', color: label === active ? '#6366f1' : 'text.primary' },
            }}
          >
            {label}
          </Box>
        </React.Fragment>
      ))}
    </Box>
  );
}

interface AdminSidebarProps {
  active: string;
  mobileOpen: boolean;
  onMobileClose: () => void;
  role?: string;
}

export function AdminSidebar({ active, mobileOpen, onMobileClose, role }: AdminSidebarProps) {
  return (
    <>
      {/* Mobile: slide-in drawer */}
      <Drawer
        anchor="left"
        open={mobileOpen}
        onClose={onMobileClose}
        ModalProps={{ keepMounted: true }}
        PaperProps={{ sx: { width: 240, bgcolor: 'background.paper' } }}
        sx={{ display: { xs: 'block', md: 'none' } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography fontWeight={700} fontSize={14} color="text.secondary">Admin Menu</Typography>
          <IconButton size="small" onClick={onMobileClose} aria-label="Close menu">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        <SidebarContent active={active} onNavigate={onMobileClose} role={role} />
      </Drawer>

      {/* Desktop: permanent sidebar */}
      <Box
        sx={{
          width: 220,
          flexShrink: 0,
          display: { xs: 'none', md: 'block' },
          borderRight: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          minHeight: 'calc(100vh - 64px)',
        }}
      >
        <SidebarContent active={active} role={role} />
      </Box>
    </>
  );
}
