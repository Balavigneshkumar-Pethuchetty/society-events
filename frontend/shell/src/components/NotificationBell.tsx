import React, { useState } from 'react';
import {
  IconButton, Badge, Tooltip, Popover, Box, Typography,
  Button, Divider, CircularProgress, List, ListItem,
  ListItemAvatar, Avatar, ListItemText, Chip,
} from '@mui/material';
import NotificationsIcon      from '@mui/icons-material/Notifications';
import NotificationsNoneIcon  from '@mui/icons-material/NotificationsNone';
import PersonAddIcon           from '@mui/icons-material/PersonAdd';
import EventNoteIcon           from '@mui/icons-material/EventNote';
import EventBusyIcon           from '@mui/icons-material/EventBusy';
import CheckCircleOutlineIcon  from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon      from '@mui/icons-material/CancelOutlined';
import PaymentIcon             from '@mui/icons-material/Payment';
import CurrencyRupeeIcon       from '@mui/icons-material/CurrencyRupee';
import CampaignIcon            from '@mui/icons-material/Campaign';
import ManageAccountsIcon      from '@mui/icons-material/ManageAccounts';
import { useAuth }             from '../contexts/AuthContext';
import { useNotifications }    from '../hooks/useNotifications';
import type { NotificationItem } from '../api/userService';

// ─── Type → icon / colour ────────────────────────────────────────────────────

type TypeMeta = { icon: React.ReactElement; color: string; bg: string };

const TYPE_META: Record<string, TypeMeta> = {
  new_registration:   { icon: <PersonAddIcon fontSize="small" />,          color: '#7c3aed', bg: '#ede9fe' },
  event_reminder:     { icon: <EventNoteIcon fontSize="small" />,           color: '#0284c7', bg: '#e0f2fe' },
  event_created:      { icon: <EventNoteIcon fontSize="small" />,           color: '#0284c7', bg: '#e0f2fe' },
  event_cancelled:    { icon: <EventBusyIcon fontSize="small" />,           color: '#dc2626', bg: '#fee2e2' },
  booking_confirmed:  { icon: <CheckCircleOutlineIcon fontSize="small" />,  color: '#16a34a', bg: '#dcfce7' },
  booking_cancelled:  { icon: <CancelOutlinedIcon fontSize="small" />,      color: '#dc2626', bg: '#fee2e2' },
  payment_success:    { icon: <PaymentIcon fontSize="small" />,             color: '#15803d', bg: '#dcfce7' },
  payment_received:   { icon: <PaymentIcon fontSize="small" />,             color: '#15803d', bg: '#dcfce7' },
  refund_processed:   { icon: <CurrencyRupeeIcon fontSize="small" />,       color: '#d97706', bg: '#fef3c7' },
  announcement:       { icon: <CampaignIcon fontSize="small" />,            color: '#0f766e', bg: '#ccfbf1' },
  role_changed:       { icon: <ManageAccountsIcon fontSize="small" />,      color: '#4f46e5', bg: '#eef2ff' },
};

const DEFAULT_META: TypeMeta = {
  icon:  <NotificationsNoneIcon fontSize="small" />,
  color: '#475569',
  bg:    '#f1f5f9',
};

// ─── Role → notification categories they receive ────────────────────────────

