'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
let authToken   = null;
let knownIds    = new Set();   // IDs seen on first poll — never notify for these
let isFirstPoll = true;        // Seed silently on first poll to avoid replay spam
let pollTimer   = null;

const POLL_MS   = 30_000;
const API_PATH  = '/api/users/notifications?unread=true&limit=50';

// ─── Core poll ────────────────────────────────────────────────────────────────

async function doPoll() {
  if (!authToken) return;

  let data;
  try {
    const res = await fetch(API_PATH, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) {
      if (res.status === 401) { authToken = null; stopPolling(); }
      return;
    }
    data = await res.json();
  } catch {
    return; // Network error — retry next interval
  }

  const unreadCount = data.unread_count ?? 0;
  const items       = data.items ?? [];

  if (isFirstPoll) {
    // Seed known IDs silently so we don't replay old notifications on every reload
    items.forEach(n => knownIds.add(n.id));
    isFirstPoll = false;
  } else {
    // Show OS notification for every genuinely new unread item
    for (const n of items) {
      if (!knownIds.has(n.id)) {
        knownIds.add(n.id);

        if (Notification.permission === 'granted') {
          try {
            await self.registration.showNotification(n.title, {
              body:      n.message,
              icon:      '/favicon.ico',
              tag:       n.id,      // deduplicates: same id won't stack
              renotify:  false,
              data:      { notificationId: n.id },
            });
          } catch {
            // showNotification may fail if SW context lost — ignore
          }
        }
      }
    }
  }

  // Push unread count to every open tab
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(c => c.postMessage({ type: 'UNREAD_COUNT', count: unreadCount }));
}

// ─── Poll lifecycle ───────────────────────────────────────────────────────────

function startPolling() {
  stopPolling();
  doPoll();                                   // Immediate first hit
  pollTimer = setInterval(doPoll, POLL_MS);   // Then every 30 s
}

function stopPolling() {
  if (pollTimer !== null) { clearInterval(pollTimer); pollTimer = null; }
}

// ─── Message handler (receives token from main thread) ───────────────────────

self.addEventListener('message', event => {
  const { type, token } = event.data ?? {};

  if (type === 'SET_TOKEN') {
    if (token) {
      const isNewSession = token !== authToken;
      authToken = token;
      if (isNewSession) {
        // Reset so the first poll with this token seeds IDs without notifying
        isFirstPoll = true;
        knownIds    = new Set();
        startPolling();
      }
    } else {
      // Logout — stop polling and clear state
      authToken = null;
      stopPolling();
      knownIds    = new Set();
      isFirstPoll = true;
    }
  }

  // SW woke up (e.g. after browser killed it) — ask main thread to resend token
  if (type === 'PING') {
    event.source?.postMessage({ type: 'REQUEST_TOKEN' });
  }
});

// ─── Notification click → focus or open the app ───────────────────────────────

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        if (clients.length) return clients[0].focus();
        return self.clients.openWindow('/');
      })
  );
});

// ─── Lifecycle ────────────────────────────────────────────────────────────────

self.addEventListener('install',  ()      => self.skipWaiting());
self.addEventListener('activate', event  => {
  event.waitUntil(
    self.clients.claim().then(async () => {
      // Tell all open tabs to resend their token (handles SW restart after browser kill)
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(c => c.postMessage({ type: 'REQUEST_TOKEN' }));
    })
  );
});
