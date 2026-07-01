import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Container,
  Divider, Paper, Stack, Typography,
} from '@mui/material';
import CalendarTodayIcon      from '@mui/icons-material/CalendarToday';
import CheckCircleIcon        from '@mui/icons-material/CheckCircle';
import CloudUploadIcon        from '@mui/icons-material/CloudUpload';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import DeleteOutlineIcon      from '@mui/icons-material/DeleteOutline';
import ErrorOutlineIcon       from '@mui/icons-material/ErrorOutline';
import HourglassTopIcon       from '@mui/icons-material/HourglassTop';
import LocationOnIcon         from '@mui/icons-material/LocationOn';
import PaymentIcon            from '@mui/icons-material/Payment';
import QrCode2Icon            from '@mui/icons-material/QrCode2';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PaymentOut {
  id: string; status: string; payment_method: string | null;
  screenshot_path: string | null; utr_number: string | null;
  review_notes: string | null; created_at: string; reviewed_at: string | null;
}

interface Registration {
  id: string; event_id: string; event_title: string;
  event_start_time: string; event_end_time: string;
  event_venue: string; event_is_free: boolean;
  event_image_color: string | null;
  ticket_count: number; total_amount: number;
  display_currency: string; status: string;
  registered_at: string; payment: PaymentOut | null;
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

function statusInfo(reg: Registration): { label: string; color: 'success' | 'warning' | 'info' | 'error' | 'default'; icon: React.ReactNode } {
  const ps = reg.payment?.status;
  if (reg.status === 'confirmed')     return { label: 'Confirmed',        color: 'success', icon: <CheckCircleIcon /> };
  if (reg.status === 'attended')      return { label: 'Attended',         color: 'success', icon: <CheckCircleIcon /> };
  if (reg.status === 'cancelled')     return { label: 'Cancelled',        color: 'error',   icon: <ErrorOutlineIcon /> };
  if (ps === 'pending_screenshot')    return { label: 'Payment Pending',  color: 'warning', icon: <PaymentIcon /> };
  if (ps === 'pending_review')        return { label: 'Under Review',     color: 'info',    icon: <HourglassTopIcon /> };
  if (ps === 'rejected')              return { label: 'Payment Rejected', color: 'error',   icon: <ErrorOutlineIcon /> };
  return { label: reg.status, color: 'default', icon: <ConfirmationNumberIcon /> };
}

// ── Registration card ─────────────────────────────────────────────────────────

function RegCard({ reg, token, onCancelled }: { reg: Registration; token: string; onCancelled: () => void }) {
  const { label, color, icon } = statusInfo(reg);
  const colorBar = reg.event_image_color ?? '#6366f1';
  const isConfirmed = reg.status === 'confirmed' || reg.status === 'attended';
  const [cancelling, setCancelling] = useState(false);

  async function handleCancel() {
    if (!window.confirm(`Drop your registration for "${reg.event_title}"?`)) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/registrations/registrations/${reg.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      onCancelled();
    } catch {
      setCancelling(false);
    }
  }

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      <Box sx={{ height: 4, bgcolor: colorBar }} />
      <Box sx={{ p: 2.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography fontWeight={700} sx={{ fontSize: 15, mb: 0.5 }} noWrap>{reg.event_title}</Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'text.secondary', fontSize: 13, mb: 0.25 }}>
              <CalendarTodayIcon sx={{ fontSize: 14 }} />
              <Typography variant="caption">{fmtDate(reg.event_start_time)}</Typography>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'text.secondary', fontSize: 13 }}>
              <LocationOnIcon sx={{ fontSize: 14 }} />
              <Typography variant="caption" noWrap>{reg.event_venue}</Typography>
            </Stack>
          </Box>
          <Chip label={label} color={color} size="small" icon={icon as React.ReactElement} />
        </Box>

        <Divider sx={{ my: 1.5 }} />

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {reg.ticket_count} ticket{reg.ticket_count > 1 ? 's' : ''} · {fmtAmount(reg.total_amount)}
          </Typography>

          <Stack direction="row" spacing={1}>
            {isConfirmed && (
              <Button size="small" variant="outlined" startIcon={<QrCode2Icon />}
                onClick={() => { window.location.href = '/tickets'; }}>
                View Ticket
              </Button>
            )}
            {reg.payment?.status === 'pending_screenshot' && (
              <Button size="small" variant="contained" startIcon={<CloudUploadIcon />}
                onClick={() => { window.location.href = '/checkout'; }}>
                Upload Payment
              </Button>
            )}
            {reg.payment?.status === 'rejected' && (
              <Button size="small" variant="outlined" color="error" startIcon={<CloudUploadIcon />}
                onClick={() => { window.location.href = '/checkout'; }}>
                Re-upload
              </Button>
            )}
            {!isConfirmed && (
              <Button size="small" variant="outlined" color="error" disabled={cancelling}
                startIcon={cancelling ? <CircularProgress size={14} color="inherit" /> : <DeleteOutlineIcon />}
                onClick={handleCancel}>
                Drop
              </Button>
            )}
          </Stack>
        </Box>

        {reg.payment?.status === 'rejected' && reg.payment.review_notes && (
          <Alert severity="error" sx={{ mt: 1.5, py: 0.5, fontSize: 12 }}>
            Rejected: {reg.payment.review_notes}
          </Alert>
        )}
      </Box>
    </Paper>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export interface BookingAppProps {
  token?: string | null;
}

