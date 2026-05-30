import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Card, CardContent, Chip, CircularProgress,
  Container, Grid, InputAdornment, MenuItem, Pagination,
  Select, Stack, TextField, Typography,
} from '@mui/material';
import SearchIcon        from '@mui/icons-material/Search';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import LocationOnIcon    from '@mui/icons-material/LocationOn';
import PeopleIcon        from '@mui/icons-material/People';
import SortIcon          from '@mui/icons-material/Sort';
import CampaignIcon      from '@mui/icons-material/Campaign';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
  color_hex: string | null;
}

interface TicketType {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_free: boolean;
  capacity: number | null;
  sort_order: number;
}

interface Announcement {
  id: string;
  author_name: string;
  title: string;
  body: string;
  sent_at: string;
}

interface EventItem {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  venue: string;
  capacity: number | null;
  status: string;
  ticket_price: number;
  price_currency: string;
  is_free: boolean;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  organizer_name: string;
  registration_count: number;
  confirmed_tickets: number;
  spots_remaining: number | null;
  is_sold_out: boolean;
  announcements?: Announcement[];
  ticket_types?: TicketType[];
}

interface EventListResponse {
  events: EventItem[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

// ── API base URL ──────────────────────────────────────────────────────────────

function apiBase(): string {
  const isLocalDev = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const isStandalone = isLocalDev && ['4001'].includes(window.location.port);
  if (isStandalone) return `${window.location.origin}/api/events`;
  return '/api/events';
}

// ── Emoji / colour helpers ────────────────────────────────────────────────────

const CATEGORY_EMOJI: Record<string, string> = {
  festival:      '🪔',
  sports:        '🏅',
  wellness:      '🧘',
  governance:    '🏛',
  kids:          '🎡',
  entertainment: '🎬',
  cultural:      '🎭',
  music:         '🎵',
  food:          '🍽',
};

function categoryEmoji(name: string | null): string {
  if (!name) return '🎉';
  return CATEGORY_EMOJI[name.toLowerCase()] ?? '🎉';
}

function eventColor(colorHex: string | null): string {
  return colorHex ?? '#6366f1';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

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
  eventId, token, societyName, onBack,
}: {
  eventId: string; token: string | null; societyName: string; onBack: () => void;
}) {
  const [event, setEvent]     = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [qty, setQty]         = useState(1);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch(`${apiBase()}/events/${eventId}`, { headers })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: EventItem) => { setEvent(data); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [eventId, token]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

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
  const total    = event.ticket_price * qty;
  const hasTypes = (event.ticket_types ?? []).length > 0;

  return (
    <Box component="main" sx={{ bgcolor: '#f8fafc', minHeight: 'calc(100vh - 64px)', py: { xs: 2, md: 4 } }}>
      <Container maxWidth="md">
        <Box component="button" onClick={onBack}
          sx={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6366f1', fontWeight: 600, fontSize: 14, mb: 2, p: 0 }}>
          ← Back to Events
        </Box>

        {/* Hero */}
        <Box sx={{ bgcolor: color, borderRadius: { xs: '8px 8px 0 0', md: '12px 12px 0 0' }, p: { xs: 2.5, md: 4 }, color: '#fff' }}>
          <Typography fontSize={{ xs: 40, md: 52 }} lineHeight={1} mb={1}>{emoji}</Typography>
          {event.category_name && (
            <Chip label={event.category_name} size="small"
              sx={{ bgcolor: 'rgba(255,255,255,0.25)', color: '#fff', mb: 1.5, fontWeight: 600 }} />
          )}
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

              {/* Ticket types */}
              {hasTypes && (
                <Box sx={{ mt: 3 }}>
                  <Typography fontWeight={700} mb={1.5} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ConfirmationNumberIcon sx={{ fontSize: 18 }} /> Ticket Types
                  </Typography>
                  <Stack spacing={1}>
                    {(event.ticket_types ?? []).map(tt => (
                      <Box key={tt.id} sx={{ p: 1.5, border: '1px solid #e2e8f0', borderRadius: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box>
                          <Typography fontSize={14} fontWeight={600}>{tt.name}</Typography>
                          {tt.description && <Typography fontSize={12} color="text.secondary">{tt.description}</Typography>}
                          {tt.capacity && <Typography fontSize={12} color="text.secondary">Capacity: {tt.capacity}</Typography>}
                        </Box>
                        <Typography fontWeight={700} sx={{ color, ml: 2, flexShrink: 0 }}>
                          {tt.is_free ? 'Free' : `₹${Number(tt.price).toLocaleString('en-IN')}`}
                        </Typography>
                      </Box>
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
              <Box sx={{ border: '1px solid #e2e8f0', borderRadius: 2, p: 2.5, position: { md: 'sticky' }, top: { md: 80 } }}>
                <Typography fontWeight={700} mb={2}>
                  {event.is_free ? 'Free Entry' : `₹${Number(event.ticket_price).toLocaleString('en-IN')} per ticket`}
                </Typography>

                {!event.is_free && !hasTypes && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <Typography fontSize={14} color="text.secondary">Qty</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {([['−', () => setQty(q => Math.max(1, q - 1))], ['+', () => setQty(q => Math.min(10, q + 1))]] as [string, () => void][]).map(([lbl, fn]) => (
                        <Box key={lbl} component="button" onClick={fn}
                          sx={{ width: 28, height: 28, border: '1px solid #e2e8f0', borderRadius: 1, cursor: 'pointer', bgcolor: '#f8fafc', fontSize: 16, fontWeight: 700 }}>
                          {lbl}
                        </Box>
                      ))}
                      <Typography fontWeight={700} sx={{ width: 24, textAlign: 'center' }}>{qty}</Typography>
                    </Box>
                  </Box>
                )}

                {!event.is_free && !hasTypes && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, pt: 1.5, borderTop: '1px solid #e2e8f0' }}>
                    <Typography fontWeight={600}>Total</Typography>
                    <Typography fontWeight={700} sx={{ color }}>₹{total.toLocaleString('en-IN')}</Typography>
                  </Box>
                )}

                <Box component="button" disabled={event.is_sold_out || event.status !== 'published'}
                  sx={{
                    width: '100%', border: 'none', borderRadius: 1.5, py: 1.25,
                    fontSize: 14, fontWeight: 700,
                    cursor: (!event.is_sold_out && event.status === 'published') ? 'pointer' : 'not-allowed',
                    bgcolor: (!event.is_sold_out && event.status === 'published') ? color : '#e2e8f0',
                    color:   (!event.is_sold_out && event.status === 'published') ? '#fff' : '#94a3b8',
                  }}>
                  {event.is_sold_out
                    ? 'Sold Out'
                    : event.status !== 'published'
                      ? 'Registrations Closed'
                      : event.is_free ? 'Register for Free' : 'Proceed to Checkout'}
                </Box>

                {event.spots_remaining != null && !event.is_sold_out && (
                  <Typography fontSize={12} color="text.secondary" mt={1} textAlign="center">
                    {event.spots_remaining} spots remaining
                  </Typography>
                )}
              </Box>
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

export function EventsApp({
  societyName = 'GM Global Techies Town',
  city        = 'Bengaluru',
  token       = null,
}: {
  societyName?: string;
  city?:        string;
  token?:       string | null;
}) {
  const [categories,   setCategories]   = useState<Category[]>([]);
  const [data,         setData]         = useState<EventListResponse | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [selectedId,   setSelectedId]   = useState<string | null>(null);

  const [search,       setSearch]       = useState('');
  const [debouncedQ,   setDebouncedQ]   = useState('');
  const [categoryId,   setCategoryId]   = useState('');
  const [isFree,       setIsFree]       = useState<'' | 'true' | 'false'>('');
  const [sortBy,       setSortBy]       = useState('date_asc');
  const [pageSize,     setPageSize]     = useState(6);
  const [page,         setPage]         = useState(1);

  // debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // fetch categories once
  useEffect(() => {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch(`${apiBase()}/categories`, { headers })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((cats: Category[]) => setCategories(cats))
      .catch(() => {/* non-fatal, filter still works */});
  }, [token]);

  // fetch event listing
  const fetchEvents = useCallback(() => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      page:  String(page),
      limit: String(pageSize),
      sort:  sortBy,
    });
    if (debouncedQ)  params.set('search',      debouncedQ);
    if (categoryId)  params.set('category_id', categoryId);
    if (isFree !== '') params.set('is_free',   isFree);

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch(`${apiBase()}/events?${params}`, { headers })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: EventListResponse) => { setData(d); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [page, pageSize, sortBy, debouncedQ, categoryId, isFree, token]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // reset to page 1 on any filter change
  useEffect(() => { setPage(1); }, [debouncedQ, categoryId, isFree, sortBy, pageSize]);

  if (selectedId) {
    return (
      <EventDetail
        eventId={selectedId}
        token={token}
        societyName={societyName}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  const events      = data?.events ?? [];
  const totalPages  = data?.total_pages ?? 1;
  const totalCount  = data?.total ?? 0;
  const hasFilters  = !!(debouncedQ || categoryId || isFree);

  return (
    <Box component="main" sx={{ bgcolor: '#f8fafc', minHeight: 'calc(100vh - 64px)', py: { xs: 2, md: 4 } }}>
      <Container maxWidth="lg">

        <Box sx={{ mb: 3 }}>
          <Typography variant="h4" fontWeight={800} color="#0f172a" sx={{ fontSize: { xs: 24, md: 32 } }}>
            Upcoming Events
          </Typography>
          <Typography color="text.secondary" mt={0.5} fontSize={14}>
            {societyName} · {city}
          </Typography>
        </Box>

        {/* Filter row */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 3, flexWrap: 'wrap' }} useFlexGap>
          <TextField
            placeholder="Search events…" size="small" value={search}
            onChange={e => setSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment> }}
            sx={{ flex: 1, minWidth: { xs: '100%', sm: 180 }, maxWidth: { sm: 300 }, bgcolor: '#fff' }}
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

        {/* Result count */}
        {hasFilters && !loading && (
          <Typography fontSize={13} color="text.secondary" mb={2}>
            {totalCount} event{totalCount !== 1 ? 's' : ''} found
          </Typography>
        )}

        {/* Error */}
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
                const color = eventColor(event.category_color);
                const emoji = categoryEmoji(event.category_name);
                return (
                  <Grid item xs={12} sm={6} md={4} key={event.id}>
                    <Card
                      variant="outlined" onClick={() => setSelectedId(event.id)}
                      sx={{
                        cursor: 'pointer', borderRadius: 2, overflow: 'hidden',
                        height: '100%',
                        transition: 'box-shadow .2s, transform .2s',
                        '&:hover': { boxShadow: 4, transform: 'translateY(-2px)' },
                      }}
                    >
                      <Box sx={{ bgcolor: color, height: 5 }} />
                      <CardContent sx={{ p: 2.5 }}>
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

                        <Stack spacing={0.6} sx={{ mb: 2 }}>
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
                            <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center', color: 'text.secondary' }}>
                              {icon}
                              <Typography fontSize={13} color="text.secondary" noWrap>{text as string}</Typography>
                            </Box>
                          ))}
                        </Stack>

                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Typography fontWeight={700} fontSize={15} sx={{ color }}>
                            {event.is_free ? 'Free' : `₹${Number(event.ticket_price).toLocaleString('en-IN')}`}
                          </Typography>
                          <Box component="button" disabled={event.is_sold_out}
                            sx={{
                              border: 'none', borderRadius: 1.5, px: 2, py: 0.75,
                              fontSize: 13, fontWeight: 600,
                              cursor: !event.is_sold_out ? 'pointer' : 'not-allowed',
                              bgcolor: !event.is_sold_out ? color : '#e2e8f0',
                              color:   !event.is_sold_out ? '#fff' : '#94a3b8',
                              transition: 'opacity .15s',
                              '&:hover': { opacity: 0.88 },
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

        {/* Pagination */}
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
