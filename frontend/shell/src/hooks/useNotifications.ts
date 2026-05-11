import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const POLL_MS = 30_000;
const API_BASE = 'http://localhost:8000/api/v1';

export function useNotifications() {
  const { token } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!token) return;

    const fetchUnread = async () => {
      try {
        const res = await fetch(`${API_BASE}/notifications?unread=true&limit=1`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(5_000),
        });
        if (!res.ok) return;
        const data = await res.json();
        setUnreadCount(typeof data.unread_count === 'number' ? data.unread_count : 0);
      } catch {
        // Notification service not running yet — bell stays at 0
      }
    };

    fetchUnread();
    const id = setInterval(fetchUnread, POLL_MS);
    return () => clearInterval(id);
  }, [token]);

  return { unreadCount };
}
