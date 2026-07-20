import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { userService, NotificationItem } from '../api/userService';

const SW_PATH = '/notification-sw.js';

export function useNotifications() {
  const { token, logout } = useAuth();
  const [unreadCount, setUnreadCount]       = useState(0);
  const [notifications, setNotifications]   = useState<NotificationItem[]>([]);
  const [notifLoading, setNotifLoading]     = useState(false);
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = token ?? null;
  const logoutRef = useRef(logout);
  logoutRef.current = logout;

  // ── Register Service Worker once and listen for background messages ────────
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register(SW_PATH, { scope: '/' })
      .catch(() => {});

    const onMessage = (event: MessageEvent) => {
      const { type } = event.data ?? {};

      if (type === 'UNREAD_COUNT') {
        setUnreadCount((event.data as { count: number }).count);
      }

      // Leave request got approved while this tab was open — the account is
      // headed for deletion once the user confirms, so log out immediately
      // instead of leaving them able to keep using a soon-to-be-gone account.
      if (type === 'FORCE_LOGOUT') {
        logoutRef.current();
      }

      // SW woke after browser killed it — re-send token
      if (type === 'REQUEST_TOKEN') {
        navigator.serviceWorker.ready.then(reg => {
          reg.active?.postMessage({ type: 'SET_TOKEN', token: tokenRef.current });
        });
      }
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Forward token to SW on login / logout / refresh ────────────────────────
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (!token) {
      setUnreadCount(0);
      setNotifications([]);
    } else if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    navigator.serviceWorker.ready.then(reg => {
      reg.active?.postMessage({ type: 'SET_TOKEN', token: token ?? null });
    });
  }, [token]);

  // ── Called when the popover opens ──────────────────────────────────────────
  const fetchNotifications = useCallback(async () => {
    if (!tokenRef.current) return;
    setNotifLoading(true);
    try {
      const data = await userService.notifications.list(tokenRef.current, { limit: 50 });
      setNotifications(data.items);
      setUnreadCount(data.unread_count);
    } catch {
      // silently ignore — badge still reflects SW count
    } finally {
      setNotifLoading(false);
    }
  }, []);

  const markRead = useCallback(async (id: string) => {
    if (!tokenRef.current) return;
    // Optimistic update
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
    try {
      await userService.notifications.markRead(tokenRef.current, id);
    } catch {
      // revert on error
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: false } : n));
      setUnreadCount(prev => prev + 1);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    if (!tokenRef.current) return;
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
    try {
      await userService.notifications.markAllRead(tokenRef.current);
    } catch {
      // revert
      fetchNotifications();
    }
  }, [fetchNotifications]);

  return { unreadCount, notifications, notifLoading, fetchNotifications, markRead, markAllRead };
}
