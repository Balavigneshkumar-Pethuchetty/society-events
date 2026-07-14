import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
  Container, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  FormControlLabel, Grid, IconButton, InputAdornment, List, ListItem, ListItemButton,
  ListItemText, MenuItem, Pagination, Paper, Select, Stack, Switch, Tab, Table,
  TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import SearchIcon             from '@mui/icons-material/Search';
import CalendarTodayIcon      from '@mui/icons-material/CalendarToday';
import LocationOnIcon         from '@mui/icons-material/LocationOn';
import PeopleIcon             from '@mui/icons-material/People';
import SortIcon               from '@mui/icons-material/Sort';
import CampaignIcon           from '@mui/icons-material/Campaign';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import DirectionsIcon         from '@mui/icons-material/Directions';
import OpenInNewIcon          from '@mui/icons-material/OpenInNew';
import EditIcon               from '@mui/icons-material/EditOutlined';
import SettingsIcon           from '@mui/icons-material/TuneOutlined';
import ShoppingCartIcon       from '@mui/icons-material/ShoppingCart';
import AddIcon                from '@mui/icons-material/Add';
import DeleteIcon             from '@mui/icons-material/DeleteOutline';
import PublishIcon            from '@mui/icons-material/PublishOutlined';
import DoneAllIcon            from '@mui/icons-material/DoneAll';
import BlockIcon              from '@mui/icons-material/BlockOutlined';
import SaveIcon               from '@mui/icons-material/Save';
import GroupAddIcon           from '@mui/icons-material/GroupAddOutlined';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import MyLocationIcon         from '@mui/icons-material/MyLocation';
import { useTheme, alpha }    from '@mui/material/styles';
// Lazy-loaded so @mui/x-date-pickers only evaluates once mounted — same reason
// InteractiveMap below is lazy: an eagerly-imported heavy third-party dependency
// in a federated remote's exposed module can execute before this remote's shared
// React/MUI singletons finish resolving, throwing a bare "Cannot read properties
// of null (reading 'useContext')" instead of any MUI-specific error.
const AppDateTimePicker = lazy(() => import('./components/AppDateTimePicker'));

// Lazy-load so Leaflet CSS is only injected when the Location tab is opened —
// same component ManageEvents.tsx (mfe-admin) uses, copied here so residents get
// the identical create/edit form (mfe-admin and mfe-events are independently
// buildable remotes and don't share components across the federation boundary).
const InteractiveMap = lazy(() =>
  import('./components/InteractiveMap').then(m => ({ default: m.InteractiveMap }))
);

// ── Types ─────────────────────────────────────────────────────────────────────

interface Category { id: string; name: string; color_hex: string | null }

// Listing returns name/price/is_free; detail returns the full shape
interface TicketTypeSummary { name: string; price: number; is_free: boolean }

interface TicketType extends TicketTypeSummary {
  id: string; description: string | null;
  capacity: number | null; sort_order: number; is_active: boolean;
}

interface Announcement {
  id: string; author_name: string; title: string; body: string; sent_at: string;
}

interface EventItem {
  id: string; title: string; description: string | null;
  venue_lat: number | null; venue_lng: number | null; venue_address: string | null;
  start_time: string; end_time: string; venue: string;
  capacity: number | null; status: string;
  ticket_price: number; price_currency: string; is_free: boolean;
  cancel_freeze_at: string | null;
  category_id: string | null; category_name: string | null; category_color: string | null;
  organizer_name: string;
  registration_count: number; confirmed_tickets: number;
  spots_remaining: number | null; is_sold_out: boolean;
  announcements?: Announcement[];
  ticket_types?: TicketTypeSummary[];
}

interface NominatimResult { place_id: string; display_name: string; lat: string; lon: string }

interface EventListResponse {
  events: EventItem[]; total: number; page: number; limit: number; total_pages: number;
}

// ── Role detection from JWT (no verification — display only) ─────────────────

function getRoleFromToken(token: string | null): string | null {
  if (!token) return null;
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64));
    const roles: string[] = payload?.realm_access?.roles ?? [];
    for (const r of ['admin', 'committee_member', 'resident', 'security_guard', 'sponsor']) {
      if (roles.includes(r)) return r;
    }
    return null;
  } catch { return null; }
}

// ── API ───────────────────────────────────────────────────────────────────────

function apiBase(): string {
  const isLocalDev = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (isLocalDev && window.location.port === '4001') return `${window.location.origin}/api/events`;
  return '/api/events';
}

async function eventsApiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  const ct = res.headers.get('content-type') ?? '';
  if (!res.ok) {
    if (ct.includes('application/json')) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { detail?: string }).detail ?? `HTTP ${res.status}`);
    }
    throw new Error(`HTTP ${res.status} — event service may not be running`);
  }
  if (res.status === 204) return undefined as T;
  if (!ct.includes('application/json')) {
    throw new Error('Event service is not reachable.');
  }
  return res.json() as Promise<T>;
}

// ── Payments-service API (organizer fund view) ────────────────────────────────

function paymentsApiBase(): string {
  const isLocalDev = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (isLocalDev && window.location.port === '4001') return `${window.location.origin}/api/payments`;
  return '/api/payments';
}

async function paymentsApiFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${paymentsApiBase()}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function paymentsApiMutate<T>(
  path: string, token: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body?: unknown,
): Promise<T | null> {
  const res = await fetch(`${paymentsApiBase()}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error((errBody as { detail?: string }).detail ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json() as Promise<T>;
}

function fmtMoney(n: number | string, currency: string) {
  return `${currency === 'INR' ? '₹' : currency + ' '}${Number(n).toLocaleString('en-IN')}`;
}

// ── Location search (Nominatim / OpenStreetMap) ───────────────────────────────

async function nominatimSearch(q: string): Promise<NominatimResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=6&addressdetails=1`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!res.ok) return [];
  return res.json();
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!res.ok) return null;
  const data = await res.json();
  return data.display_name ?? null;
}

function getCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return; }
    // enableHighAccuracy asks the OS to use GPS/Wi-Fi positioning over coarse IP-based
    // lookup where available — helps on phones/laptops with Wi-Fi scanning, does nothing
    // on a desktop with no such hardware (there the OS has no better signal to give us,
    // so it'll still resolve to an ISP-level approximation; drag the pin to correct it).
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, enableHighAccuracy: true },
    );
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_EMOJI: Record<string, string> = {
  festival: '🪔', sports: '🏅', wellness: '🧘', governance: '🏛',
  kids: '🎡', entertainment: '🎬', cultural: '🎭', music: '🎵', food: '🍽',
};

function categoryEmoji(name: string | null) { return CATEGORY_EMOJI[name?.toLowerCase() ?? ''] ?? '🎉'; }
function eventColor(hex: string | null) { return hex ?? '#6366f1'; }

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

const STATUS_CHIP: Record<string, { label: string; bgcolor: string; color: string }> = {
  draft:     { label: 'Draft',     bgcolor: '#fef3c7', color: '#92400e' },
  cancelled: { label: 'Cancelled', bgcolor: '#fee2e2', color: '#991b1b' },
  completed: { label: 'Completed', bgcolor: '#e0f2fe', color: '#0369a1' },
};

// ── Loading skeleton ──────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <Card variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      <Box sx={{ bgcolor: 'action.disabledBackground', height: 5 }} />
      <CardContent sx={{ p: 2.5 }}>
        {[80, 120, 60, 90, 70].map((w, i) => (
          <Box key={i} sx={{ bgcolor: 'action.hover', borderRadius: 1, height: 14, width: `${w}%`, mb: 1 }} />
        ))}
      </CardContent>
    </Card>
  );
}

// ── Event Detail ──────────────────────────────────────────────────────────────

