import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import { useAuth } from '../contexts/AuthContext';

// ── API base URLs ─────────────────────────────────────────────────────────────

function apiBase(service: string) {
  return window.location.port === '3000'
    ? `${window.location.protocol}//${window.location.hostname}:8080/api/${service}`
    : `${window.location.origin}/api/${service}`;
}

async function apiFetch<T>(url: string, token: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface EventSummary {
  id: string;
  title: string;
  start_time: string;
  venue: string;
}

interface ScanResult {
  ticket_id: string;
  event_title: string;
  event_venue: string;
  user_name: string | null;
  ticket_count: number;
  status: string;
  scanned_at: string | null;
  already_scanned: boolean;
}

interface AttendeeRow {
  ticket_id: string;
  user_name: string | null;
  user_email: string | null;
  user_phone: string | null;
  ticket_count: number;
  status: string;
  scanned_at: string | null;
}

// ── QR Scan tab ───────────────────────────────────────────────────────────────

function QrScanTab({ token }: { token: string }) {
  const [qrInput, setQrInput]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [result,  setResult]    = useState<ScanResult | null>(null);
  const [error,   setError]     = useState<string | null>(null);

  const handleScan = async () => {
    const raw = qrInput.trim();
    if (!raw) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await apiFetch<ScanResult>(
        `${apiBase('tickets')}/tickets/scan`,
        token,
        { method: 'POST', body: JSON.stringify({ token: raw }) },
      );
      setResult(data);
      setQrInput('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 520, mx: 'auto', mt: 3 }}>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Enter or paste the QR code value from a resident's ticket.
      </Typography>

      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          fullWidth
          size="small"
          label="QR Code"
          value={qrInput}
          onChange={(e) => setQrInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleScan()}
          placeholder="Scan or paste QR token…"
          autoFocus
        />
        <Button
          variant="contained"
          onClick={handleScan}
          disabled={loading || !qrInput.trim()}
          sx={{ minWidth: 96, whiteSpace: 'nowrap' }}
        >
          {loading ? <CircularProgress size={18} color="inherit" /> : 'Verify'}
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {result && (
        <Paper
          variant="outlined"
          sx={{
            mt: 2.5, p: 2.5, borderRadius: 2,
            borderColor: result.already_scanned ? 'warning.main' : 'success.main',
            bgcolor: result.already_scanned ? '#fffbeb' : '#f0fdf4',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <CheckCircleIcon
              sx={{ color: result.already_scanned ? 'warning.main' : 'success.main', fontSize: 22 }}
            />
            <Typography fontWeight={700} fontSize={16}>
              {result.already_scanned ? 'Already checked in' : 'Entry granted'}
            </Typography>
            {result.already_scanned && (
              <Chip label="Duplicate" size="small" color="warning" sx={{ ml: 'auto' }} />
            )}
          </Box>
          <Divider sx={{ mb: 1.5 }} />
          <InfoRow label="Name"   value={result.user_name ?? '—'} />
          <InfoRow label="Event"  value={result.event_title} />
          <InfoRow label="Venue"  value={result.event_venue} />
          <InfoRow label="Tickets" value={String(result.ticket_count)} />
          {result.already_scanned && result.scanned_at && (
            <InfoRow label="Scanned at" value={new Date(result.scanned_at).toLocaleString()} />
          )}
        </Paper>
      )}
    </Box>
  );
}

// ── Search by List tab ────────────────────────────────────────────────────────

function SearchListTab({ token }: { token: string }) {
  const [events,      setEvents]      = useState<EventSummary[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventId,     setEventId]     = useState('');
  const [attendees,   setAttendees]   = useState<AttendeeRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [search,      setSearch]      = useState('');
  const [entering,    setEntering]    = useState<string | null>(null);
  const [entryResult, setEntryResult] = useState<{ id: string; already: boolean } | null>(null);
  const [error,       setError]       = useState<string | null>(null);

  // Load upcoming published events
  useEffect(() => {
    apiFetch<{ events: EventSummary[] }>(
      `${apiBase('events')}/events?status=published&limit=50&sort=date_asc`,
      token,
    )
      .then((d) => setEvents(d.events ?? []))
      .catch((e) => setError((e as Error).message))
      .finally(() => setEventsLoading(false));
  }, [token]);

  const loadAttendees = useCallback(async (eid: string) => {
    setListLoading(true);
    setError(null);
    setSearch('');
    setEntryResult(null);
    try {
      const rows = await apiFetch<AttendeeRow[]>(
        `${apiBase('tickets')}/tickets/event/${eid}`,
        token,
      );
      setAttendees(rows);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setListLoading(false);
    }
  }, [token]);

  const handleEventChange = (eid: string) => {
    setEventId(eid);
    setAttendees([]);
    if (eid) loadAttendees(eid);
  };

  const handleEntry = async (ticketId: string) => {
    setEntering(ticketId);
    setError(null);
    setEntryResult(null);
    try {
      const data = await apiFetch<ScanResult>(
        `${apiBase('tickets')}/tickets/${ticketId}/enter`,
        token,
        { method: 'POST' },
      );
      // update the row in-place
      setAttendees((prev) =>
        prev.map((a) =>
          a.ticket_id === ticketId
            ? { ...a, status: 'used', scanned_at: data.scanned_at }
            : a,
        ),
      );
      setEntryResult({ id: ticketId, already: data.already_scanned });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEntering(null);
    }
  };

  const filtered = attendees.filter((a) => {
    const q = search.toLowerCase().replace(/\s/g, '');
    if (!q) return true;
    const phone = (a.user_phone ?? '').replace(/\s/g, '');
    return (
      (a.user_name  ?? '').toLowerCase().includes(q) ||
      (a.user_email ?? '').toLowerCase().includes(q) ||
      phone.includes(q) ||
      phone.replace('+91', '').includes(q)
    );
  });

  const checkedIn  = attendees.filter((a) => a.status === 'used').length;
  const total      = attendees.length;

  return (
    <Box sx={{ mt: 3 }}>
      {/* Event selector */}
      <FormControl fullWidth size="small">
        <InputLabel>Select Event</InputLabel>
        {eventsLoading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1 }}>
            <CircularProgress size={16} /> <Typography fontSize={13}>Loading events…</Typography>
          </Box>
        ) : (
          <Select
            label="Select Event"
            value={eventId}
            onChange={(e) => handleEventChange(e.target.value)}
          >
            {events.map((ev) => (
              <MenuItem key={ev.id} value={ev.id}>
                <Box>
                  <Typography fontSize={14} fontWeight={600}>{ev.title}</Typography>
                  <Typography fontSize={12} color="text.secondary">
                    {new Date(ev.start_time).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {ev.venue ? ` · ${ev.venue}` : ''}
                  </Typography>
                </Box>
              </MenuItem>
            ))}
          </Select>
        )}
      </FormControl>

      {error && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {entryResult && (
        <Alert
          severity={entryResult.already ? 'warning' : 'success'}
          sx={{ mt: 2 }}
          onClose={() => setEntryResult(null)}
        >
          {entryResult.already
            ? 'This ticket was already checked in earlier.'
            : 'Entry marked successfully.'}
        </Alert>
      )}

      {/* Attendee list */}
      {eventId && (
        <Box sx={{ mt: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              placeholder="Search by name, email or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ flex: 1, minWidth: 200 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            <Button
              size="small"
              startIcon={<RefreshIcon />}
              onClick={() => loadAttendees(eventId)}
              disabled={listLoading}
            >
              Refresh
            </Button>
            {total > 0 && (
              <Chip
                label={`${checkedIn} / ${total} checked in`}
                size="small"
                color={checkedIn === total ? 'success' : 'default'}
              />
            )}
          </Box>

          {listLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : filtered.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
              <PersonSearchIcon sx={{ fontSize: 48, mb: 1, opacity: 0.4 }} />
              <Typography>
                {search ? 'No attendees match your search.' : 'No registered attendees for this event.'}
              </Typography>
            </Box>
          ) : (
            <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
              {filtered.map((row, i) => (
                <Box key={row.ticket_id}>
                  {i > 0 && <Divider />}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      px: 2,
                      py: 1.5,
                      gap: 2,
                      bgcolor: row.status === 'used' ? '#f0fdf4' : 'transparent',
                    }}
                  >
                    {/* Avatar initial */}
                    <Box
                      sx={{
                        width: 36, height: 36, borderRadius: '50%',
                        bgcolor: row.status === 'used' ? '#bbf7d0' : '#e2e8f0',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: 14, color: row.status === 'used' ? '#166534' : '#475569',
                        flexShrink: 0,
                      }}
                    >
                      {(row.user_name ?? '?')[0].toUpperCase()}
                    </Box>

                    {/* Name, email & phone */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography fontWeight={600} fontSize={14} noWrap>
                        {row.user_name ?? 'Unknown'}
                      </Typography>
                      <Typography fontSize={12} color="text.secondary" noWrap>
                        {row.user_email ?? ''}
                        {row.user_phone && ` · ${row.user_phone}`}
                        {row.ticket_count > 1 && ` · ${row.ticket_count} tickets`}
                      </Typography>
                    </Box>

                    {/* Status + action */}
                    {row.status === 'used' ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'success.main' }}>
                        <CheckCircleIcon fontSize="small" />
                        <Typography fontSize={12} fontWeight={600}>Checked In</Typography>
                      </Box>
                    ) : (
                      <Button
                        size="small"
                        variant="contained"
                        color="success"
                        startIcon={
                          entering === row.ticket_id
                            ? <CircularProgress size={14} color="inherit" />
                            : <HowToRegIcon />
                        }
                        disabled={entering === row.ticket_id}
                        onClick={() => handleEntry(row.ticket_id)}
                        sx={{ whiteSpace: 'nowrap', fontSize: 12 }}
                      >
                        Mark Entry
                      </Button>
                    )}
                  </Box>
                </Box>
              ))}
            </Paper>
          )}
        </Box>
      )}
    </Box>
  );
}

