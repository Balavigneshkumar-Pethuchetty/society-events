import React, { useMemo, useState } from 'react';
import {
  Box, Chip, Container, Dialog, DialogContent, DialogTitle,
  IconButton, InputAdornment, MenuItem, Pagination, Paper,
  Select, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import QrCodeIcon from '@mui/icons-material/QrCode2';
import CloseIcon from '@mui/icons-material/Close';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import SearchIcon from '@mui/icons-material/Search';

interface Ticket {
  id: string;
  bookingRef: string;
  event: string;
  date: string;
  venue: string;
  ticketType: string;
  price: number | null;
  status: 'confirmed' | 'attended' | 'cancelled';
  emoji: string;
  color: string;
  qrCode: string;
}

const TICKETS: Ticket[] = [
  {
    id: 't1', bookingRef: 'PVH-2026-0214-001',
    event: 'Annual Sports Day 2026', date: 'Sat, 14 Feb 2026 · 7:00 AM',
    venue: 'PVH Ground (Block A)', ticketType: 'General Entry',
    price: 150, status: 'confirmed', emoji: '🏅', color: '#6366f1',
    qrCode: 'PVH-2026-0214-001',
  },
  {
    id: 't2', bookingRef: 'PVH-2025-1114-042',
    event: "Children's Day Carnival", date: 'Tue, 14 Nov 2025 · 10:00 AM',
    venue: 'Clubhouse & Pool Area', ticketType: 'Family Pass (x2)',
    price: 100, status: 'attended', emoji: '🎡', color: '#10b981',
    qrCode: 'PVH-2025-1114-042',
  },
  {
    id: 't3', bookingRef: 'PVH-2025-1020-017',
    event: 'Diwali Mela 2025', date: 'Sat, 20 Oct 2025 · 5:00 PM',
    venue: 'Society Amphitheatre', ticketType: 'Free Entry',
    price: null, status: 'attended', emoji: '🪔', color: '#f59e0b',
    qrCode: 'PVH-2025-1020-017',
  },
  {
    id: 't4', bookingRef: 'PVH-2026-0307-008',
    event: 'Holi Colour Festival', date: 'Mon, 14 Mar 2026 · 9:00 AM',
    venue: 'Central Garden', ticketType: 'General Entry',
    price: 100, status: 'cancelled', emoji: '🎨', color: '#ec4899',
    qrCode: 'PVH-2026-0307-008',
  },
];

const STATUS_STYLE: Record<Ticket['status'], { label: string; bgcolor: string; color: string }> = {
  confirmed: { label: 'Confirmed', bgcolor: '#dcfce7', color: '#166534' },
  attended:  { label: 'Attended',  bgcolor: '#e0e7ff', color: '#3730a3' },
  cancelled: { label: 'Cancelled', bgcolor: '#fee2e2', color: '#991b1b' },
};

const PAGE_SIZE = 4;

// ── QR Dialog ─────────────────────────────────────────────────────────────────

function QrDialog({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Typography fontWeight={700} fontSize={16}>Your Ticket</Typography>
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ textAlign: 'center', py: 1 }}>
          <Typography fontSize={40} mb={1}>{ticket.emoji}</Typography>
          <Typography fontWeight={700} fontSize={17} mb={0.5}>{ticket.event}</Typography>
          <Typography fontSize={13} color="text.secondary" mb={2}>{ticket.date}</Typography>

          {/* Fake QR */}
          <Box sx={{
            width: 180, height: 180, mx: 'auto', mb: 2,
            border: '3px solid #1e293b', borderRadius: 2,
            display: 'grid', gridTemplateColumns: 'repeat(9,1fr)',
            p: '8px', gap: '2px', bgcolor: '#fff',
          }}>
            {Array.from({ length: 81 }, (_, i) => (
              <Box key={i} sx={{ bgcolor: Math.random() > 0.5 ? '#1e293b' : 'transparent', borderRadius: '1px' }} />
            ))}
          </Box>

          <Typography fontWeight={700} fontSize={13} letterSpacing={1} sx={{ fontFamily: 'monospace', bgcolor: '#f1f5f9', px: 2, py: 0.75, borderRadius: 1, display: 'inline-block', mb: 2 }}>
            {ticket.qrCode}
          </Typography>

          <Box sx={{ bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 1.5, p: 1.5, textAlign: 'left' }}>
            {[['Ticket Type', ticket.ticketType], ['Venue', ticket.venue], ['Price', ticket.price ? `₹${ticket.price}` : 'Free']].map(([k, v]) => (
              <Box key={k} sx={{ display: 'flex', gap: 1.5, mb: 0.5, '&:last-child': { mb: 0 } }}>
                <Typography fontSize={12} color="text.secondary" sx={{ minWidth: 80 }}>{k}</Typography>
                <Typography fontSize={12} fontWeight={500}>{v}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

// ── Ticket Card ───────────────────────────────────────────────────────────────

function TicketCard({ ticket, onView }: { ticket: Ticket; onView: () => void }) {
  const s = STATUS_STYLE[ticket.status];
  const canView = ticket.status === 'confirmed';

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', opacity: ticket.status === 'cancelled' ? 0.65 : 1 }}>
      <Box sx={{ bgcolor: ticket.color, height: 5 }} />
      <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5, gap: 1 }}>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', minWidth: 0 }}>
            <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: `${ticket.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
              {ticket.emoji}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography fontWeight={700} fontSize={15} noWrap>{ticket.event}</Typography>
              <Typography fontSize={12} color="text.secondary" sx={{ fontFamily: 'monospace' }}>{ticket.bookingRef}</Typography>
            </Box>
          </Box>
          <Chip label={s.label} size="small" sx={{ bgcolor: s.bgcolor, color: s.color, fontWeight: 600, fontSize: 11, flexShrink: 0 }} />
        </Box>

        <Stack spacing={0.5} sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', color: 'text.secondary' }}>
            <CalendarTodayIcon sx={{ fontSize: 13, flexShrink: 0 }} />
            <Typography fontSize={13} color="text.secondary" noWrap>{ticket.date}</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', color: 'text.secondary' }}>
            <LocationOnIcon sx={{ fontSize: 13, flexShrink: 0 }} />
            <Typography fontSize={13} color="text.secondary" noWrap>{ticket.venue}</Typography>
          </Box>
        </Stack>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pt: 1.5, borderTop: '1px dashed #e2e8f0', flexWrap: 'wrap', gap: 1 }}>
          <Box>
            <Typography fontSize={12} color="text.secondary">{ticket.ticketType}</Typography>
            <Typography fontWeight={700} fontSize={15} sx={{ color: ticket.color }}>
              {ticket.price ? `₹${ticket.price}` : 'Free'}
            </Typography>
          </Box>
          {canView && (
            <Box component="button" onClick={onView}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.75,
                border: `1.5px solid ${ticket.color}`, borderRadius: 1.5,
                px: 1.5, py: 0.75, cursor: 'pointer', bgcolor: 'transparent',
                color: ticket.color, fontSize: 13, fontWeight: 600,
                '&:hover': { bgcolor: `${ticket.color}11` },
              }}>
              <QrCodeIcon sx={{ fontSize: 16 }} />
              View QR
            </Box>
          )}
        </Box>
      </Box>
    </Paper>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function BookingApp() {
  const [tab,     setTab]     = useState(0);
  const [viewing, setViewing] = useState<Ticket | null>(null);
  const [search,  setSearch]  = useState('');
  const [page,    setPage]    = useState(1);

  const upcoming  = TICKETS.filter(t => t.status === 'confirmed');
  const past      = TICKETS.filter(t => t.status !== 'confirmed');
  const base      = tab === 0 ? upcoming : past;

  const displayed = useMemo(() => {
    const q = search.toLowerCase();
    return base.filter(t =>
      t.event.toLowerCase().includes(q) ||
      t.venue.toLowerCase().includes(q) ||
      t.bookingRef.toLowerCase().includes(q)
    );
  }, [base, search]);

  const totalPages = Math.max(1, Math.ceil(displayed.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = displayed.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function handleTabChange(_: React.SyntheticEvent, v: number) {
    setTab(v);
    setSearch('');
    setPage(1);
  }

  return (
    <Box component="main" sx={{ bgcolor: '#f8fafc', minHeight: 'calc(100vh - 64px)', py: { xs: 2, md: 4 } }}>
      <Container maxWidth="md">

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          <ConfirmationNumberIcon sx={{ color: '#6366f1', fontSize: { xs: 26, md: 30 } }} />
          <Box>
            <Typography variant="h4" fontWeight={800} color="#0f172a" sx={{ fontSize: { xs: 24, md: 32 } }}>
              My Tickets
            </Typography>
            <Typography color="text.secondary" fontSize={14}>Arjun Sharma · Flat C-301</Typography>
          </Box>
        </Box>

        {/* Stats — responsive grid */}
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(3, 1fr)' },
          gap: { xs: 1.5, sm: 2 },
          mb: 3,
        }}>
          {[
            { label: 'Upcoming',  value: upcoming.length,                                          color: '#6366f1' },
            { label: 'Attended',  value: TICKETS.filter(t => t.status === 'attended').length,      color: '#10b981' },
            { label: 'Cancelled', value: TICKETS.filter(t => t.status === 'cancelled').length,     color: '#ef4444' },
          ].map(({ label, value, color }) => (
            <Paper key={label} variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, borderLeft: `4px solid ${color}`, borderRadius: 2 }}>
              <Typography fontSize={{ xs: 11, sm: 13 }} color="text.secondary">{label}</Typography>
              <Typography variant="h4" fontWeight={700} sx={{ color, fontSize: { xs: 24, sm: 32 } }}>{value}</Typography>
            </Paper>
          ))}
        </Box>

        <Tabs value={tab} onChange={handleTabChange} sx={{ mb: 2, borderBottom: '1px solid #e2e8f0' }} variant="scrollable" scrollButtons="auto">
          <Tab label={`Upcoming (${upcoming.length})`} sx={{ textTransform: 'none', fontWeight: 600 }} />
          <Tab label={`Past & Cancelled (${past.length})`} sx={{ textTransform: 'none', fontWeight: 600 }} />
        </Tabs>

        {/* Search */}
        <TextField
          size="small"
          placeholder="Search by event, venue, or booking ref…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          fullWidth
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 16, color: 'text.secondary' }} /></InputAdornment> }}
          sx={{ mb: 2, bgcolor: '#fff' }}
        />

        {search && (
          <Typography fontSize={13} color="text.secondary" mb={1.5}>
            {displayed.length} result{displayed.length !== 1 ? 's' : ''}
          </Typography>
        )}

        <Stack spacing={2}>
          {paginated.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <Typography fontSize={40}>🎫</Typography>
              <Typography mt={1} color="text.secondary">
                {search ? 'No tickets match your search.' : 'No tickets here yet.'}
              </Typography>
            </Box>
          ) : (
            paginated.map(t => (
              <TicketCard key={t.id} ticket={t} onView={() => setViewing(t)} />
            ))
          )}
        </Stack>

        {totalPages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
            <Pagination
              count={totalPages}
              page={currentPage}
              onChange={(_, p) => setPage(p)}
              color="primary"
              shape="rounded"
            />
          </Box>
        )}
      </Container>

      {viewing && <QrDialog ticket={viewing} onClose={() => setViewing(null)} />}
    </Box>
  );
}
