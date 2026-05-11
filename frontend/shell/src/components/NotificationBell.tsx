import React from 'react';
import { IconButton, Badge, Tooltip } from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { useNotifications } from '../hooks/useNotifications';

export function NotificationBell() {
  const { unreadCount } = useNotifications();
  const label = unreadCount ? `${unreadCount} unread notifications` : 'Notifications';

  return (
    <Tooltip title={label}>
      <IconButton
        aria-label={label}
        sx={{ color: 'rgba(203,213,225,0.9)', '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.08)' } }}
      >
        <Badge badgeContent={unreadCount || undefined} color="error" max={99}>
          <NotificationsIcon fontSize="small" />
        </Badge>
      </IconButton>
    </Tooltip>
  );
}