// ── Small helper ──────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, mb: 0.75 }}>
      <Typography fontSize={13} color="text.secondary" sx={{ minWidth: 80 }}>{label}</Typography>
      <Typography fontSize={13} fontWeight={500}>{value}</Typography>
    </Box>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function SecurityScanner() {
  const { token } = useAuth();
  const [tab, setTab] = useState(0);

  if (!token) {
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: 'center' }}>
        <Alert severity="warning">You must be logged in to use the gate scanner.</Alert>
      </Container>
    );
  }

  return (
    <Box component="main">
      {/* Header */}
      <Box
        sx={{
          background: 'linear-gradient(135deg,#1e293b 0%,#065f46 100%)',
          color: '#fff',
          py: { xs: 4, md: 5 },
          px: 3,
        }}
      >
        <Container maxWidth="md">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
            <QrCodeScannerIcon sx={{ fontSize: 28 }} />
            <Typography variant="h5" fontWeight={800}>
              Gate Entry
            </Typography>
          </Box>
          <Typography sx={{ fontSize: 15, color: '#a7f3d0' }}>
            Verify resident tickets by scanning a QR code or searching the attendee list.
          </Typography>
        </Container>
      </Box>

      <Container maxWidth="md" sx={{ py: 4 }}>
        <Paper variant="outlined" sx={{ borderRadius: 2 }}>
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
          >
            <Tab
              icon={<QrCodeScannerIcon fontSize="small" />}
              iconPosition="start"
              label="QR Scan"
              sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
            />
            <Tab
              icon={<PersonSearchIcon fontSize="small" />}
              iconPosition="start"
              label="Search by List"
              sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
            />
          </Tabs>

          <Box sx={{ p: { xs: 2, sm: 3 } }}>
            {tab === 0 && <QrScanTab token={token} />}
            {tab === 1 && <SearchListTab token={token} />}
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