export function BookingApp({ token }: BookingAppProps) {
  const [regs, setRegs]       = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    fetch('/api/registrations/registrations/my', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data: Registration[]) => { setRegs(data); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (!token) {
    return (
      <Container maxWidth="sm" sx={{ pt: 8, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary" mb={2}>Please log in to view your registrations.</Typography>
        <Button variant="contained" onClick={() => { window.location.href = '/'; }}>Go to Login</Button>
      </Container>
    );
  }

  const live      = regs.filter(r => r.status !== 'cancelled');
  const confirmed = live.filter(r => r.status === 'confirmed' || r.status === 'attended');
  const pending   = live.filter(r => r.payment?.status === 'pending_screenshot');
  const reviewing = live.filter(r => r.payment?.status === 'pending_review');
  const rejected  = live.filter(r => r.payment?.status === 'rejected');

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="h5" fontWeight={800}>My Registrations</Typography>
          <Typography variant="body2" color="text.secondary">
            Track payment status and upload screenshots for pending registrations.
          </Typography>
        </Box>
        <Button size="small" variant="outlined" startIcon={<QrCode2Icon />}
          onClick={() => { window.location.href = '/tickets'; }}>
          My Tickets
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', pt: 6 }}><CircularProgress /></Box>}

      {!loading && regs.length === 0 && (
        <Box textAlign="center" py={8}>
          <ConfirmationNumberIcon sx={{ fontSize: 56, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">No registrations yet</Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Register for an event to see your registration status here.
          </Typography>
          <Button variant="contained" onClick={() => { window.location.href = '/events'; }}>
            Browse Events
          </Button>
        </Box>
      )}

      {!loading && regs.length > 0 && (
        <Stack spacing={3}>
          {pending.length > 0 && (
            <Box>
              <Typography variant="subtitle2" color="warning.main" fontWeight={700} mb={1.5}>
                Awaiting Payment Upload ({pending.length})
              </Typography>
              <Stack spacing={1.5}>{pending.map(r => <RegCard key={r.id} reg={r} token={token!} onCancelled={load} />)}</Stack>
            </Box>
          )}
          {reviewing.length > 0 && (
            <Box>
              <Typography variant="subtitle2" color="info.main" fontWeight={700} mb={1.5}>
                Under Review ({reviewing.length})
              </Typography>
              <Stack spacing={1.5}>{reviewing.map(r => <RegCard key={r.id} reg={r} token={token!} onCancelled={load} />)}</Stack>
            </Box>
          )}
          {rejected.length > 0 && (
            <Box>
              <Typography variant="subtitle2" color="error.main" fontWeight={700} mb={1.5}>
                Payment Rejected — Action Required ({rejected.length})
              </Typography>
              <Stack spacing={1.5}>{rejected.map(r => <RegCard key={r.id} reg={r} token={token!} onCancelled={load} />)}</Stack>
            </Box>
          )}
          {confirmed.length > 0 && (
            <Box>
              <Typography variant="subtitle2" color="success.main" fontWeight={700} mb={1.5}>
                Confirmed ({confirmed.length})
              </Typography>
              <Stack spacing={1.5}>{confirmed.map(r => <RegCard key={r.id} reg={r} token={token!} onCancelled={load} />)}</Stack>
            </Box>
          )}
        </Stack>
      )}
    </Container>
  );
}

export default BookingApp;
