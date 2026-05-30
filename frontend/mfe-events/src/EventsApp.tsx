import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
  Container, Grid, IconButton, InputAdornment, MenuItem, Pagination,
  Select, Stack, TextField, Tooltip, Typography,
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

// ── Types ─────────────────────────────────────────────────────────────────────

interface Category { id: string; name: string; color_hex: string | null }

// Listing returns name/price/is_free; detail returns the full shape
interface TicketTypeSummary { name: string; price: number; is_free: boolean }

interface TicketType extends TicketTypeSummary {
  id: string; description: string | null;
  capacity: number | null; sort_order: number;
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
  category_id: string | null; category_name: string | null; category_color: string | null;
  organizer_name: string;
  registration_count: number; confirmed_tickets: number;
  spots_remaining: number | null; is_sold_out: boolean;
  announcements?: Announcement[];
  ticket_types?: TicketTypeSummary[];
}

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
      <Box sx={{ bgcolor: '#e2e8f0', height: 5 }} />
      <CardContent sx={{ p: 2.5 }}>
        {[80, 120, 60, 90, 70].map((w, i) => (
          <Box key={i} sx={{ bgcolor: '#f1f5f9', borderRadius: 1, height: 14, width: `${w}%`, mb: 1 }} />
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
  const [event,      setEvent]      = useState<EventItem | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [qty,        setQty]        = useState(1);
  const [ticketQtys, setTicketQtys] = useState<Record<string, number>>({});

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
    <Box component="main" sx={{ bgcolor: '#f8fafc', minHeight: 'calc(100vh - 64px)', py: { xs: 2, md: 4 } }}>
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

        <Box sx={{ border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: { xs: '0 0 8px 8px', md: '0 0 12px 12px' }, bgcolor: '#fff', p: { xs: 2, md: 3 } }}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={7}>

              <Typography fontWeight={700} mb={1}>About this event</Typography>
              <Typography color="text.secondary" fontSize={14} lineHeight={1.8}>
                {event.description ?? `Join us for this event at ${societyName}. All residents and their guests are welcome.`}
              </Typography>

              {/* Event details box */}
              <Box sx={{ mt: 3, p: 2, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
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
                  <Box sx={{ borderRadius: 2, overflow: 'hidden', border: '1px solid #e2e8f0', mb: 1.5 }}>
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
                        sx={{ fontSize: 12, borderColor: '#e2e8f0', color: '#475569',
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
                      <Box key={ann.id} sx={{ p: 2, bgcolor: '#eff6ff', borderRadius: 2, borderLeft: '3px solid #6366f1' }}>
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
              <Box sx={{ border: '1px solid #e2e8f0', borderRadius: 2, overflow: 'hidden',
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
                            border: `1.5px solid ${q > 0 ? color : '#e2e8f0'}`,
                            borderRadius: 2, p: 1.5,
                            bgcolor: q > 0 ? `${color}08` : '#fff',
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
                                      borderColor: q > 0 ? color : '#e2e8f0',
                                      borderRadius: i === 0 ? '8px 0 0 8px' : '0 8px 8px 0',
                                      cursor: 'pointer',
                                      bgcolor: q > 0 && lbl === '+' ? color : '#f8fafc',
                                      color:   q > 0 && lbl === '+' ? '#fff' : '#374151',
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
                                    borderColor: q > 0 ? color : '#e2e8f0',
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
                                width: 32, height: 32, border: '1.5px solid #e2e8f0',
                                borderRadius: i === 0 ? '8px 0 0 8px' : '0 8px 8px 0',
                                cursor: 'pointer', bgcolor: '#f8fafc', fontSize: 18, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                              {lbl}
                            </Box>
                          ))}
                          <Typography fontWeight={700} fontSize={15}
                            sx={{ width: 36, textAlign: 'center', border: '1.5px solid #e2e8f0',
                              borderLeft: 'none', borderRight: 'none', height: 32, lineHeight: '29px' }}>
                            {qty}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  )}

                  {/* ── Order summary ────────────────────────────────────── */}
                  {(hasTypes ? typedCount > 0 : (!event.is_free && qty > 0)) && (
                    <Box sx={{ bgcolor: '#f8fafc', borderRadius: 1.5, p: 1.5, mb: 2 }}>
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
                        borderTop: hasTypes && typedCount > 0 ? '1px solid #e2e8f0' : 'none', mt: hasTypes ? 0.5 : 0 }}>
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
                    disabled={!canProceed}
                    sx={{
                      width: '100%', border: 'none', borderRadius: 1.5, py: 1.4,
                      fontSize: 14, fontWeight: 700,
                      cursor: canProceed ? 'pointer' : 'not-allowed',
                      bgcolor: canProceed ? color : '#e2e8f0',
                      color:   canProceed ? '#fff'  : '#94a3b8',
                      transition: 'opacity .15s',
                      '&:hover': canProceed ? { opacity: 0.9 } : {},
                    }}>
                    {event.is_sold_out
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

  const [categories,  setCategories]  = useState<Category[]>([]);
  const [data,        setData]        = useState<EventListResponse | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [selectedId,  setSelectedId]  = useState<string | null>(null);

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

  const events     = data?.events ?? [];
  const totalPages = data?.total_pages ?? 1;
  const totalCount = data?.total ?? 0;
  const hasFilters = !!(debouncedQ || categoryId || isFree || (isManager && statusFilter !== ''));

  return (
    <Box component="main" sx={{ bgcolor: '#f8fafc', minHeight: 'calc(100vh - 64px)', py: { xs: 2, md: 4 } }}>
      <Container maxWidth="lg">

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
            sx={{ flex: 1, minWidth: { xs: '100%', sm: 180 }, maxWidth: { sm: 280 }, bgcolor: '#fff' }}
          />

          <Select size="small" value={categoryId} displayEmpty
            onChange={e => setCategoryId(e.target.value)}
            sx={{ minWidth: { xs: '100%', sm: 150 }, bgcolor: '#fff', fontSize: 14 }}>
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
              sx={{ minWidth: { xs: '100%', sm: 150 }, bgcolor: '#fff', fontSize: 14 }}>
              {MANAGER_STATUS_OPTIONS.map(o => (
                <MenuItem key={o.value} value={o.value} sx={{ fontSize: 14 }}>{o.label}</MenuItem>
              ))}
            </Select>
          )}

          <Select size="small" value={isFree} displayEmpty
            onChange={e => setIsFree(e.target.value as '' | 'true' | 'false')}
            sx={{ minWidth: { xs: '100%', sm: 130 }, bgcolor: '#fff', fontSize: 14 }}>
            <MenuItem value=""      sx={{ fontSize: 14 }}>Free & Paid</MenuItem>
            <MenuItem value="true"  sx={{ fontSize: 14 }}>Free only</MenuItem>
            <MenuItem value="false" sx={{ fontSize: 14 }}>Paid only</MenuItem>
          </Select>

          <Select size="small" value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            startAdornment={<SortIcon sx={{ fontSize: 16, ml: 1, color: 'text.secondary' }} />}
            sx={{ minWidth: { xs: '100%', sm: 210 }, bgcolor: '#fff', fontSize: 14 }}>
            {SORT_OPTIONS.map(o => <MenuItem key={o.value} value={o.value} sx={{ fontSize: 14 }}>{o.label}</MenuItem>)}
          </Select>

          <Select size="small" value={pageSize}
            onChange={e => setPageSize(Number(e.target.value))}
            sx={{ minWidth: { xs: '100%', sm: 110 }, bgcolor: '#fff', fontSize: 14 }}>
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
                                sx={{ mt: 0.5, height: 18, fontSize: 11, bgcolor: '#f1f5f9', color: '#475569' }} />
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
                                  bgcolor: '#f8fafc', borderRadius: 1,
                                  border: '1px solid #f1f5f9',
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
                              bgcolor: !event.is_sold_out ? color : '#e2e8f0',
                              color:   !event.is_sold_out ? '#fff'  : '#94a3b8',
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
