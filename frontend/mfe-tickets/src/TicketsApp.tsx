import React, { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Alert, Box, Button, Chip, CircularProgress, Container,
  Dialog, DialogContent, DialogTitle, Divider,
  IconButton, Paper, Stack, Typography,
} from '@mui/material';
import CalendarTodayIcon      from '@mui/icons-material/CalendarToday';
import CheckCircleIcon        from '@mui/icons-material/CheckCircle';
import CloseIcon              from '@mui/icons-material/Close';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import LocationOnIcon         from '@mui/icons-material/LocationOn';
import QrCode2Icon            from '@mui/icons-material/QrCode2';
import TaskAltIcon            from '@mui/icons-material/TaskAlt';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Ticket {
  id: string;
  reg_id: string;
  event_id: string;
  event_title: string;
  event_start_time: string;
  event_end_time: string;
  event_venue: string;
  event_image_color: string | null;
  ticket_count: number;
  total_amount: number;
  display_currency: string;
  status: string;       // active | used | cancelled
  qr_token: string | null;
  issued_at: string;
  scanned_at: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtAmount(amount: number) {
  if (amount === 0) return 'Free';
  return `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;
}

function statusChip(ticket: Ticket) {
  if (ticket.status === 'used')
    return <Chip label="Attended" color="success" size="small" icon={<TaskAltIcon />} />;
  if (ticket.status === 'cancelled')
    return <Chip label="Cancelled" color="error" size="small" />;

  const now = new Date();
  const start = new Date(ticket.event_start_time);
  const end   = new Date(ticket.event_end_time);
  if (now > end)
    return <Chip label="Event Ended" color="default" size="small" />;
  if (now >= start)
    return <Chip label="In Progress" color="warning" size="small" />;
  return <Chip label="Confirmed" color="success" size="small" icon={<CheckCircleIcon />} />;
}

// ── QR Dialog ─────────────────────────────────────────────────────────────────

function QrDialog({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography fontWeight={700} fontSize={16}>{ticket.event_title}</Typography>
          <Typography variant="caption" color="text.secondary">{fmtDate(ticket.event_start_time)}</Typography>
        </Box>
        <IconButton size="small" onClick={onClose} sx={{ mt: -0.5 }}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ textAlign: 'center', pb: 3 }}>
        {ticket.status === 'used' ? (
          <Box sx={{ py: 2 }}>
            <TaskAltIcon sx={{ fontSize: 72, color: 'success.main' }} />
            <Typography variant="h6" fontWeight={700} color="success.main" mt={1}>Ticket Used</Typography>
            <Typography variant="body2" color="text.secondary" mt={0.5}>
              Scanned on {ticket.scanned_at ? fmtDate(ticket.scanned_at) : '—'}
            </Typography>
          </Box>
        ) : (
          <>
            <Typography variant="caption" color="text.secondary" display="block" mb={2}>
              Show this QR code at the gate for entry
            </Typography>
            {ticket.qr_token ? (
              <Box sx={{ display: 'inline-block', p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <QRCodeSVG value={ticket.qr_token} size={200} level="M" includeMargin={false} />
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">QR code not available.</Typography>
            )}
          </>
        )}
        <Divider sx={{ my: 2 }} />
        <Stack direction="row" justifyContent="center" spacing={3}>
          <Box textAlign="center">
            <Typography variant="caption" color="text.secondary">Tickets</Typography>
            <Typography fontWeight={700}>{ticket.ticket_count}</Typography>
          </Box>
          <Box textAlign="center">
            <Typography variant="caption" color="text.secondary">Paid</Typography>
            <Typography fontWeight={700}>{fmtAmount(ticket.total_amount)}</Typography>
          </Box>
          <Box textAlign="center">
            <Typography variant="caption" color="text.secondary">Ticket ID</Typography>
            <Typography fontWeight={700} sx={{ fontFamily: 'monospace', fontSize: 11 }}>
              {ticket.id.slice(0, 8).toUpperCase()}
            </Typography>
          </Box>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

// ── Ticket card ───────────────────────────────────────────────────────────────

function TicketCard({ ticket }: { ticket: Ticket }) {
  const [qrOpen, setQrOpen] = useState(false);
  const color = ticket.event_image_color ?? '#6366f1';

  return (
    <>
      <Paper
        variant="outlined"
        sx={{ borderRadius: 2, overflow: 'hidden', opacity: ticket.status === 'cancelled' ? 0.55 : 1 }}
      >
        <Box sx={{ height: 4, bgcolor: color }} />
        <Box sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1.5 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography fontWeight={700} fontSize={15} mb={0.5} noWrap>{ticket.event_title}</Typography>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'text.secondary', mb: 0.25 }}>
                <CalendarTodayIcon sx={{ fontSize: 13 }} />
                <Typography variant="caption">{fmtDate(ticket.event_start_time)}</Typography>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'text.secondary' }}>
                <LocationOnIcon sx={{ fontSize: 13 }} />
                <Typography variant="caption" noWrap>{ticket.event_venue}</Typography>
              </Stack>
            </Box>
            {statusChip(ticket)}
          </Box>

          <Divider sx={{ my: 1.5 }} />

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {ticket.ticket_count} ticket{ticket.ticket_count > 1 ? 's' : ''} · {fmtAmount(ticket.total_amount)}
            </Typography>
            {ticket.status !== 'cancelled' && (
              <Button
                size="small"
                variant={ticket.status === 'used' ? 'outlined' : 'contained'}
                startIcon={ticket.status === 'used' ? <TaskAltIcon /> : <QrCode2Icon />}
                color={ticket.status === 'used' ? 'success' : 'primary'}
                onClick={() => setQrOpen(true)}
              >
                {ticket.status === 'used' ? 'View Entry' : 'Show Ticket'}
              </Button>
            )}
          </Box>
        </Box>
      </Paper>

      {qrOpen && <QrDialog ticket={ticket} onClose={() => setQrOpen(false)} />}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export interface TicketsAppProps {
  token?: string | null;
}

export function TicketsApp({ token }: TicketsAppProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    fetch('/api/tickets/tickets/my', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data: Ticket[]) => { setTickets(data); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (!token) {
    return (
      <Container maxWidth="sm" sx={{ pt: 8, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary" mb={2}>Please log in to view your tickets.</Typography>
        <Button variant="contained" onClick={() => { window.location.href = '/'; }}>Go to Login</Button>
      </Container>
    );
  }

  const active    = tickets.filter(t => t.status === 'active');
  const used      = tickets.filter(t => t.status === 'used');

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="h5" fontWeight={800}>My Tickets</Typography>
          <Typography variant="body2" color="text.secondary">
            Your confirmed event tickets and QR codes for gate entry.
          </Typography>
        </Box>
        <Button size="small" variant="outlined" onClick={() => { window.location.href = '/registrations'; }}>
          View All Registrations
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {!loading && tickets.length === 0 && (
        <Box textAlign="center" py={8}>
          <ConfirmationNumberIcon sx={{ fontSize: 56, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">No tickets yet</Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Register for an event and complete payment to get your ticket here.
          </Typography>
          <Button variant="contained" onClick={() => { window.location.href = '/events'; }}>
            Browse Events
          </Button>
        </Box>
      )}

      {!loading && tickets.length > 0 && (
        <Stack spacing={3}>
          {active.length > 0 && (
            <Box>
              <Typography variant="subtitle2" color="success.main" fontWeight={700} mb={1.5}>
                Active Tickets ({active.length})
              </Typography>
              <Stack spacing={1.5}>
                {active.map(t => <TicketCard key={t.id} ticket={t} />)}
              </Stack>
            </Box>
          )}

          {used.length > 0 && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary" fontWeight={700} mb={1.5}>
                Past Events ({used.length})
              </Typography>
              <Stack spacing={1.5}>
                {used.map(t => <TicketCard key={t.id} ticket={t} />)}
              </Stack>
            </Box>
          )}
        </Stack>
      )}
    </Container>
  );
}

export default TicketsApp;
