import React, { useState } from 'react';
import {
  Box, Card, CardContent, Chip, Container, Grid,
  InputAdornment, MenuItem, Select, Stack, TextField, Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import PeopleIcon from '@mui/icons-material/People';

interface Event {
  id: string;
  title: string;
  date: string;
  time: string;
  venue: string;
  category: string;
  price: number | null;
  spotsLeft: number;
  totalSpots: number;
  organizer: string;
  emoji: string;
  color: string;
  featured?: boolean;
}

const EVENTS: Event[] = [
  {
    id: '1', title: 'Annual Sports Day 2026', date: 'Sat, 14 Feb 2026', time: '7:00 AM',
    venue: 'PVH Ground (Block A)', category: 'Sports', price: 150, spotsLeft: 23,
    totalSpots: 200, organizer: 'Meera Krishnan', emoji: '🏅', color: '#6366f1', featured: true,
  },
  {
    id: '2', title: 'Diwali Mela 2025', date: 'Sat, 20 Oct 2025', time: '5:00 PM',
    venue: 'Society Amphitheatre', category: 'Festival', price: null, spotsLeft: 0,
    totalSpots: 300, organizer: 'Meera Krishnan', emoji: '🪔', color: '#f59e0b',
  },
  {
    id: '3', title: "Children's Day Carnival", date: 'Tue, 14 Nov 2025', time: '10:00 AM',
    venue: 'Clubhouse & Pool Area', category: 'Kids', price: 50, spotsLeft: 48,
    totalSpots: 100, organizer: 'Priya Desai', emoji: '🎡', color: '#10b981',
  },
  {
    id: '4', title: 'Sunday Morning Yoga', date: 'Every Sunday', time: '6:30 AM',
    venue: 'Rooftop Garden, Block C', category: 'Wellness', price: null, spotsLeft: 12,
    totalSpots: 30, organizer: 'Anjali Nair', emoji: '🧘', color: '#06b6d4',
  },
  {
    id: '5', title: 'Holi Colour Festival', date: 'Mon, 14 Mar 2026', time: '9:00 AM',
    venue: 'Central Garden', category: 'Festival', price: 100, spotsLeft: 67,
    totalSpots: 250, organizer: 'Rajesh Iyer', emoji: '🎨', color: '#ec4899',
  },
  {
    id: '6', title: 'Movie Night: Under the Stars', date: 'Fri, 7 Feb 2026', time: '7:30 PM',
    venue: 'Terrace, Tower B', category: 'Entertainment', price: null, spotsLeft: 5,
    totalSpots: 60, organizer: 'Arjun Sharma', emoji: '🎬', color: '#8b5cf6',
  },
];

const CATEGORIES = ['All', 'Sports', 'Festival', 'Kids', 'Wellness', 'Entertainment'];

// ── Event Detail ──────────────────────────────────────────────────────────────

function EventDetail({ event, onBack, societyName = 'GM Global Techies Town' }: { event: Event; onBack: () => void; societyName?: string }) {
  const [qty, setQty] = useState(1);
  const total = event.price !== null ? event.price * qty : 0;

  return (
    <Box component="main" sx={{ bgcolor: '#f8fafc', minHeight: 'calc(100vh - 64px)', py: 4 }}>
      <Container maxWidth="md">
        <Box
          component="button" onClick={onBack}
          sx={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6366f1', fontWeight: 600, fontSize: 14, mb: 2, p: 0 }}
        >
          ← Back to Events
        </Box>

        {/* Hero */}
        <Box sx={{ bgcolor: event.color, borderRadius: '12px 12px 0 0', p: 4, color: '#fff' }}>
          <Typography fontSize={52} lineHeight={1} mb={1}>{event.emoji}</Typography>
          <Chip label={event.category} size="small"
            sx={{ bgcolor: 'rgba(255,255,255,0.25)', color: '#fff', mb: 1.5, fontWeight: 600 }} />
          <Typography variant="h4" fontWeight={800}>{event.title}</Typography>
          <Typography sx={{ mt: 1, opacity: 0.85 }}>{event.date} · {event.time} · {event.venue}</Typography>
        </Box>

        <Box sx={{ border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 12px 12px', bgcolor: '#fff', p: 3 }}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={7}>
              <Typography fontWeight={700} mb={1}>About this event</Typography>
              <Typography color="text.secondary" fontSize={14} lineHeight={1.8}>
                Join us for one of the most anticipated events at {societyName}.
                A great opportunity to connect with neighbours, enjoy activities, and celebrate as a community.
                All residents and their guests are welcome.
              </Typography>

              <Box sx={{ mt: 3, p: 2, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                <Typography fontSize={12} fontWeight={600} color="text.secondary" textTransform="uppercase" letterSpacing={0.5} mb={1.5}>
                  Event Details
                </Typography>
                {[
                  ['Organiser', event.organizer],
                  ['Date & Time', `${event.date} at ${event.time}`],
                  ['Venue', event.venue],
                  ['Capacity', `${event.totalSpots} spots`],
                  ['Availability', event.spotsLeft > 0 ? `${event.spotsLeft} spots left` : 'Sold out'],
                ].map(([label, val]) => (
                  <Box key={label} sx={{ display: 'flex', gap: 2, mb: 0.75 }}>
                    <Typography fontSize={13} color="text.secondary" sx={{ minWidth: 90 }}>{label}</Typography>
                    <Typography fontSize={13} fontWeight={500}>{val}</Typography>
                  </Box>
                ))}
              </Box>
            </Grid>

            <Grid item xs={12} md={5}>
              <Box sx={{ border: '1px solid #e2e8f0', borderRadius: 2, p: 2.5 }}>
                <Typography fontWeight={700} mb={2}>
                  {event.price === null ? 'Free Entry' : `₹${event.price} per ticket`}
                </Typography>

                {event.price !== null && (
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

                {event.price !== null && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, pt: 1.5, borderTop: '1px solid #e2e8f0' }}>
                    <Typography fontWeight={600}>Total</Typography>
                    <Typography fontWeight={700} sx={{ color: event.color }}>₹{total}</Typography>
                  </Box>
                )}

                <Box component="button" disabled={event.spotsLeft === 0}
                  sx={{
                    width: '100%', border: 'none', borderRadius: 1.5, py: 1.25,
                    fontSize: 14, fontWeight: 700,
                    cursor: event.spotsLeft > 0 ? 'pointer' : 'not-allowed',
                    bgcolor: event.spotsLeft > 0 ? event.color : '#e2e8f0',
                    color: event.spotsLeft > 0 ? '#fff' : '#94a3b8',
                  }}>
                  {event.spotsLeft > 0
                    ? (event.price === null ? 'Register for Free' : 'Proceed to Checkout')
                    : 'Sold Out'}
                </Box>
              </Box>
            </Grid>
          </Grid>
        </Box>
      </Container>
    </Box>
  );
}

// ── Event Listing ─────────────────────────────────────────────────────────────

export function EventsApp({
  societyName = 'GM Global Techies Town',
  city = 'Bengaluru',
}: {
  societyName?: string;
  city?: string;
}) {
  const [search,   setSearch]   = useState('');
  const [category, setCategory] = useState('All');
  const [selected, setSelected] = useState<Event | null>(null);

  const filtered = EVENTS.filter(e => {
    const q = search.toLowerCase();
    return (e.title.toLowerCase().includes(q) || e.category.toLowerCase().includes(q))
      && (category === 'All' || e.category === category);
  });

  if (selected) return <EventDetail event={selected} onBack={() => setSelected(null)} societyName={societyName} />;

  return (
    <Box component="main" sx={{ bgcolor: '#f8fafc', minHeight: 'calc(100vh - 64px)', py: 4 }}>
      <Container maxWidth="lg">

        <Box sx={{ mb: 3 }}>
          <Typography variant="h4" fontWeight={800} color="#0f172a">Upcoming Events</Typography>
          <Typography color="text.secondary" mt={0.5}>
            {societyName} · {EVENTS.length} events this season
          </Typography>
        </Box>

        <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
          <TextField
            placeholder="Search events…" size="small" value={search}
            onChange={e => setSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment> }}
            sx={{ flex: 1, maxWidth: 320, bgcolor: '#fff' }}
          />
          <Select size="small" value={category} onChange={e => setCategory(e.target.value)}
            sx={{ minWidth: 150, bgcolor: '#fff', fontSize: 14 }}>
            {CATEGORIES.map(c => <MenuItem key={c} value={c} sx={{ fontSize: 14 }}>{c}</MenuItem>)}
          </Select>
        </Stack>

        <Grid container spacing={2.5}>
          {filtered.map(event => (
            <Grid item xs={12} sm={6} md={4} key={event.id}>
              <Card
                variant="outlined" onClick={() => setSelected(event)}
                sx={{
                  cursor: 'pointer', borderRadius: 2, overflow: 'hidden',
                  transition: 'box-shadow .2s, transform .2s',
                  '&:hover': { boxShadow: 4, transform: 'translateY(-2px)' },
                  ...(event.featured && { outline: `2px solid ${event.color}` }),
                }}
              >
                <Box sx={{ bgcolor: event.color, height: 5 }} />
                <CardContent sx={{ p: 2.5 }}>
                  {event.featured && (
                    <Chip label="Featured" size="small"
                      sx={{ mb: 1, bgcolor: '#fef3c7', color: '#92400e', fontWeight: 600, fontSize: 11 }} />
                  )}

                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', mb: 1.5 }}>
                    <Box sx={{ width: 44, height: 44, borderRadius: 2, bgcolor: `${event.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                      {event.emoji}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography fontWeight={700} fontSize={15} lineHeight={1.3} noWrap>{event.title}</Typography>
                      <Chip label={event.category} size="small"
                        sx={{ mt: 0.5, height: 18, fontSize: 11, bgcolor: '#f1f5f9', color: '#475569' }} />
                    </Box>
                  </Box>

                  <Stack spacing={0.6} sx={{ mb: 2 }}>
                    {[
                      [<CalendarTodayIcon sx={{ fontSize: 13 }} />, `${event.date} · ${event.time}`],
                      [<LocationOnIcon sx={{ fontSize: 13 }} />, event.venue],
                      [<PeopleIcon sx={{ fontSize: 13 }} />, event.spotsLeft > 0 ? `${event.spotsLeft} spots left` : 'Sold out'],
                    ].map(([icon, text], i) => (
                      <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center', color: 'text.secondary' }}>
                        {icon}
                        <Typography fontSize={13} color="text.secondary" noWrap>{text as string}</Typography>
                      </Box>
                    ))}
                  </Stack>

                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography fontWeight={700} fontSize={15} sx={{ color: event.color }}>
                      {event.price === null ? 'Free' : `₹${event.price}`}
                    </Typography>
                    <Box component="button" disabled={event.spotsLeft === 0}
                      sx={{
                        border: 'none', borderRadius: 1.5, px: 2, py: 0.75, fontSize: 13, fontWeight: 600,
                        cursor: event.spotsLeft > 0 ? 'pointer' : 'not-allowed',
                        bgcolor: event.spotsLeft > 0 ? event.color : '#e2e8f0',
                        color: event.spotsLeft > 0 ? '#fff' : '#94a3b8',
                        transition: 'opacity .15s',
                        '&:hover': { opacity: 0.88 },
                      }}>
                      {event.spotsLeft > 0 ? 'Register' : 'Sold Out'}
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}

          {filtered.length === 0 && (
            <Grid item xs={12}>
              <Box sx={{ textAlign: 'center', py: 8 }}>
                <Typography fontSize={40}>🔍</Typography>
                <Typography mt={1} color="text.secondary">No events match your search.</Typography>
              </Box>
            </Grid>
          )}
        </Grid>
      </Container>
    </Box>
  );
}