function EventDetail({
  eventId, token, role, societyName, onBack,
}: {
  eventId: string; token: string | null; role: string | null;
  societyName: string; onBack: () => void;
}) {
  const [event,          setEvent]          = useState<EventItem | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState<string | null>(null);
  const [qty,            setQty]            = useState(1);
  const [ticketQtys,     setTicketQtys]     = useState<Record<string, number>>({});
  const [checkoutSaving, setCheckoutSaving] = useState(false);
  const theme = useTheme();
  const divider = theme.palette.divider;
  const panelBg = theme.palette.action.hover;

  const adjustQty = (id: string, delta: number, cap: number | null) => {
    setTicketQtys(prev => {
      const next = Math.max(0, Math.min(cap ?? 20, (prev[id] ?? 0) + delta));
      const updated = { ...prev, [id]: next };
      if (updated[id] === 0) delete updated[id];
      return updated;
    });
  };

  const isManager = role === 'admin' || role === 'committee_member';

  useEffect(() => {
    setLoading(true);
    setError(null);
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch(`${apiBase()}/events/${eventId}`, { headers })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: EventItem) => { setEvent(d); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [eventId, token]);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}><CircularProgress /></Box>;

  if (error || !event) {
    return (
      <Container maxWidth="md" sx={{ pt: 4 }}>
        <Box component="button" onClick={onBack}
          sx={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6366f1', fontWeight: 600, mb: 2, p: 0 }}>
          ← Back to Events
        </Box>
        <Alert severity="error">Failed to load event: {error}</Alert>
      </Container>
    );
  }

  const color    = eventColor(event.category_color);
  const emoji    = categoryEmoji(event.category_name);
  const hasTypes = (event.ticket_types ?? []).length > 0;
  // Detail endpoint returns full TicketType; cast is safe here
  const sortedTypes = ([...(event.ticket_types ?? [])] as TicketType[])
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  // Single-price total (used when no ticket types)
  const singleTotal = Number(event.ticket_price) * qty;

  // Multi-ticket total
  const typedTotal = sortedTypes.reduce((sum, tt) => {
    const q = ticketQtys[tt.id] ?? 0;
    return sum + (tt.is_free ? 0 : Number(tt.price) * q);
  }, 0);
  const typedCount = Object.values(ticketQtys).reduce((a, b) => a + b, 0);
  const canProceed = event.status === 'published' && !event.is_sold_out &&
    (hasTypes ? typedCount > 0 : (event.is_free || qty > 0));
  const statusChip = STATUS_CHIP[event.status];

  return (
    <Box component="main" sx={{ bgcolor: 'background.default', minHeight: 'calc(100vh - 64px)', py: { xs: 2, md: 4 } }}>
      <Container maxWidth="md">

        {/* Back + admin actions row */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          <Box component="button" onClick={onBack}
            sx={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6366f1', fontWeight: 600, fontSize: 14, p: 0, mr: 'auto' }}>
            ← Back to Events
          </Box>
          {isManager && (
            <Tooltip title="Edit this event in the management console">
              <Button
                size="small" variant="outlined" startIcon={<EditIcon />}
                onClick={() => { window.location.href = '/manage'; }}
                sx={{ fontWeight: 600, fontSize: 12 }}>
                Edit Event
              </Button>
            </Tooltip>
          )}
          {isManager && (
            <Tooltip title="Go to Manage Events">
              <Button
                size="small" variant="outlined" startIcon={<SettingsIcon />}
                onClick={() => { window.location.href = '/manage'; }}
                sx={{ fontWeight: 600, fontSize: 12 }}>
                Manage
              </Button>
            </Tooltip>
          )}
        </Box>

        {/* Status banner for non-published events */}
        {statusChip && (
          <Alert severity={event.status === 'cancelled' ? 'error' : event.status === 'draft' ? 'warning' : 'info'}
            sx={{ mb: 2, borderRadius: 1.5 }}>
            {event.status === 'draft'     && 'This event is a draft — not yet visible to residents.'}
            {event.status === 'cancelled' && 'This event has been cancelled.'}
            {event.status === 'completed' && 'This event has concluded.'}
          </Alert>
        )}

        {/* Hero */}
        <Box sx={{ bgcolor: color, borderRadius: { xs: '8px 8px 0 0', md: '12px 12px 0 0' }, p: { xs: 2.5, md: 4 }, color: '#fff' }}>
          <Typography fontSize={{ xs: 40, md: 52 }} lineHeight={1} mb={1}>{emoji}</Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
            {event.category_name && (
              <Chip label={event.category_name} size="small"
                sx={{ bgcolor: 'rgba(255,255,255,0.25)', color: '#fff', fontWeight: 600 }} />
            )}
            {statusChip && (
              <Chip label={statusChip.label} size="small"
                sx={{ bgcolor: statusChip.bgcolor, color: statusChip.color, fontWeight: 700 }} />
            )}
          </Box>
          <Typography variant="h4" fontWeight={800} sx={{ fontSize: { xs: 22, md: 32 } }}>{event.title}</Typography>
          <Typography sx={{ mt: 1, opacity: 0.85, fontSize: { xs: 13, md: 15 } }}>
            {formatDate(event.start_time)} · {formatTime(event.start_time)} · {event.venue}
          </Typography>
        </Box>

        <Box sx={{ border: '1px solid', borderColor: divider, borderTop: 'none', borderRadius: { xs: '0 0 8px 8px', md: '0 0 12px 12px' }, bgcolor: 'background.paper', p: { xs: 2, md: 3 } }}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={7}>

              <Typography fontWeight={700} mb={1}>About this event</Typography>
              <Typography color="text.secondary" fontSize={14} lineHeight={1.8}>
                {event.description ?? `Join us for this event at ${societyName}. All residents and their guests are welcome.`}
              </Typography>

              {/* Event details box */}
              <Box sx={{ mt: 3, p: 2, bgcolor: panelBg, borderRadius: 2, border: '1px solid', borderColor: divider }}>
                <Typography fontSize={12} fontWeight={600} color="text.secondary" textTransform="uppercase" letterSpacing={0.5} mb={1.5}>
                  Event Details
                </Typography>
                {[
                  ['Organiser',    event.organizer_name],
                  ['Date',         formatDate(event.start_time)],
                  ['Time',         `${formatTime(event.start_time)} – ${formatTime(event.end_time)}`],
                  ['Venue',        event.venue],
                  ['Capacity',     event.capacity ? `${event.capacity} spots` : 'Unlimited'],
                  ['Availability', event.is_sold_out
                    ? 'Sold out'
                    : event.spots_remaining != null
                      ? `${event.spots_remaining} spots left`
                      : 'Open'],
                ].map(([label, val]) => (
                  <Box key={label} sx={{ display: 'flex', gap: 2, mb: 0.75, flexWrap: 'wrap' }}>
                    <Typography fontSize={13} color="text.secondary" sx={{ minWidth: 90, flexShrink: 0 }}>{label}</Typography>
                    <Typography fontSize={13} fontWeight={500}>{val}</Typography>
                  </Box>
                ))}
              </Box>

              {/* Location & Directions — map + navigation buttons */}
              {event.venue_lat != null && event.venue_lng != null && (
                <Box sx={{ mt: 3 }}>
                  <Typography fontWeight={700} mb={1.5} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LocationOnIcon sx={{ fontSize: 18, color: '#6366f1' }} /> Venue & Directions
                  </Typography>

                  <Typography fontSize={14} fontWeight={600}>{event.venue}</Typography>
                  {event.venue_address && (
                    <Typography fontSize={12} color="text.secondary" mt={0.25} mb={1.5}>
                      {event.venue_address}
                    </Typography>
                  )}

                  {/* OpenStreetMap embed — no API key required */}
                  <Box sx={{ borderRadius: 2, overflow: 'hidden', border: '1px solid', borderColor: divider, mb: 1.5 }}>
                    <Box
                      component="iframe"
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${event.venue_lng - 0.006},${event.venue_lat - 0.004},${event.venue_lng + 0.006},${event.venue_lat + 0.004}&layer=mapnik&marker=${event.venue_lat},${event.venue_lng}`}
                      width="100%"
                      height="260"
                      frameBorder={0}
                      loading="lazy"
                      title="Venue location map"
                      sx={{ display: 'block', border: 'none' }}
                    />
                  </Box>

                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {[
                      { label: 'Google Maps', href: `https://www.google.com/maps?q=${event.venue_lat},${event.venue_lng}` },
                      { label: 'Apple Maps',  href: `https://maps.apple.com/?q=${event.venue_lat},${event.venue_lng}` },
                      { label: 'Bing Maps',   href: `https://www.bing.com/maps?cp=${event.venue_lat}~${event.venue_lng}&lvl=16` },
                    ].map(m => (
                      <Button key={m.label} size="small" variant="outlined"
                        startIcon={<DirectionsIcon />} endIcon={<OpenInNewIcon sx={{ fontSize: 11 }} />}
                        href={m.href} target="_blank" rel="noopener noreferrer"
                        sx={{ fontSize: 12, borderColor: divider, color: 'text.secondary',
                          '&:hover': { borderColor: color, color } }}>
                        {m.label}
                      </Button>
                    ))}
                  </Stack>
                </Box>
              )}

              {/* Announcements */}
              {(event.announcements ?? []).length > 0 && (
                <Box sx={{ mt: 3 }}>
                  <Typography fontWeight={700} mb={1.5} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CampaignIcon sx={{ fontSize: 18 }} /> Announcements
                  </Typography>
                  <Stack spacing={1.5}>
                    {(event.announcements ?? []).map(ann => (
                      <Box key={ann.id} sx={{ p: 2, bgcolor: alpha(theme.palette.primary.main, 0.08), borderRadius: 2, borderLeft: '3px solid #6366f1' }}>
                        <Typography fontSize={13} fontWeight={700}>{ann.title}</Typography>
                        <Typography fontSize={12} color="text.secondary" mb={0.5}>{ann.author_name} · {formatDate(ann.sent_at)}</Typography>
                        <Typography fontSize={13} lineHeight={1.7}>{ann.body}</Typography>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              )}
            </Grid>

            {/* Registration card */}
            <Grid item xs={12} md={5}>
              <Box sx={{ border: '1px solid', borderColor: divider, borderRadius: 2, overflow: 'hidden',
                position: { md: 'sticky' }, top: { md: 80 } }}>

                {/* Card header */}
                <Box sx={{ bgcolor: color, px: 2.5, py: 2 }}>
                  <Typography fontWeight={800} fontSize={16} color="#fff">
                    {event.is_free && !hasTypes ? 'Free Entry' : 'Select Tickets'}
                  </Typography>
                  {event.spots_remaining != null && !event.is_sold_out && (
                    <Typography fontSize={12} sx={{ color: 'rgba(255,255,255,0.85)', mt: 0.25 }}>
                      {event.spots_remaining} spots remaining
                    </Typography>
                  )}
                </Box>

                <Box sx={{ p: 2.5 }}>

                  {/* ── Multi-type ticket selector ──────────────────────── */}
                  {hasTypes && (
                    <Stack spacing={1.5} sx={{ mb: 2 }}>
                      {sortedTypes.map(tt => {
                        const q = ticketQtys[tt.id] ?? 0;
                        const lineTotal = tt.is_free ? 0 : Number(tt.price) * q;
                        return (
                          <Box key={tt.id} sx={{
                            border: `1.5px solid ${q > 0 ? color : divider}`,
                            borderRadius: 2, p: 1.5,
                            bgcolor: q > 0 ? `${color}08` : 'background.paper',
                            transition: 'border-color .15s, background .15s',
                          }}>
                            {/* Ticket name + price */}
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                              <Box sx={{ flex: 1, mr: 1 }}>
                                <Typography fontWeight={700} fontSize={14}>{tt.name}</Typography>
                                {tt.description && (
                                  <Typography fontSize={11} color="text.secondary" lineHeight={1.4}>
                                    {tt.description}
                                  </Typography>
                                )}
                                {tt.capacity != null && (
                                  <Typography fontSize={11} color="text.secondary">
                                    Max {tt.capacity} tickets
                                  </Typography>
                                )}
                              </Box>
                              <Typography fontWeight={800} fontSize={15}
                                sx={{ color: tt.is_free ? 'success.main' : color, flexShrink: 0 }}>
                                {tt.is_free ? 'Free' : `₹${Number(tt.price).toLocaleString('en-IN')}`}
                              </Typography>
                            </Box>

                            {/* Qty stepper */}
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                                {([
                                  ['−', () => adjustQty(tt.id, -1, tt.capacity)],
                                  ['+', () => adjustQty(tt.id, +1, tt.capacity)],
                                ] as [string, () => void][]).map(([lbl, fn], i) => (
                                  <Box key={lbl} component="button" onClick={fn}
                                    sx={{
                                      width: 32, height: 32,
                                      border: '1.5px solid',
                                      borderColor: q > 0 ? color : divider,
                                      borderRadius: i === 0 ? '8px 0 0 8px' : '0 8px 8px 0',
                                      cursor: 'pointer',
                                      bgcolor: q > 0 && lbl === '+' ? color : panelBg,
                                      color:   q > 0 && lbl === '+' ? '#fff' : 'text.primary',
                                      fontSize: 18, fontWeight: 700,
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      transition: 'all .15s',
                                      '&:hover': { opacity: 0.85 },
                                    }}
                                  >
                                    {lbl}
                                  </Box>
                                ))}
                                <Typography fontWeight={700} fontSize={15}
                                  sx={{ width: 36, textAlign: 'center', border: '1.5px solid',
                                    borderLeft: 'none', borderRight: 'none',
                                    borderColor: q > 0 ? color : divider,
                                    height: 32, lineHeight: '29px' }}>
                                  {q}
                                </Typography>
                              </Box>

                              {q > 0 && !tt.is_free && (
                                <Typography fontSize={13} fontWeight={700} sx={{ color }}>
                                  = ₹{lineTotal.toLocaleString('en-IN')}
                                </Typography>
                              )}
                              {q > 0 && tt.is_free && (
                                <Typography fontSize={12} color="success.main" fontWeight={600}>✓ Added</Typography>
                              )}
                            </Box>
                          </Box>
                        );
                      })}
                    </Stack>
                  )}

                  {/* ── Single-price qty stepper (no ticket types) ──────── */}
                  {!hasTypes && !event.is_free && (
                    <Box sx={{ mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                        <Typography fontSize={14} fontWeight={600}>
                          ₹{Number(event.ticket_price).toLocaleString('en-IN')} per ticket
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                          {([['−', () => setQty(q => Math.max(1, q - 1))], ['+', () => setQty(q => Math.min(10, q + 1))]] as [string, () => void][]).map(([lbl, fn], i) => (
                            <Box key={lbl} component="button" onClick={fn}
                              sx={{
                                width: 32, height: 32, border: '1.5px solid', borderColor: divider,
                                borderRadius: i === 0 ? '8px 0 0 8px' : '0 8px 8px 0',
                                cursor: 'pointer', bgcolor: panelBg, color: 'text.primary', fontSize: 18, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                              {lbl}
                            </Box>
                          ))}
                          <Typography fontWeight={700} fontSize={15}
                            sx={{ width: 36, textAlign: 'center', border: '1.5px solid', borderColor: divider,
                              borderLeft: 'none', borderRight: 'none', height: 32, lineHeight: '29px' }}>
                            {qty}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  )}

                  {/* ── Order summary ────────────────────────────────────── */}
                  {(hasTypes ? typedCount > 0 : (!event.is_free && qty > 0)) && (
                    <Box sx={{ bgcolor: panelBg, borderRadius: 1.5, p: 1.5, mb: 2 }}>
                      {hasTypes
                        ? sortedTypes.filter(tt => (ticketQtys[tt.id] ?? 0) > 0).map(tt => (
                            <Box key={tt.id} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                              <Typography fontSize={12} color="text.secondary">
                                {tt.name} × {ticketQtys[tt.id]}
                              </Typography>
                              <Typography fontSize={12} fontWeight={600}>
                                {tt.is_free ? 'Free' : `₹${(Number(tt.price) * (ticketQtys[tt.id] ?? 0)).toLocaleString('en-IN')}`}
                              </Typography>
                            </Box>
                          ))
                        : null
                      }
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 1,
                        borderTop: hasTypes && typedCount > 0 ? `1px solid ${divider}` : 'none', mt: hasTypes ? 0.5 : 0 }}>
                        <Typography fontWeight={700}>Total</Typography>
                        <Typography fontWeight={800} sx={{ color }}>
                          {(hasTypes ? typedTotal : singleTotal) === 0
                            ? 'Free'
                            : `₹${(hasTypes ? typedTotal : singleTotal).toLocaleString('en-IN')}`}
                        </Typography>
                      </Box>
                    </Box>
                  )}

                  {/* ── CTA button ───────────────────────────────────────── */}
                  <Box component="button"
                    disabled={!canProceed || checkoutSaving}
                    onClick={async () => {
                      if (!canProceed || checkoutSaving) return;
                      if (!token) { window.location.href = '/'; return; }
                      setCheckoutSaving(true);
                      const tickets = hasTypes
                        ? sortedTypes.filter(tt => (ticketQtys[tt.id] ?? 0) > 0).map(tt => ({
                            id: tt.id, name: tt.name,
                            qty: ticketQtys[tt.id], price: Number(tt.price), is_free: tt.is_free,
                          }))
                        : [{ id: null, name: 'General Entry', qty, price: Number(event.ticket_price), is_free: event.is_free }];
                      try {
                        await fetch('/api/registrations/registrations/cart', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                          body: JSON.stringify({
                            event_id:    event.id,
                            event_title: event.title,
                            event_venue: event.venue,
                            event_start: event.start_time,
                            currency:    event.price_currency,
                            tickets,
                          }),
                        });
                      } catch { /* navigate anyway */ }
                      window.location.href = '/checkout';
                    }}
                    sx={{
                      width: '100%', border: 'none', borderRadius: 1.5, py: 1.4,
                      fontSize: 14, fontWeight: 700,
                      cursor: canProceed ? 'pointer' : 'not-allowed',
                      bgcolor: canProceed ? color : 'action.disabledBackground',
                      color:   canProceed ? '#fff'  : 'text.disabled',
                      transition: 'opacity .15s',
                      '&:hover': canProceed ? { opacity: 0.9 } : {},
                    }}>
                    {checkoutSaving
                      ? 'Saving…'
                      : event.is_sold_out
                        ? 'Sold Out'
                        : event.status !== 'published'
                          ? 'Registrations Closed'
                          : hasTypes
                            ? (typedCount === 0 ? 'Select at least one ticket' : `Proceed to Checkout (${typedCount} ticket${typedCount > 1 ? 's' : ''})`)
                            : event.is_free
                              ? 'Register for Free'
                              : 'Proceed to Checkout'}
                  </Box>

                  {/* Edit shortcut for managers */}
                  {isManager && (
                    <Button fullWidth variant="outlined" startIcon={<EditIcon />} size="small"
                      sx={{ mt: 1.5, fontSize: 12 }}
                      onClick={() => { window.location.href = '/manage'; }}>
                      Edit this event
                    </Button>
                  )}

                </Box>{/* end p:2.5 content */}
              </Box>{/* end card */}
            </Grid>
          </Grid>
        </Box>
      </Container>
    </Box>
  );
}

// ── My Events (resident self-service organizer view) ─────────────────────────
// Lets a resident who created an event (organizer_id == self) manage just that
// event, without any access to the admin /manage console or other organizers'
// events. Uses the *same* create/edit form as mfe-admin's ManageEvents.tsx
// (LocationTab/TicketTypesTab/EventForm below are ports of that file, kept
// pixel-for-pixel identical since mfe-admin and mfe-events are independently
// buildable remotes that don't share components across the federation boundary).

function toLocalDT(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function mapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

// ── Location tab (search + draggable map pin) ─────────────────────────────────

function LocationTab({
  venue, venueAddress, venueLat, venueLng, onChange,
}: {
  venue: string; venueAddress: string; venueLat: string; venueLng: string;
  onChange: (patch: { venue?: string; venueAddress?: string; venueLat?: string; venueLng?: string }) => void;
}) {
  const [query,       setQuery]       = useState(venue || venueAddress);
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [searching,   setSearching]   = useState(false);
  const [locating,    setLocating]    = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [locatingMe,  setLocatingMe]  = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lat = parseFloat(venueLat);
  const lng = parseFloat(venueLng);
  const hasCoords    = !isNaN(lat) && !isNaN(lng);
  const hasAddress   = venueAddress.trim().length > 0;
  const needsGeocode = hasAddress && !hasCoords;

  const handleMapPositionChange = async (newLat: number, newLng: number) => {
    onChange({ venueLat: String(newLat), venueLng: String(newLng) });
    if (!venueAddress.trim()) {
      const display = await reverseGeocode(newLat, newLng);
      if (display) onChange({ venueAddress: display });
    }
  };

  const useCurrentLocation = useCallback(async () => {
    setLocatingMe(true);
    setLocateError(null);
    const pos = await getCurrentPosition();
    if (pos) {
      await handleMapPositionChange(pos.lat, pos.lng);
    } else {
      setLocateError('Couldn\'t detect your location — search for an address above, or open the map and drag the pin to the right spot.');
    }
    setLocatingMe(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueAddress]);

  // If there's neither an address nor coords yet (a brand-new event), try defaulting the
  // map to the organizer's current location so it opens immediately instead of requiring a
  // search first. If location access is denied/unavailable, useCurrentLocation surfaces a
  // warning and leaves hasCoords false — the "enter an address" prompt below covers that
  // case instead of silently pinning a wrong default location.
  useEffect(() => {
    if (needsGeocode) { void geocodeAddress(venueAddress); }
    else if (!hasCoords && !hasAddress) { void useCurrentLocation(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const geocodeAddress = async (text: string) => {
    if (!text.trim()) return;
    setLocating(true); setLocateError(null);
    try {
      const results = await nominatimSearch(text);
      if (results.length === 0) {
        setLocateError(`No location found for "${text}". Try a more specific address or city name.`);
        return;
      }
      const r = results[0];
      onChange({ venueLat: r.lat, venueLng: r.lon });
      if (!venueAddress) onChange({ venueAddress: r.display_name });
    } catch {
      setLocateError('Could not reach the geocoding service. Check your internet connection.');
    } finally {
      setLocating(false);
    }
  };

  const searchSuggestions = useCallback(async (q: string) => {
    if (q.length < 3) { setSuggestions([]); return; }
    setSearching(true);
    try { setSuggestions(await nominatimSearch(q)); }
    catch { /* ignore */ }
    finally { setSearching(false); }
  }, []);

  const handleSearchInput = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void searchSuggestions(val), 500);
  };

  const selectSuggestion = (r: NominatimResult) => {
    const shortName = r.display_name.split(',')[0];
    setQuery(shortName);
    setSuggestions([]);
    setLocateError(null);
    onChange({ venue: shortName, venueAddress: r.display_name, venueLat: r.lat, venueLng: r.lon });
  };

  return (
    <Stack spacing={2} sx={{ pt: 1 }}>
      <Box>
        <TextField
          label="Search venue / address" size="small" fullWidth value={query}
          onChange={e => handleSearchInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setSuggestions([]); void geocodeAddress(query); } }}
          placeholder="e.g. Whitefield Bengaluru, Society Clubhouse…"
          helperText="Type and pick a suggestion, or press Enter to locate"
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment>,
            endAdornment: searching ? <InputAdornment position="end"><CircularProgress size={16} /></InputAdornment> : null,
          }}
        />
        {suggestions.length > 0 && (
          <Paper variant="outlined" sx={{ borderRadius: 1.5, mt: 0.5, maxHeight: 200, overflow: 'auto', zIndex: 10, position: 'relative' }}>
            <List dense disablePadding>
              {suggestions.map(r => (
                <ListItem key={r.place_id} disablePadding divider>
                  <ListItemButton onClick={() => selectSuggestion(r)}>
                    <LocationOnIcon sx={{ fontSize: 15, color: '#6366f1', mr: 1, flexShrink: 0 }} />
                    <ListItemText
                      primary={r.display_name.split(',')[0]}
                      secondary={r.display_name.split(',').slice(1, 3).join(',').trim()}
                      primaryTypographyProps={{ fontSize: 13, fontWeight: 600 }}
                      secondaryTypographyProps={{ fontSize: 11 }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Paper>
        )}
      </Box>

      <Box>
        <TextField
          label="Full address" size="small" fullWidth multiline rows={2}
          value={venueAddress} onChange={e => onChange({ venueAddress: e.target.value })}
          placeholder="Street, area, city, state — shown to attendees"
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
          <Button size="small" variant={needsGeocode ? 'contained' : 'outlined'} color={needsGeocode ? 'primary' : 'inherit'}
            startIcon={locating ? <CircularProgress size={14} color="inherit" /> : <LocationOnIcon sx={{ fontSize: 16 }} />}
            disabled={locating || !hasAddress} onClick={() => void geocodeAddress(venueAddress || query)}
            sx={{ fontSize: 12, textTransform: 'none', fontWeight: 600 }}>
            {locating ? 'Locating…' : 'Find on Map'}
          </Button>
          {needsGeocode && !locating && (
            <Typography fontSize={11} color="warning.main" fontWeight={600}>⚠ Address entered but no coordinates yet — click "Find on Map"</Typography>
          )}
          {hasCoords && !locating && (
            <Typography fontSize={11} color="success.main" fontWeight={600}>✓ Coordinates set</Typography>
          )}
        </Box>
        {locateError && (
          <Alert severity="warning" onClose={() => setLocateError(null)} sx={{ mt: 1, py: 0.5, fontSize: 12 }}>{locateError}</Alert>
        )}
      </Box>

      <Box>
        <Typography fontSize={12} fontWeight={700} color="text.secondary" textTransform="uppercase" letterSpacing={0.5} mb={1}>
          GPS Coordinates
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={6}>
            <TextField label="Latitude" size="small" fullWidth value={venueLat}
              onChange={e => onChange({ venueLat: e.target.value })} placeholder="e.g. 12.9716"
              InputProps={{ startAdornment: <InputAdornment position="start"><Typography fontSize={11} color="text.secondary" fontFamily="monospace">lat</Typography></InputAdornment> }} />
          </Grid>
          <Grid item xs={6}>
            <TextField label="Longitude" size="small" fullWidth value={venueLng}
              onChange={e => onChange({ venueLng: e.target.value })} placeholder="e.g. 77.5946"
              InputProps={{ startAdornment: <InputAdornment position="start"><Typography fontSize={11} color="text.secondary" fontFamily="monospace">lng</Typography></InputAdornment> }} />
          </Grid>
        </Grid>
        {hasCoords && (
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, mt: 1, px: 1.5, py: 0.5, bgcolor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 1.5 }}>
            <LocationOnIcon sx={{ fontSize: 14, color: '#16a34a' }} />
            <Typography fontSize={12} fontWeight={700} color="#166534" fontFamily="monospace">{lat.toFixed(6)},&nbsp;{lng.toFixed(6)}</Typography>
          </Box>
        )}
      </Box>

      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 1 }}>
          <Box>
            <Typography fontSize={12} fontWeight={700} color="text.secondary" textTransform="uppercase" letterSpacing={0.5}>
              Map — drag the pin or click to set location
            </Typography>
            <Typography fontSize={11} color="text.secondary">
              "Use current location" is often approximate on desktops (no GPS) — always drag the pin to the exact spot.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Button size="small" variant="text"
              startIcon={locatingMe ? <CircularProgress size={12} /> : <MyLocationIcon sx={{ fontSize: 14 }} />}
              onClick={() => void useCurrentLocation()} disabled={locatingMe}
              sx={{ fontSize: 11, textTransform: 'none', fontWeight: 600 }}>
              Use current location
            </Button>
            {hasCoords && <Typography fontSize={11} color="text.secondary" fontFamily="monospace">{lat.toFixed(5)}, {lng.toFixed(5)}</Typography>}
          </Stack>
        </Box>
        {locatingMe ? (
          <Box sx={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover', borderRadius: 2 }}>
            <CircularProgress size={28} />
          </Box>
        ) : hasCoords ? (
          <Box sx={{ borderRadius: 2, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
            <Suspense fallback={<Box sx={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover' }}><CircularProgress size={28} /></Box>}>
              <InteractiveMap key={`${lat.toFixed(4)}-${lng.toFixed(4)}`} lat={lat} lng={lng} onPositionChange={(la, ln) => void handleMapPositionChange(la, ln)} height={320} />
            </Suspense>
          </Box>
        ) : (
          <Alert severity="info" icon={<LocationOnIcon fontSize="inherit" />} sx={{ borderRadius: 1.5 }}>
            {hasAddress
              ? 'Click "Find on Map" above to geocode the address — then drag the pin to fine-tune.'
              : 'Enter an address and click "Find on Map", or "Use current location" above, to open the map.'}
          </Alert>
        )}
      </Box>

      {hasCoords && (
        <Box>
          <Typography fontSize={12} fontWeight={700} color="text.secondary" textTransform="uppercase" letterSpacing={0.5} mb={1}>
            Open in Navigation App
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {[
              { label: 'Google Maps', href: mapsUrl(lat, lng) },
              { label: 'Apple Maps', href: `https://maps.apple.com/?q=${lat},${lng}` },
              { label: 'Bing Maps', href: `https://www.bing.com/maps?cp=${lat}~${lng}&lvl=16` },
              { label: 'OpenStreetMap', href: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}&zoom=16` },
            ].map(m => (
              <Button key={m.label} size="small" variant="outlined" startIcon={<DirectionsIcon sx={{ fontSize: 14 }} />}
                endIcon={<OpenInNewIcon sx={{ fontSize: 11 }} />} href={m.href} target="_blank" rel="noopener noreferrer"
                sx={{ fontSize: 12, textTransform: 'none', borderColor: 'divider', color: 'text.secondary', '&:hover': { borderColor: '#6366f1', color: '#6366f1', bgcolor: 'action.hover' } }}>
                {m.label}
              </Button>
            ))}
          </Stack>
        </Box>
      )}
    </Stack>
  );
}

// ── Ticket Types tab (inside the form dialog) ─────────────────────────────────

const EMPTY_TT = { name: '', description: '', price: '', is_free: false, capacity: '', sort_order: '' };

function TicketTypesTab({ eventId, token }: { eventId: string | undefined; token: string }) {
  const [types,    setTypes]    = useState<TicketType[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [form,     setForm]     = useState(EMPTY_TT);
  const [editId,   setEditId]   = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving,   setSaving]   = useState(false);

  const loadTypes = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      setTypes(await eventsApiFetch<TicketType[]>(`/events/${eventId}/ticket-types`, token));
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [eventId, token]);

  useEffect(() => { void loadTypes(); }, [loadTypes]);

  const openAdd = () => { setForm(EMPTY_TT); setEditId(null); setShowForm(true); };
  const openEdit = (t: TicketType) => {
    setForm({ name: t.name, description: t.description ?? '', price: String(t.price),
              is_free: t.is_free, capacity: t.capacity != null ? String(t.capacity) : '',
              sort_order: String(t.sort_order) });
    setEditId(t.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name || !eventId) return;
    setSaving(true); setError(null);
    try {
      const body = {
        name: form.name, description: form.description || null,
        price: form.is_free ? 0 : Number(form.price || 0), is_free: form.is_free,
        capacity: form.capacity ? Number(form.capacity) : null,
        sort_order: Number(form.sort_order || 0), is_active: true,
      };
      if (editId) {
        await eventsApiFetch(`/events/${eventId}/ticket-types/${editId}`, token, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await eventsApiFetch(`/events/${eventId}/ticket-types`, token, { method: 'POST', body: JSON.stringify(body) });
      }
      setShowForm(false); setEditId(null);
      void loadTypes();
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await eventsApiFetch(`/events/${eventId}/ticket-types/${id}`, token, { method: 'DELETE' });
      void loadTypes();
    } catch (e: unknown) { setError((e as Error).message); }
  };

  const toggleActive = async (t: TicketType) => {
    try {
      await eventsApiFetch(`/events/${eventId}/ticket-types/${t.id}`, token, { method: 'PUT', body: JSON.stringify({ is_active: !t.is_active }) });
      void loadTypes();
    } catch (e: unknown) { setError((e as Error).message); }
  };

  if (!eventId) {
    return <Alert severity="info" sx={{ mt: 1, borderRadius: 1.5 }}>Save the event as a draft first, then come back here to add ticket types.</Alert>;
  }

  return (
    <Box>
      {error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Typography fontWeight={700} fontSize={14} sx={{ flex: 1 }}>
          Ticket Types ({types.filter(t => t.is_active).length} active)
        </Typography>
        <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={openAdd}>Add Type</Button>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} /></Box>
      ) : types.length === 0 ? (
        <Alert severity="info" sx={{ borderRadius: 1.5 }}>
          No ticket types yet. Single-price from the event details will be used. Add types for sub-events like "Play Area", "Lunch Coupon", "Music Pass", etc.
        </Alert>
      ) : (
        <Stack spacing={1}>
          {[...types].sort((a, b) => a.sort_order - b.sort_order).map(t => (
            <Box key={t.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, opacity: t.is_active ? 1 : 0.55, bgcolor: 'action.hover' }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography fontWeight={700} fontSize={13}>{t.name}</Typography>
                  {!t.is_active && <Chip label="Inactive" size="small" sx={{ height: 16, fontSize: 10 }} />}
                </Box>
                {t.description && <Typography fontSize={11} color="text.secondary" noWrap>{t.description}</Typography>}
                <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5 }}>
                  <Typography fontSize={12} fontWeight={700} color={t.is_free ? 'success.main' : '#6366f1'}>
                    {t.is_free ? 'Free' : `₹${Number(t.price).toLocaleString('en-IN')}`}
                  </Typography>
                  {t.capacity && <Typography fontSize={12} color="text.secondary">Capacity: {t.capacity}</Typography>}
                  <Typography fontSize={12} color="text.secondary">Order: {t.sort_order}</Typography>
                </Box>
              </Box>
              <Stack direction="row" spacing={0.5}>
                <Tooltip title={t.is_active ? 'Deactivate' : 'Activate'}>
                  <Switch size="small" checked={t.is_active} onChange={() => void toggleActive(t)} />
                </Tooltip>
                <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(t)}><EditIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => void handleDelete(t.id)}><DeleteIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
              </Stack>
            </Box>
          ))}
        </Stack>
      )}

      {showForm && (
        <Box sx={{ mt: 2, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, bgcolor: 'action.hover' }}>
          <Typography fontWeight={700} fontSize={13} mb={1.5}>{editId ? 'Edit Ticket Type' : 'New Ticket Type'}</Typography>
          {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
          <Stack spacing={1.5}>
            <Grid container spacing={1.5}>
              <Grid item xs={8}>
                <TextField label="Name *" size="small" fullWidth value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Play Area, Lunch Coupon, Water Games…" />
              </Grid>
              <Grid item xs={4}>
                <TextField label="Sort Order" type="number" size="small" fullWidth value={form.sort_order}
                  onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))} />
              </Grid>
            </Grid>
            <TextField label="Description" size="small" fullWidth multiline rows={2} value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What does this ticket include?" />
            <Grid container spacing={1.5} alignItems="center">
              <Grid item xs={4}>
                <FormControlLabel control={<Switch size="small" checked={form.is_free}
                  onChange={e => setForm(f => ({ ...f, is_free: e.target.checked, price: e.target.checked ? '0' : f.price }))} />}
                  label={<Typography fontSize={12} fontWeight={600}>Free</Typography>} />
              </Grid>
              <Grid item xs={4}>
                <TextField label="Price (₹)" type="number" size="small" fullWidth value={form.price} disabled={form.is_free}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
              </Grid>
              <Grid item xs={4}>
                <TextField label="Capacity (∞ if blank)" type="number" size="small" fullWidth value={form.capacity}
                  onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} />
              </Grid>
            </Grid>
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button size="small" onClick={() => { setShowForm(false); setEditId(null); }}>Cancel</Button>
              <Button size="small" variant="contained" disabled={!form.name || saving}
                startIcon={saving ? <CircularProgress size={12} /> : <SaveIcon />} onClick={() => void handleSave()}>
                {editId ? 'Save' : 'Add'}
              </Button>
            </Stack>
          </Stack>
        </Box>
      )}
    </Box>
  );
}

// ── Event form dialog (3-step save flow — identical to mfe-admin's) ──────────

interface FormState {
  title: string; description: string; venue: string;
  venueAddress: string; venueLat: string; venueLng: string;
  start_time: string; end_time: string; capacity: string;
  ticket_price: string; price_currency: string; is_free: boolean;
  category_id: string; cancel_freeze_at: string;
}

function EventForm({
  open, token, categories, initial, onClose, onSaved, onPublish, onCancel,
}: {
  open: boolean; token: string; categories: Category[];
  initial?: EventItem; onClose: () => void; onSaved: (id?: string) => void;
  onPublish?: () => void; onCancel?: () => void;
}) {
  const [tab,     setTab]     = useState(0);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | undefined>(initial?.id);

  const [form, setForm] = useState<FormState>({
    title: initial?.title ?? '', description: initial?.description ?? '',
    venue: initial?.venue ?? '', venueAddress: initial?.venue_address ?? '',
    venueLat: initial?.venue_lat != null ? String(initial.venue_lat) : '',
    venueLng: initial?.venue_lng != null ? String(initial.venue_lng) : '',
    start_time: initial?.start_time ? toLocalDT(initial.start_time) : '',
    end_time: initial?.end_time ? toLocalDT(initial.end_time) : '',
    capacity: initial?.capacity != null ? String(initial.capacity) : '',
    ticket_price: initial?.ticket_price != null ? String(initial.ticket_price) : '0',
    price_currency: initial?.price_currency ?? 'INR', is_free: initial?.is_free ?? true,
    category_id: initial?.category_id ?? '',
    cancel_freeze_at: initial?.cancel_freeze_at ? toLocalDT(initial.cancel_freeze_at) : '',
  });

  const patch = (p: Partial<FormState>) => setForm(f => ({ ...f, ...p }));

  const freezeTouchedRef = useRef(!!initial);
  useEffect(() => {
    if (freezeTouchedRef.current || !form.start_time) return;
    const start = new Date(form.start_time);
    if (Number.isNaN(start.getTime())) return;
    const suggested = new Date(start.getTime() - 24 * 60 * 60 * 1000);
    patch({ cancel_freeze_at: toLocalDT(suggested.toISOString()) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.start_time]);

  const handleSave = async (nextTab?: number) => {
    setError(null);
    if (!form.title.trim() || !form.venue.trim() || !form.start_time || !form.end_time) {
      setError('Title, venue, and start / end dates are required.');
      setTab(0);
      return;
    }
    if (form.cancel_freeze_at && new Date(form.cancel_freeze_at) >= new Date(form.start_time)) {
      setError('Ticket cancellation freeze time must be before the event start time.');
      setTab(0);
      return;
    }
    setSaving(true);
    try {
      const body = {
        title: form.title, description: form.description || null,
        venue: form.venue, venue_address: form.venueAddress || null,
        venue_lat: form.venueLat ? Number(form.venueLat) : null,
        venue_lng: form.venueLng ? Number(form.venueLng) : null,
        start_time: new Date(form.start_time).toISOString(),
        end_time: new Date(form.end_time).toISOString(),
        capacity: form.capacity ? Number(form.capacity) : null,
        ticket_price: Number(form.ticket_price || 0),
        price_currency: form.price_currency, is_free: form.is_free,
        category_id: form.category_id || null,
        cancel_freeze_at: form.cancel_freeze_at ? new Date(form.cancel_freeze_at).toISOString() : null,
      };
      let id = savedId;
      if (id) {
        await eventsApiFetch(`/events/${id}`, token, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        const res = await eventsApiFetch<{ id: string }>('/events', token, { method: 'POST', body: JSON.stringify(body) });
        id = res.id;
        setSavedId(id);
      }
      onSaved(id);
      if (nextTab !== undefined) setTab(nextTab);
      else onClose();
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const hasId       = !!savedId;
  const isDraft     = initial ? initial.status === 'draft' : hasId;
  const isPublished = initial ? initial.status === 'published' : false;

  const STEP_LABELS = ['1. Event Details', '2. Location', '3. Ticket Types'];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, pb: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {initial ? `Edit — ${initial.title}` : 'Create New Event'}
          {initial && (
            <Chip label={STATUS_CHIP[initial.status]?.label ?? initial.status}
              sx={{ bgcolor: STATUS_CHIP[initial.status]?.bgcolor, color: STATUS_CHIP[initial.status]?.color, fontWeight: 700, fontSize: 11 }} />
          )}
          {!initial && hasId && <Chip label="Draft saved" size="small" color="default" sx={{ fontSize: 11 }} />}
        </Box>
      </DialogTitle>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          {STEP_LABELS.map((label, i) => (
            <Tab key={label} label={label} disabled={i > 0 && !hasId}
              icon={i > 0 && !hasId ? <Typography fontSize={10} color="text.disabled">Save step 1 first</Typography> : undefined}
              iconPosition="end" sx={{ fontSize: 13 }} />
          ))}
        </Tabs>
      </Box>

      <DialogContent dividers sx={{ minHeight: 420 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {tab === 0 && (
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <TextField label="Title *" size="small" fullWidth value={form.title} onChange={e => patch({ title: e.target.value })} />
            <TextField label="Description" size="small" fullWidth multiline rows={3} value={form.description} onChange={e => patch({ description: e.target.value })} />
            <TextField label="Venue / Location Name *" size="small" fullWidth value={form.venue}
              onChange={e => patch({ venue: e.target.value })} placeholder="e.g. Society Clubhouse, Rooftop Garden Block A" />
            <Stack direction="row" spacing={2}>
              <Suspense fallback={<TextField label="Start Date & Time *" size="small" fullWidth sx={{ flex: 1 }} disabled />}>
                <AppDateTimePicker label="Start Date & Time *" required sx={{ flex: 1 }}
                  value={form.start_time ? new Date(form.start_time).toISOString() : ''}
                  onChange={iso => patch({ start_time: iso ? toLocalDT(iso) : '' })} />
              </Suspense>
              <Suspense fallback={<TextField label="End Date & Time *" size="small" fullWidth sx={{ flex: 1 }} disabled />}>
                <AppDateTimePicker label="End Date & Time *" required sx={{ flex: 1 }}
                  value={form.end_time ? new Date(form.end_time).toISOString() : ''}
                  onChange={iso => patch({ end_time: iso ? toLocalDT(iso) : '' })} />
              </Suspense>
            </Stack>
            <Suspense fallback={<TextField label="Ticket Cancellation Freeze Time (optional)" size="small" fullWidth disabled />}>
              <AppDateTimePicker label="Ticket Cancellation Freeze Time (optional)"
                value={form.cancel_freeze_at ? new Date(form.cancel_freeze_at).toISOString() : ''}
                onChange={iso => { freezeTouchedRef.current = true; patch({ cancel_freeze_at: iso ? toLocalDT(iso) : '' }); }}
                helperText="Defaults to 1 day before the start time; clear it to let residents cancel a confirmed ticket any time before the event starts. Must be before the start time." />
            </Suspense>
            <Stack direction="row" spacing={2}>
              <TextField label="Capacity (blank = unlimited)" type="number" size="small" fullWidth sx={{ flex: 1 }} value={form.capacity} onChange={e => patch({ capacity: e.target.value })} />
              <TextField label="Category" select size="small" fullWidth sx={{ flex: 2 }} value={form.category_id} onChange={e => patch({ category_id: e.target.value })}>
                <MenuItem value=""><em>None</em></MenuItem>
                {categories.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </TextField>
            </Stack>
          </Stack>
        )}

        {tab === 1 && (
          <LocationTab
            venue={form.venue} venueAddress={form.venueAddress} venueLat={form.venueLat} venueLng={form.venueLng}
            onChange={p => patch({
              ...(p.venue        !== undefined ? { venue:        p.venue        } : {}),
              ...(p.venueAddress !== undefined ? { venueAddress: p.venueAddress } : {}),
              ...(p.venueLat     !== undefined ? { venueLat:     p.venueLat     } : {}),
              ...(p.venueLng     !== undefined ? { venueLng:     p.venueLng     } : {}),
            })}
          />
        )}

        {tab === 2 && (
          <Stack spacing={3} sx={{ pt: 1 }}>
            <Box>
              <Typography fontSize={12} fontWeight={700} color="text.secondary" textTransform="uppercase" letterSpacing={0.5} mb={1.5}>
                Event Pricing
              </Typography>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={4}>
                  <TextField label="Ticket pricing" select size="small" fullWidth value={form.is_free ? 'true' : 'false'}
                    onChange={e => { const f = e.target.value === 'true'; patch({ is_free: f }); if (f) patch({ ticket_price: '0' }); }}>
                    <MenuItem value="true">Free event</MenuItem>
                    <MenuItem value="false">Paid event</MenuItem>
                  </TextField>
                </Grid>
                {!form.is_free && (
                  <>
                    <Grid item xs={4}>
                      <TextField label="Default ticket price" type="number" size="small" fullWidth value={form.ticket_price} onChange={e => patch({ ticket_price: e.target.value })} />
                    </Grid>
                    <Grid item xs={4}>
                      <TextField label="Currency" select size="small" fullWidth value={form.price_currency} onChange={e => patch({ price_currency: e.target.value })}>
                        {['INR', 'USD', 'GBP', 'EUR', 'SGD', 'AED'].map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                      </TextField>
                    </Grid>
                  </>
                )}
              </Grid>
            </Box>
            <Divider />
            <Box>
              <Typography fontSize={12} fontWeight={700} color="text.secondary" textTransform="uppercase" letterSpacing={0.5} mb={1.5}>
                Ticket Types
              </Typography>
              <TicketTypesTab eventId={savedId} token={token} />
            </Box>
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={1}>
          {isDraft && onPublish && (
            <Button variant="contained" color="success" size="small" startIcon={<PublishIcon />} onClick={onPublish}>
              Publish Event
            </Button>
          )}
          {isPublished && onCancel && (
            <Button variant="outlined" color="error" size="small" startIcon={<BlockIcon />} onClick={onCancel}>
              Cancel Event
            </Button>
          )}
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button onClick={onClose}>Close</Button>
          {tab > 0 && <Button variant="outlined" onClick={() => setTab(tab - 1)}>← Back</Button>}
          {tab < 2 ? (
            <Button variant="contained" onClick={() => void handleSave(tab + 1)} disabled={saving}
              startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}>
              {saving ? 'Saving…' : 'Save & Next →'}
            </Button>
          ) : (
            <Button variant="contained" onClick={() => void handleSave()} disabled={saving}
              startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}>
              {saving ? 'Saving…' : (initial ? 'Save Changes' : 'Save Draft')}
            </Button>
          )}
        </Stack>
      </DialogActions>
    </Dialog>
  );
}

// ── Manage Access dialog (approved-member delegation, organizer-only) ────────
// Port of ManageEvents.tsx's dialog of the same name — same duplication rationale as
// EventForm/LocationTab/TicketTypesTab above.

interface ApprovedMember {
  id: string; user_id: string; user_name: string; user_email: string | null;
  granted_by_name: string; granted_at: string;
}

function ManageAccessDialog({
  open, onClose, eventId, token,
}: { open: boolean; onClose: () => void; eventId: string; token: string }) {
  const [members, setMembers] = useState<ApprovedMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [email,   setEmail]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    eventsApiFetch<ApprovedMember[]>(`/events/${eventId}/permissions`, token)
      .then(setMembers)
      .catch((e: unknown) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [eventId, token]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const grant = async () => {
    if (!email.trim()) return;
    setSaving(true); setError(null);
    try {
      await eventsApiFetch(`/events/${eventId}/permissions`, token, { method: 'POST', body: JSON.stringify({ email }) });
      setEmail('');
      void load();
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const revoke = async (userId: string) => {
    try {
      await eventsApiFetch(`/events/${eventId}/permissions/${userId}`, token, { method: 'DELETE' });
      void load();
    } catch (e: unknown) { setError((e as Error).message); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Manage Access</DialogTitle>
      <DialogContent dividers>
        <Typography fontSize={13} color="text.secondary" mb={2}>
          Approved members can manage this event — edit, publish, ticket types — the same as
          you, but only this one event.
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={22} /></Box>
        ) : (
          <Stack spacing={1} sx={{ mb: 2 }}>
            {members.length === 0 && (
              <Typography fontSize={13} color="text.secondary">No approved members yet.</Typography>
            )}
            {members.map(m => (
              <Box key={m.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
                <Box>
                  <Typography fontWeight={600} fontSize={13}>{m.user_name}</Typography>
                  <Typography fontSize={11} color="text.secondary">{m.user_email}</Typography>
                </Box>
                <Tooltip title="Revoke access">
                  <IconButton size="small" color="error" onClick={() => void revoke(m.user_id)}>
                    <DeleteIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            ))}
          </Stack>
        )}
        <Stack direction="row" spacing={1}>
          <TextField size="small" fullWidth label="Email address" value={email} onChange={e => setEmail(e.target.value)} />
          <Button variant="contained" disabled={saving || !email.trim()} onClick={() => void grant()}>Grant</Button>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Organizer fund view (per-event Finance tab, ported from EventDetails.tsx) ─
// mfe-admin's EventDetails.tsx also has Vendors/Revenue tabs and lives under /manage,
// which residents can't reach — this is the Finance-only slice ported so an organizer
// has somewhere to see their own event's fund data. Vendor/sponsorship management is left
// as a follow-up rather than silently expanding this pass's scope.

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <Grid item xs={6} md={3}>
      <Card variant="outlined" sx={{ borderRadius: 2 }}>
        <CardContent sx={{ textAlign: 'center', py: 2 }}>
          <Typography fontSize={20} fontWeight={800} sx={{ color }}>{value}</Typography>
          <Typography fontSize={11} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, mt: 0.5 }}>{label}</Typography>
        </CardContent>
      </Card>
    </Grid>
  );
}

interface FinanceSummary {
  ticket_revenue: number | string; sponsorship_income: number | string;
  total_expenses: number | string; vendor_pool: number | string;
  net_balance: number | string; sponsor_count: number; complimentary_tickets: number;
}

interface FundExpense {
  id: string; description: string; amount: number | string; currency_code: string;
  category: string; created_by_name: string; created_at: string;
}

const EXPENSE_CATEGORIES = ['venue', 'catering', 'equipment', 'marketing', 'staff', 'other'];

function EventFunds({ event, token, onClose }: { event: EventItem; token: string; onClose: () => void }) {
  const [summary,  setSummary]  = useState<FinanceSummary | null>(null);
  const [expenses, setExpenses] = useState<FundExpense[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [desc,     setDesc]     = useState('');
  const [amount,   setAmount]   = useState('');
  const [category, setCategory] = useState('other');
  const [saving,   setSaving]   = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    Promise.all([
      paymentsApiFetch<FinanceSummary>(`/funds/${event.id}/summary`, token),
      paymentsApiFetch<FundExpense[]>(`/funds/${event.id}/expenses`, token),
    ]).then(([s, ex]) => { setSummary(s); setExpenses(ex); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [event.id, token]);

  useEffect(() => { load(); }, [load]);

  const addExpense = async () => {
    setSaving(true);
    try {
      await paymentsApiMutate(`/funds/${event.id}/expenses`, token, 'POST', {
        description: desc, amount: Number(amount), category,
      });
      setDesc(''); setAmount(''); setCategory('other');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add expense');
    } finally {
      setSaving(false);
    }
  };

  const removeExpense = async (id: string) => {
    await paymentsApiMutate(`/funds/expenses/${id}`, token, 'DELETE');
    load();
  };

  const downloadExport = async (format: 'xlsx' | 'pdf') => {
    const res = await fetch(`${paymentsApiBase()}/funds/${event.id}/export.${format}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { setError(`Failed to generate ${format} export`); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `fund-report-${event.id}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyShareLink = async () => {
    try {
      const link = await paymentsApiMutate<{ path: string; expires_at: string }>(
        `/funds/${event.id}/share-link`, token, 'POST',
      );
      if (!link) return;
      const fullUrl = `${window.location.origin}${link.path}`;
      await navigator.clipboard.writeText(fullUrl);
      setShareMsg(`Link copied — valid until ${new Date(link.expires_at).toLocaleDateString('en-IN')}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create share link');
    }
  };

  return (
    <Box component="main" sx={{ bgcolor: 'background.default', minHeight: 'calc(100vh - 64px)', py: { xs: 2, md: 4 } }}>
      <Container maxWidth="md">
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
          <Box component="button" onClick={onClose}
            sx={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6366f1', fontWeight: 600, fontSize: 14, p: 0 }}>
            ← Back to My Events
          </Box>
          <Typography variant="h5" fontWeight={800} sx={{ flex: 1 }}>{event.title} — Funds</Typography>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
        {shareMsg && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setShareMsg(null)}>{shareMsg}</Alert>}
        {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>}

        {!loading && (
          <>
            <Stack direction="row" spacing={1.5} justifyContent="flex-end" sx={{ mb: 2 }}>
              <Button size="small" variant="outlined" onClick={() => downloadExport('xlsx')}>Download Excel</Button>
              <Button size="small" variant="outlined" onClick={() => downloadExport('pdf')}>Download PDF</Button>
              <Button size="small" variant="outlined" onClick={() => void copyShareLink()}>Copy Share Link</Button>
            </Stack>

            {summary && (
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <StatCard label="Ticket Revenue" value={fmtMoney(summary.ticket_revenue, 'INR')} color="#0ea5e9" />
                <StatCard label="Sponsorship Income" value={fmtMoney(summary.sponsorship_income, 'INR')} color="#8b5cf6" />
                <StatCard label="Total Expenses" value={fmtMoney(summary.total_expenses, 'INR')} color="#ef4444" />
                <StatCard label="Net Balance" value={fmtMoney(summary.net_balance, 'INR')}
                  color={Number(summary.net_balance) >= 0 ? '#10b981' : '#ef4444'} />
              </Grid>
            )}

            <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', mb: 3 }}>
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    {['Description', 'Category', 'Amount', 'Logged By', ''].map(h => (
                      <TableCell key={h} sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'text.secondary' }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {expenses.length === 0 && (
                    <TableRow><TableCell colSpan={5}>
                      <Typography fontSize={13} color="text.secondary" textAlign="center" py={2}>No expenses logged yet.</Typography>
                    </TableCell></TableRow>
                  )}
                  {expenses.map(e => (
                    <TableRow key={e.id} hover>
                      <TableCell><Typography fontSize={13}>{e.description}</Typography></TableCell>
                      <TableCell><Chip label={e.category} size="small" sx={{ textTransform: 'capitalize' }} /></TableCell>
                      <TableCell><Typography fontWeight={700} fontSize={13}>{fmtMoney(e.amount, e.currency_code)}</Typography></TableCell>
                      <TableCell><Typography fontSize={12} color="text.secondary">{e.created_by_name}</Typography></TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => void removeExpense(e.id)}><DeleteIcon sx={{ fontSize: 16 }} /></IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>

            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap alignItems="center">
              <TextField size="small" label="Description" value={desc} onChange={e => setDesc(e.target.value)} sx={{ flex: 1, minWidth: 180 }} />
              <TextField size="small" label="Amount (₹)" type="number" value={amount} onChange={e => setAmount(e.target.value)} sx={{ width: 130 }} />
              <TextField size="small" select label="Category" value={category} onChange={e => setCategory(e.target.value)} sx={{ width: 140 }}>
                {EXPENSE_CATEGORIES.map(c => <MenuItem key={c} value={c} sx={{ textTransform: 'capitalize' }}>{c}</MenuItem>)}
              </TextField>
              <Button variant="contained" size="small" disabled={saving || !desc.trim() || !amount} onClick={() => void addExpense()}>
                Add Expense
              </Button>
            </Stack>
          </>
        )}
      </Container>
    </Box>
  );
}

// ── My Events list ─────────────────────────────────────────────────────────────

function MyEvents({ token, categories, onClose }: { token: string; categories: Category[]; onClose: () => void }) {
  const [events,  setEvents]  = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing,  setEditing]  = useState<EventItem | undefined>(undefined);
  const [accessTarget, setAccessTarget] = useState<EventItem | undefined>(undefined);
  const [fundsTarget, setFundsTarget] = useState<EventItem | undefined>(undefined);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    eventsApiFetch<EventListResponse>('/events?mine=true&limit=50', token)
      .then(d => setEvents(d.events))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const transition = async (ev: EventItem, action: 'publish' | 'cancel' | 'complete') => {
    try {
      await eventsApiFetch(`/events/${ev.id}/${action}`, token, { method: 'PATCH' });
      setActionMsg(`"${ev.title}" ${action === 'publish' ? 'published' : action === 'cancel' ? 'cancelled' : 'marked completed'}.`);
      load();
    } catch (e: unknown) { setError((e as Error).message); }
  };

  const remove = async (ev: EventItem) => {
    const message = ev.status === 'completed'
      ? `Delete "${ev.title}"? This removes the event and its announcements/ticket-types/complimentary-ticket log, plus all registrations, tickets, and payment records for it. This cannot be undone.`
      : `Delete draft "${ev.title}"? This cannot be undone.`;
    if (!window.confirm(message)) return;
    try {
      await eventsApiFetch(`/events/${ev.id}`, token, { method: 'DELETE' });
      setActionMsg(`"${ev.title}" deleted.`);
      load();
    } catch (e: unknown) { setError((e as Error).message); }
  };

  const openCreate = () => { setEditing(undefined); setFormOpen(true); };
  const openEdit   = (ev: EventItem) => { setEditing(ev); setFormOpen(true); };
  const closeForm  = () => { setFormOpen(false); setEditing(undefined); };
  const handleFormPublish = () => { if (editing) { const ev = editing; closeForm(); void transition(ev, 'publish'); } };
  const handleFormCancel  = () => { if (editing) { const ev = editing; closeForm(); void transition(ev, 'cancel'); } };

  if (fundsTarget) {
    return <EventFunds event={fundsTarget} token={token} onClose={() => setFundsTarget(undefined)} />;
  }

  return (
    <Box component="main" sx={{ bgcolor: 'background.default', minHeight: 'calc(100vh - 64px)', py: { xs: 2, md: 4 } }}>
      <Container maxWidth="md">
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
          <Box component="button" onClick={onClose}
            sx={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6366f1', fontWeight: 600, fontSize: 14, p: 0 }}>
            ← Back to Events
          </Box>
          <Typography variant="h5" fontWeight={800} sx={{ flex: 1 }}>My Events</Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>Create Event</Button>
        </Box>

        <Alert severity="info" sx={{ mb: 3, borderRadius: 1.5 }}>
          You organize the events below. You can edit, publish, cancel, or complete them and set up ticket
          types — this does not give you access to any other event.
        </Alert>

        {actionMsg && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setActionMsg(null)}>{actionMsg}</Alert>}
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
        {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>}

        {!loading && events.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Typography color="text.secondary">You haven't created any events yet.</Typography>
          </Box>
        )}

        <Stack spacing={2}>
          {events.map(ev => {
            const badge = STATUS_CHIP[ev.status];
            return (
              <Card key={ev.id} variant="outlined" sx={{ borderRadius: 2 }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography fontWeight={700}>{ev.title}</Typography>
                        {ev.status === 'published'
                          ? <Chip label="Published" size="small" color="success" sx={{ fontWeight: 700 }} />
                          : badge && <Chip label={badge.label} size="small" sx={{ bgcolor: badge.bgcolor, color: badge.color, fontWeight: 700 }} />}
                      </Box>
                      <Typography fontSize={13} color="text.secondary" mt={0.5}>
                        {formatDate(ev.start_time)} · {ev.venue}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                      {(ev.status === 'draft' || ev.status === 'published') && (
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => openEdit(ev)}>
                            <EditIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                      {ev.status === 'draft' && (
                        <>
                          <Tooltip title="Publish">
                            <IconButton size="small" color="primary" onClick={() => transition(ev, 'publish')}>
                              <PublishIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete draft">
                            <IconButton size="small" color="error" onClick={() => void remove(ev)}>
                              <DeleteIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                      {ev.status === 'published' && (
                        <>
                          <Tooltip title="Mark completed">
                            <IconButton size="small" color="success" onClick={() => transition(ev, 'complete')}>
                              <DoneAllIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Cancel event">
                            <IconButton size="small" color="error" onClick={() => transition(ev, 'cancel')}>
                              <BlockIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                      {ev.status === 'completed' && (
                        <Tooltip title="Delete event (removes registrations, tickets & payments)">
                          <IconButton size="small" color="error" onClick={() => void remove(ev)}>
                            <DeleteIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="Manage access">
                        <IconButton size="small" onClick={() => setAccessTarget(ev)}>
                          <GroupAddIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Funds">
                        <IconButton size="small" onClick={() => setFundsTarget(ev)}>
                          <AccountBalanceWalletIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Stack>

        {formOpen && (
          <EventForm
            open={formOpen} initial={editing} token={token} categories={categories}
            onClose={closeForm} onSaved={load} onPublish={handleFormPublish} onCancel={handleFormCancel}
          />
        )}

        {accessTarget && (
          <ManageAccessDialog
            open={!!accessTarget} eventId={accessTarget.id} token={token}
            onClose={() => setAccessTarget(undefined)}
          />
        )}
      </Container>
    </Box>
  );
}

// ── Event Listing ─────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { value: 'date_asc',   label: 'Date: Earliest first' },
  { value: 'date_desc',  label: 'Date: Latest first' },
  { value: 'newest',     label: 'Recently added' },
  { value: 'price_asc',  label: 'Price: Low to high' },
  { value: 'price_desc', label: 'Price: High to low' },
  { value: 'popular',    label: 'Most registrations' },
];

const PAGE_SIZES = [3, 6, 12];

const MANAGER_STATUS_OPTIONS = [
  { value: '',          label: 'All statuses' },
  { value: 'published', label: 'Published' },
  { value: 'draft',     label: 'Draft' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'completed', label: 'Completed' },
];

export function EventsApp({
  societyName = 'GM Global Techies Town',
  city        = 'Bengaluru',
  token       = null,
}: {
  societyName?: string;
  city?:        string;
  token?:       string | null;
}) {
  const role      = getRoleFromToken(token);
  const isManager = role === 'admin' || role === 'committee_member';
  const canOrganize = role === 'resident';

  const [categories,  setCategories]  = useState<Category[]>([]);
  const [data,        setData]        = useState<EventListResponse | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [selectedId,  setSelectedId]  = useState<string | null>(null);
  const [showMyEvents, setShowMyEvents] = useState(false);
  const [savedCart,   setSavedCart]   = useState<{ eventTitle: string; eventId: string } | null>(null);

  const [search,      setSearch]      = useState('');
  const [debouncedQ,  setDebouncedQ]  = useState('');
  const [categoryId,  setCategoryId]  = useState('');
  const [isFree,      setIsFree]      = useState<'' | 'true' | 'false'>('');
  // managers default to showing ALL statuses; residents see published only
  const [statusFilter, setStatusFilter] = useState<string>(isManager ? '' : 'published');
  const [sortBy,      setSortBy]      = useState('date_asc');
  const [pageSize,    setPageSize]    = useState(6);
  const [page,        setPage]        = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch(`${apiBase()}/categories`, { headers })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((cats: Category[]) => setCategories(cats))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) { setSavedCart(null); return; }
    fetch('/api/registrations/registrations/cart', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => setSavedCart(d ? { eventId: d.event_id, eventTitle: d.event_title } : null))
      .catch(() => setSavedCart(null));
  }, [token]);

  const fetchEvents = useCallback(() => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ page: String(page), limit: String(pageSize), sort: sortBy });
    // empty string → all statuses; explicit value → filter by that status
    params.set('status', statusFilter);
    if (debouncedQ)    params.set('search',      debouncedQ);
    if (categoryId)    params.set('category_id', categoryId);
    if (isFree !== '') params.set('is_free',      isFree);

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch(`${apiBase()}/events?${params}`, { headers })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: EventListResponse) => { setData(d); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [page, pageSize, sortBy, statusFilter, debouncedQ, categoryId, isFree, token]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);
  useEffect(() => { setPage(1); }, [debouncedQ, categoryId, isFree, sortBy, pageSize, statusFilter]);

  if (selectedId) {
    return (
      <EventDetail
        eventId={selectedId} token={token} role={role}
        societyName={societyName} onBack={() => setSelectedId(null)}
      />
    );
  }

  if (showMyEvents && token) {
    return (
      <MyEvents token={token} categories={categories} onClose={() => { setShowMyEvents(false); fetchEvents(); }} />
    );
  }

  const events     = data?.events ?? [];
  const totalPages = data?.total_pages ?? 1;
  const totalCount = data?.total ?? 0;
  const hasFilters = !!(debouncedQ || categoryId || isFree || (isManager && statusFilter !== ''));

  return (
    <Box component="main" sx={{ bgcolor: 'background.default', minHeight: 'calc(100vh - 64px)', py: { xs: 2, md: 4 } }}>
      <Container maxWidth="lg">

        {savedCart && (
          <Alert
            severity="info"
            icon={<ShoppingCartIcon fontSize="small" />}
            sx={{ mb: 2 }}
            action={
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="contained" onClick={() => { window.location.href = '/checkout'; }}>
                  Resume Checkout
                </Button>
                <Button size="small" color="inherit" onClick={() => {
                  setSavedCart(null);
                  if (token) fetch('/api/registrations/registrations/cart', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
                }}>
                  Clear
                </Button>
              </Stack>
            }
          >
            You have a saved cart for <strong>{savedCart.eventTitle}</strong>
          </Alert>
        )}

        <Box sx={{ mb: 3, display: 'flex', alignItems: 'flex-end', gap: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h4" fontWeight={800} color="#0f172a" sx={{ fontSize: { xs: 24, md: 32 } }}>
              {isManager ? 'All Events' : 'Upcoming Events'}
            </Typography>
            <Typography color="text.secondary" mt={0.5} fontSize={14}>{societyName} · {city}</Typography>
          </Box>
          {isManager && (
            <Tooltip title="Go to full management console">
              <Button variant="outlined" size="small" startIcon={<SettingsIcon />}
                onClick={() => { window.location.href = '/manage'; }}
                sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                Manage Events
              </Button>
            </Tooltip>
          )}
          {canOrganize && (
            <Tooltip title="Create and manage events you organize">
              <Button variant="outlined" size="small" startIcon={<AddIcon />}
                onClick={() => setShowMyEvents(true)}
                sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                My Events
              </Button>
            </Tooltip>
          )}
        </Box>

        {/* Manager info banner */}
        {isManager && (
          <Alert severity="info" sx={{ mb: 2, borderRadius: 1.5 }}>
            You are viewing as <strong>{role?.replace('_', ' ')}</strong> — drafts and all statuses are visible.
            Use the <strong>Manage Events</strong> button to create, publish, or edit events.
          </Alert>
        )}

        {/* Filter row */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 3, flexWrap: 'wrap' }} useFlexGap>
          <TextField
            placeholder="Search events…" size="small" value={search}
            onChange={e => setSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment> }}
            sx={{ flex: 1, minWidth: { xs: '100%', sm: 180 }, maxWidth: { sm: 280 }, bgcolor: 'background.paper' }}
          />

          <Select size="small" value={categoryId} displayEmpty
            onChange={e => setCategoryId(e.target.value)}
            sx={{ minWidth: { xs: '100%', sm: 150 }, bgcolor: 'background.paper', fontSize: 14 }}>
            <MenuItem value="" sx={{ fontSize: 14 }}>All Categories</MenuItem>
            {categories.map(c => (
              <MenuItem key={c.id} value={c.id} sx={{ fontSize: 14 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {c.color_hex && <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: c.color_hex, flexShrink: 0 }} />}
                  {c.name}
                </Box>
              </MenuItem>
            ))}
          </Select>

          {/* Status filter — only shown to managers */}
          {isManager && (
            <Select size="small" value={statusFilter} displayEmpty
              onChange={e => setStatusFilter(e.target.value)}
              sx={{ minWidth: { xs: '100%', sm: 150 }, bgcolor: 'background.paper', fontSize: 14 }}>
              {MANAGER_STATUS_OPTIONS.map(o => (
                <MenuItem key={o.value} value={o.value} sx={{ fontSize: 14 }}>{o.label}</MenuItem>
              ))}
            </Select>
          )}

          <Select size="small" value={isFree} displayEmpty
            onChange={e => setIsFree(e.target.value as '' | 'true' | 'false')}
            sx={{ minWidth: { xs: '100%', sm: 130 }, bgcolor: 'background.paper', fontSize: 14 }}>
            <MenuItem value=""      sx={{ fontSize: 14 }}>Free & Paid</MenuItem>
            <MenuItem value="true"  sx={{ fontSize: 14 }}>Free only</MenuItem>
            <MenuItem value="false" sx={{ fontSize: 14 }}>Paid only</MenuItem>
          </Select>

          <Select size="small" value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            startAdornment={<SortIcon sx={{ fontSize: 16, ml: 1, color: 'text.secondary' }} />}
            sx={{ minWidth: { xs: '100%', sm: 210 }, bgcolor: 'background.paper', fontSize: 14 }}>
            {SORT_OPTIONS.map(o => <MenuItem key={o.value} value={o.value} sx={{ fontSize: 14 }}>{o.label}</MenuItem>)}
          </Select>

          <Select size="small" value={pageSize}
            onChange={e => setPageSize(Number(e.target.value))}
            sx={{ minWidth: { xs: '100%', sm: 110 }, bgcolor: 'background.paper', fontSize: 14 }}>
            {PAGE_SIZES.map(n => <MenuItem key={n} value={n} sx={{ fontSize: 14 }}>{n} per page</MenuItem>)}
          </Select>
        </Stack>

        {hasFilters && !loading && (
          <Typography fontSize={13} color="text.secondary" mb={2}>
            {totalCount} event{totalCount !== 1 ? 's' : ''} found
          </Typography>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} action={
            <Box component="button" onClick={fetchEvents}
              sx={{ border: 'none', bgcolor: 'transparent', cursor: 'pointer', color: 'inherit', fontWeight: 600 }}>
              Retry
            </Box>
          }>
            Could not load events: {error}
          </Alert>
        )}

        {/* Cards grid */}
        <Grid container spacing={2.5}>
          {loading
            ? Array.from({ length: pageSize }).map((_, i) => (
                <Grid item xs={12} sm={6} md={4} key={i}><SkeletonCard /></Grid>
              ))
            : events.map(event => {
                const color    = eventColor(event.category_color);
                const emoji    = categoryEmoji(event.category_name);
                const isDraft  = event.status === 'draft';
                const statusBadge = STATUS_CHIP[event.status];
                return (
                  <Grid item xs={12} sm={6} md={4} key={event.id}>
                    <Card
                      variant="outlined"
                      sx={{
                        cursor: 'pointer', borderRadius: 2, overflow: 'hidden',
                        height: '100%', position: 'relative',
                        transition: 'box-shadow .2s, transform .2s',
                        '&:hover': { boxShadow: 4, transform: 'translateY(-2px)' },
                        ...(isDraft ? { outline: '2px dashed #f59e0b', outlineOffset: -2 } : {}),
                      }}
                      onClick={() => setSelectedId(event.id)}
                    >
                      <Box sx={{ bgcolor: isDraft ? '#f59e0b' : color, height: 5 }} />
                      <CardContent sx={{ p: 2.5 }}>

                        {/* Status + Edit badge row for managers */}
                        {isManager && statusBadge && (
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                            <Chip label={statusBadge.label} size="small"
                              sx={{ bgcolor: statusBadge.bgcolor, color: statusBadge.color, fontWeight: 700, fontSize: 11, height: 20 }} />
                            {(isDraft || event.status === 'published') && (
                              <Tooltip title="Edit this event">
                                <IconButton size="small" color="primary"
                                  onClick={e => { e.stopPropagation(); window.location.href = '/manage'; }}
                                  sx={{ p: 0.5 }}>
                                  <EditIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        )}

                        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', mb: 1.5 }}>
                          <Box sx={{ width: 44, height: 44, borderRadius: 2, bgcolor: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                            {emoji}
                          </Box>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography fontWeight={700} fontSize={15} lineHeight={1.3} noWrap>{event.title}</Typography>
                            {event.category_name && (
                              <Chip label={event.category_name} size="small"
                                sx={{ mt: 0.5, height: 18, fontSize: 11, bgcolor: 'action.hover', color: 'text.secondary' }} />
                            )}
                          </Box>
                        </Box>

                        <Stack spacing={0.5} sx={{ mb: 1.5 }}>
                          {[
                            [<CalendarTodayIcon sx={{ fontSize: 13 }} />, `${formatDate(event.start_time)} · ${formatTime(event.start_time)}`],
                            [<LocationOnIcon    sx={{ fontSize: 13 }} />, event.venue],
                            [<PeopleIcon        sx={{ fontSize: 13 }} />,
                              event.is_sold_out
                                ? 'Sold out'
                                : event.spots_remaining != null
                                  ? `${event.spots_remaining} spots left`
                                  : `${event.registration_count} registered`],
                          ].map(([icon, text], i) => (
                            <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                              {icon}
                              <Typography fontSize={13} color="text.secondary" noWrap>{text as string}</Typography>
                            </Box>
                          ))}
                        </Stack>

                        {/* ── Ticket types (when defined) ─────────────── */}
                        {(event.ticket_types ?? []).length > 0 ? (
                          <Box sx={{ mb: 1.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
                              <ConfirmationNumberIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                              <Typography fontSize={11} fontWeight={600} color="text.secondary"
                                textTransform="uppercase" letterSpacing={0.4}>
                                Tickets
                              </Typography>
                            </Box>
                            <Stack spacing={0.5}>
                              {(event.ticket_types as TicketTypeSummary[]).map((tt, i) => (
                                <Box key={i} sx={{
                                  display: 'flex', alignItems: 'center',
                                  justifyContent: 'space-between',
                                  px: 1, py: 0.5,
                                  bgcolor: 'action.hover', borderRadius: 1,
                                  border: '1px solid', borderColor: 'divider',
                                }}>
                                  <Typography fontSize={12} fontWeight={500} noWrap sx={{ flex: 1, mr: 1 }}>
                                    {tt.name}
                                  </Typography>
                                  <Typography fontSize={12} fontWeight={700}
                                    sx={{ color: tt.is_free ? 'success.main' : color, flexShrink: 0 }}>
                                    {tt.is_free ? 'Free' : `₹${Number(tt.price).toLocaleString('en-IN')}`}
                                  </Typography>
                                </Box>
                              ))}
                            </Stack>
                          </Box>
                        ) : (
                          /* No ticket types — show base price */
                          <Box sx={{ mb: 1.5 }}>
                            <Typography fontWeight={700} fontSize={15} sx={{ color }}>
                              {event.is_free ? 'Free' : `₹${Number(event.ticket_price).toLocaleString('en-IN')}`}
                            </Typography>
                          </Box>
                        )}

                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Box /> {/* spacer — price moved above */}
                          <Box component="button"
                            disabled={event.is_sold_out}
                            sx={{
                              border: 'none', borderRadius: 1.5, px: 2, py: 0.75,
                              fontSize: 13, fontWeight: 600,
                              cursor: !event.is_sold_out ? 'pointer' : 'not-allowed',
                              bgcolor: !event.is_sold_out ? color : 'action.disabledBackground',
                              color:   !event.is_sold_out ? '#fff'  : 'text.disabled',
                              transition: 'opacity .15s', '&:hover': { opacity: 0.88 },
                            }}>
                            {event.is_sold_out ? 'Sold Out' : 'View'}
                          </Box>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })
          }

          {!loading && !error && events.length === 0 && (
            <Grid item xs={12}>
              <Box sx={{ textAlign: 'center', py: 8 }}>
                <Typography fontSize={40}>🔍</Typography>
                <Typography mt={1} color="text.secondary">
                  {hasFilters ? 'No events match your search.' : 'No upcoming events yet.'}
                </Typography>
              </Box>
            </Grid>
          )}
        </Grid>

        {totalPages > 1 && !loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
            <Pagination count={totalPages} page={page} onChange={(_, p) => setPage(p)}
              color="primary" shape="rounded" size="medium" />
          </Box>
        )}
      </Container>
    </Box>
  );
}