const ROLE_CATEGORIES: Record<string, string[]> = {
  admin:            ['User management', 'Events', 'Payments', 'Announcements'],
  committee_member: ['Events', 'Payments', 'Announcements'],
  resident:         ['Events', 'Bookings', 'Payments', 'Announcements'],
  security_guard:   ['Announcements'],
  sponsor:          ['Events', 'Announcements'],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ─── Single notification row ──────────────────────────────────────────────────

function NotifRow({ n, onRead }: { n: NotificationItem; onRead: (id: string) => void }) {
  const meta = TYPE_META[n.type] ?? DEFAULT_META;

  return (
    <ListItem
      alignItems="flex-start"
      onClick={() => { if (!n.is_read) onRead(n.id); }}
      sx={{
        gap: 1,
        px: 2,
        py: 1.25,
        cursor: n.is_read ? 'default' : 'pointer',
        bgcolor: n.is_read ? 'transparent' : 'rgba(99,102,241,0.04)',
        borderLeft: n.is_read ? '3px solid transparent' : `3px solid ${meta.color}`,
        transition: 'background 0.15s',
        '&:hover': { bgcolor: 'rgba(0,0,0,0.03)' },
      }}
    >
      <ListItemAvatar sx={{ minWidth: 40, mt: 0.5 }}>
        <Avatar sx={{ width: 32, height: 32, bgcolor: meta.bg, color: meta.color }}>
          {meta.icon}
        </Avatar>
      </ListItemAvatar>

      <ListItemText
        primary={
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
            <Typography
              variant="body2"
              fontWeight={n.is_read ? 400 : 600}
              sx={{ color: '#1e293b', lineHeight: 1.4, flex: 1 }}
            >
              {n.title}
            </Typography>
            <Typography variant="caption" sx={{ color: '#94a3b8', flexShrink: 0, mt: '2px' }}>
              {relativeTime(n.created_at)}
            </Typography>
          </Box>
        }
        secondary={
          <Typography variant="caption" sx={{ color: '#64748b', mt: 0.25, display: 'block' }}>
            {n.message}
          </Typography>
        }
        disableTypography
      />

      {!n.is_read && (
        <Box sx={{
          width: 8, height: 8, borderRadius: '50%',
          bgcolor: meta.color, flexShrink: 0, mt: 1.25,
        }} />
      )}
    </ListItem>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function NotificationBell() {
  const { user } = useAuth();
  const { unreadCount, notifications, notifLoading, fetchNotifications, markRead, markAllRead } =
    useNotifications();

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(e.currentTarget);
    fetchNotifications();
  };

  const handleClose = () => setAnchorEl(null);

  const role       = user?.primaryRole ?? '';
  const categories = ROLE_CATEGORIES[role] ?? [];

  const label = unreadCount ? `${unreadCount} unread notifications` : 'Notifications';

  return (
    <>
      <Tooltip title={label}>
        <IconButton
          aria-label={label}
          onClick={handleOpen}
          sx={{
            color: open ? '#fff' : 'rgba(203,213,225,0.9)',
            bgcolor: open ? 'rgba(99,102,241,0.28)' : 'transparent',
            '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.08)' },
          }}
        >
          <Badge badgeContent={unreadCount || undefined} color="error" max={99}>
            <NotificationsIcon fontSize="small" />
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              width: 380,
              maxHeight: 520,
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 2,
              boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
              overflow: 'hidden',
            },
          },
        }}
      >
        {/* ── Header ── */}
        <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ color: '#1e293b', flex: 1 }}>
            Notifications
          </Typography>
          {unreadCount > 0 && (
            <Chip
              label={`${unreadCount} new`}
              size="small"
              sx={{ bgcolor: '#eef2ff', color: '#4f46e5', fontWeight: 600, fontSize: 11 }}
            />
          )}
          {unreadCount > 0 && (
            <Button
              size="small"
              onClick={markAllRead}
              sx={{ color: '#6366f1', fontWeight: 600, fontSize: 12, minWidth: 0, textTransform: 'none', px: 1 }}
            >
              Mark all read
            </Button>
          )}
        </Box>

        <Divider />

        {/* ── Body ── */}
        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          {notifLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={28} sx={{ color: '#6366f1' }} />
            </Box>
          ) : notifications.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 5, px: 3 }}>
              <NotificationsNoneIcon sx={{ fontSize: 48, color: '#cbd5e1', mb: 1 }} />
              <Typography variant="body2" sx={{ color: '#94a3b8', fontWeight: 500 }}>
                No notifications yet
              </Typography>
              <Typography variant="caption" sx={{ color: '#cbd5e1' }}>
                You'll be notified when something needs your attention
              </Typography>
            </Box>
          ) : (
            <List disablePadding>
              {notifications.map((n, i) => (
                <React.Fragment key={n.id}>
                  {i > 0 && <Divider component="li" sx={{ mx: 2 }} />}
                  <NotifRow n={n} onRead={markRead} />
                </React.Fragment>
              ))}
            </List>
          )}
        </Box>

        {/* ── Footer: what this role receives ── */}
        {categories.length > 0 && (
          <>
            <Divider />
            <Box sx={{ px: 2, py: 1, bgcolor: '#f8fafc', flexShrink: 0 }}>
              <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block', mb: 0.5 }}>
                You receive notifications for:
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {categories.map(c => (
                  <Chip
                    key={c}
                    label={c}
                    size="small"
                    sx={{ fontSize: 10, height: 20, bgcolor: '#e2e8f0', color: '#475569' }}
                  />
                ))}
              </Box>
            </Box>
          </>
        )}
      </Popover>
    </>
  );
}
