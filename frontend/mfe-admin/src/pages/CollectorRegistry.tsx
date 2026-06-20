import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Container,
  Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, MenuItem, Paper, Stack, TextField, Typography,
} from '@mui/material';
import AddIcon    from '@mui/icons-material/Add';
import CloseIcon  from '@mui/icons-material/Close';
import EditIcon   from '@mui/icons-material/Edit';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RegistryEntry {
  id: string; event_id: string; event_title: string;
  member_id: string; member_name: string; member_email: string | null;
  upi_id: string; assigned_at: string;
}

interface Member { id: string; name: string; email: string | null; role: string }

interface EventItem {
  id: string; title: string; ticket_price: number;
  price_currency: string; is_free: boolean; start_time: string;
  collector_upi: string | null; collector_name: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function apiFetch(path: string, token: string, opts: RequestInit = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error(b.detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Assign Dialog ─────────────────────────────────────────────────────────────

function AssignDialog({
  token, entry, members, events, onClose, onDone,
}: {
  token: string;
  entry: RegistryEntry | null;
  members: Member[];
  events: EventItem[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [eventId, setEventId]   = useState(entry?.event_id ?? '');
  const [memberId, setMemberId] = useState(entry?.member_id ?? '');
  const [upiId, setUpiId]       = useState(entry?.upi_id ?? '');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const isEdit = Boolean(entry);

  async function save() {
    if (!eventId || !memberId || !upiId.trim()) {
      setError('All fields are required.'); return;
    }
    setLoading(true); setError(null);
    try {
      if (isEdit) {
        await apiFetch(`/api/payments/registry/${entry!.id}`, token, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ member_id: memberId, upi_id: upiId }),
        });
      } else {
        await apiFetch('/api/payments/registry', token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_id: eventId, member_id: memberId, upi_id: upiId }),
        });
      }
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {isEdit ? 'Reassign Collector' : 'Assign Collector'}
        <IconButton size="small" onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack spacing={2.5}>
          {!isEdit && (
            <TextField select label="Event" value={eventId} onChange={e => setEventId(e.target.value)} fullWidth>
              {events.filter(ev => !ev.is_free).map(ev => (
                <MenuItem key={ev.id} value={ev.id}>
                  {ev.title} ({fmtDate(ev.start_time)})
                </MenuItem>
              ))}
            </TextField>
          )}
          {isEdit && (
            <Box>
              <Typography variant="caption" color="text.secondary">Event</Typography>
              <Typography fontWeight={600}>{entry!.event_title}</Typography>
            </Box>
          )}
          <TextField select label="Collector (Committee Member)" value={memberId}
            onChange={e => setMemberId(e.target.value)} fullWidth>
            {members.map(m => (
              <MenuItem key={m.id} value={m.id}>{m.name} {m.email ? `· ${m.email}` : ''}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Collector's UPI ID"
            value={upiId} onChange={e => setUpiId(e.target.value)}
            fullWidth placeholder="name@bankname"
            helperText="The UPI ID where residents will pay for this event"
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant="contained" disabled={loading} onClick={save}>
          {loading ? <CircularProgress size={18} color="inherit" /> : isEdit ? 'Update' : 'Assign'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function CollectorRegistry({ token }: { token?: string | null }) {
  const [registry, setRegistry] = useState<RegistryEntry[]>([]);
  const [members, setMembers]   = useState<Member[]>([]);
  const [events, setEvents]     = useState<EventItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [dialog, setDialog]     = useState<RegistryEntry | null | 'new'>(undefined as any);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [reg, mem, evs] = await Promise.all([
        apiFetch('/api/payments/registry', token),
        apiFetch('/api/payments/registry/members', token),
        apiFetch('/api/payments/registry/events', token),
      ]);
      setRegistry(reg); setMembers(mem); setEvents(evs);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (!token) return <Box sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">Not authenticated.</Typography></Box>;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={800}>Collector Registry</Typography>
          <Typography variant="body2" color="text.secondary">
            Assign a committee member + UPI ID as payment collector for each event.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog('new')}>
          Assign Collector
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading
        ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
        : (
          <Stack spacing={1.5}>
            {registry.length === 0 && (
              <Typography color="text.secondary" textAlign="center" py={6}>
                No collectors assigned yet. Click "Assign Collector" to get started.
              </Typography>
            )}
            {registry.map(entry => (
              <Paper key={entry.id} variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography fontWeight={700}>{entry.event_title}</Typography>
                    <Typography variant="body2" color="text.secondary" mt={0.5}>
                      Collector: <strong>{entry.member_name}</strong>
                      {entry.member_email && ` · ${entry.member_email}`}
                    </Typography>
                    <Typography variant="body2" fontFamily="monospace" mt={0.5}>
                      UPI: {entry.upi_id}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Assigned {fmtDate(entry.assigned_at)}
                    </Typography>
                  </Box>
                  <Button size="small" variant="outlined" startIcon={<EditIcon />}
                    onClick={() => setDialog(entry)}>
                    Change
                  </Button>
                </Box>
              </Paper>
            ))}
          </Stack>
        )}

      {dialog !== undefined && (
        <AssignDialog
          token={token}
          entry={dialog === 'new' ? null : dialog as RegistryEntry}
          members={members}
          events={events}
          onClose={() => setDialog(undefined as any)}
          onDone={() => { setDialog(undefined as any); load(); }}
        />
      )}
    </Container>
  );
}
