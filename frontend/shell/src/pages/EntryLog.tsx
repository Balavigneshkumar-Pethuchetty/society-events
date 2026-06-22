import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ApartmentIcon from '@mui/icons-material/Apartment';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import EventNoteIcon from '@mui/icons-material/EventNote';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import LayersIcon from '@mui/icons-material/Layers';
import PendingIcon from '@mui/icons-material/Pending';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import { useAuth } from '../contexts/AuthContext';

// ── API helpers ───────────────────────────────────────────────────────────────

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
  end_time: string;
  venue: string;
  status: string;
}

interface AttendeeRow {
  ticket_id: string;
  user_name: string | null;
  user_email: string | null;
  user_phone: string | null;
  ticket_count: number;
  status: 'active' | 'used';
  scanned_at: string | null;
  unit_label: string | null;
  /** Populated only in combined view */
  _event_id?: string;
  _event_title?: string;
  _event_color?: string;
}

type StatusFilter = 'all' | 'checked_in' | 'pending';
type SearchMode   = 'name' | 'apartment' | 'ticket';

// ── Event relevance helpers ───────────────────────────────────────────────────

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

/** True if the event is currently happening or starts within the next 2 hours. */
function isNearby(ev: EventSummary, now: Date): boolean {
  const start = new Date(ev.start_time).getTime();
  const end   = new Date(ev.end_time).getTime();
  const ts    = now.getTime();
  return (start <= ts && end >= ts) || (start > ts && start - ts <= TWO_HOURS_MS);
}

/** True if two events have overlapping time windows (simultaneous). */
function overlap(a: EventSummary, b: EventSummary): boolean {
  return new Date(a.start_time) < new Date(b.end_time) &&
         new Date(b.start_time) < new Date(a.end_time);
}

/** Sort key: ongoing first, then nearest upcoming, then past. */
function eventSortKey(ev: EventSummary, now: Date): number {
  const start = new Date(ev.start_time).getTime();
  const end   = new Date(ev.end_time).getTime();
  const ts    = now.getTime();
  if (start <= ts && end >= ts) return 0;          // ongoing
  if (start > ts)               return start - ts; // upcoming (sooner = lower)
  return ts - end + 1e12;                          // past (later end = lower)
}

// ── Palette for event colour badges in combined view ─────────────────────────

const EVENT_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#0ea5e9', '#ec4899'];

// ── Search mode config ────────────────────────────────────────────────────────

const SEARCH_MODES: { value: SearchMode; label: string; placeholder: string; icon: React.ReactNode }[] = [
  { value: 'name',      label: 'By Name',     placeholder: 'Search by name, email or phone…',  icon: <PersonSearchIcon fontSize="small" /> },
  { value: 'apartment', label: 'By Apartment', placeholder: 'Search by block, unit or flat no…', icon: <ApartmentIcon fontSize="small" /> },
  { value: 'ticket',    label: 'By Ticket ID', placeholder: 'Paste or type ticket ID…',          icon: <ConfirmationNumberIcon fontSize="small" /> },
];

function matchRow(row: AttendeeRow, mode: SearchMode, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase().trim().replace(/\s/g, '');
  switch (mode) {
    case 'name': {
      const phone = (row.user_phone ?? '').replace(/\s/g, '');
      return (
        (row.user_name  ?? '').toLowerCase().includes(q) ||
        (row.user_email ?? '').toLowerCase().includes(q) ||
        phone.includes(q) ||
        phone.replace('+91', '').includes(q)
      );
    }
    case 'apartment': return (row.unit_label ?? '').toLowerCase().includes(q);
    case 'ticket':    return row.ticket_id.toLowerCase().includes(q);
    default:          return true;
  }
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatsBar({ rows }: { rows: AttendeeRow[] }) {
  const total     = rows.length;
  const checkedIn = rows.filter((r) => r.status === 'used').length;
  const pending   = total - checkedIn;
  const pct       = total > 0 ? Math.round((checkedIn / total) * 100) : 0;

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2 }}>
      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mb: 1.5 }}>
        <StatItem value={total}     label="Registered" color="#6366f1" />
        <StatItem value={checkedIn} label="Checked In"  color="#10b981" />
        <StatItem value={pending}   label="Pending"     color="#f59e0b" />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <LinearProgress
          variant="determinate"
          value={pct}
          sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: '#e2e8f0',
                '& .MuiLinearProgress-bar': { bgcolor: '#10b981' } }}
        />
        <Typography fontSize={12} fontWeight={700} color="#10b981" sx={{ minWidth: 36 }}>
          {pct}%
        </Typography>
      </Box>
    </Paper>
  );
}

function StatItem({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
      <Typography fontSize={24} fontWeight={800} color={color}>{value}</Typography>
      <Typography fontSize={13} color="text.secondary">{label}</Typography>
    </Box>
  );
}

// ── Attendee card ─────────────────────────────────────────────────────────────

function AttendeeCard({
  row, entering, onEnter, justEntered,
}: {
  row: AttendeeRow;
  entering: boolean;
  onEnter: (ticketId: string) => void;
  justEntered: boolean;
}) {
  const isCheckedIn = row.status === 'used';
  const initial     = (row.user_name ?? '?')[0].toUpperCase();

  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'center',
        px: { xs: 1.5, sm: 2 }, py: 1.5, gap: 1.5,
        bgcolor: isCheckedIn ? '#f0fdf4' : justEntered ? '#fffbeb' : 'transparent',
        transition: 'background-color 0.4s',
      }}
    >
      {/* Avatar */}
      <Box sx={{
        width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
        bgcolor: isCheckedIn ? '#bbf7d0' : '#e2e8f0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: 15,
        color: isCheckedIn ? '#166534' : '#475569',
      }}>
        {initial}
      </Box>

      {/* Info */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography fontWeight={700} fontSize={14} noWrap>
            {row.user_name ?? 'Unknown'}
          </Typography>
          {/* Event badge — only in combined view */}
          {row._event_title && (
            <Chip
              label={row._event_title}
              size="small"
              sx={{
                height: 18, fontSize: 10,
                bgcolor: (row._event_color ?? '#6366f1') + '22',
                color:   row._event_color ?? '#6366f1',
                fontWeight: 600,
              }}
            />
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.25 }}>
          {row.user_email && (
            <Typography fontSize={12} color="text.secondary" noWrap sx={{ maxWidth: 200 }}>
              {row.user_email}
            </Typography>
          )}
          {row.user_phone && (
            <Typography fontSize={12} color="text.secondary" noWrap>
              {row.user_phone}
            </Typography>
          )}
          {row.unit_label && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
              <ApartmentIcon sx={{ fontSize: 11, color: '#94a3b8' }} />
              <Typography fontSize={12} color="#6366f1" fontWeight={500} noWrap>
                {row.unit_label}
              </Typography>
            </Box>
          )}
          {row.ticket_count > 1 && (
            <Chip label={`${row.ticket_count} tickets`} size="small"
              sx={{ height: 18, fontSize: 11, bgcolor: '#ede9fe', color: '#5b21b6' }} />
          )}
        </Box>
        {isCheckedIn && row.scanned_at && (
          <Typography fontSize={11} color="success.main" sx={{ mt: 0.25 }}>
            ✓ Checked in at {new Date(row.scanned_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </Typography>
        )}
      </Box>

      {/* Action */}
      {isCheckedIn ? (
        <Tooltip title={row.scanned_at ? new Date(row.scanned_at).toLocaleString() : ''}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'success.main', flexShrink: 0 }}>
            <CheckCircleIcon fontSize="small" />
            <Typography fontSize={12} fontWeight={700} sx={{ display: { xs: 'none', sm: 'block' } }}>
              Checked In
            </Typography>
          </Box>
        </Tooltip>
      ) : (
        <Button
          size="small" variant="contained" color="success"
          onClick={() => onEnter(row.ticket_id)}
          disabled={entering}
          startIcon={entering ? <CircularProgress size={13} color="inherit" /> : <HowToRegIcon />}
          sx={{ whiteSpace: 'nowrap', fontSize: 12, flexShrink: 0 }}
        >
          Mark Entry
        </Button>
      )}
    </Box>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ query, filter }: { query: string; filter: StatusFilter }) {
  const msg = query
    ? 'No attendees match your search.'
    : filter === 'checked_in' ? 'No one has checked in yet.'
    : filter === 'pending'    ? 'Everyone has already checked in!'
    : 'No registered attendees for this event.';
  return (
    <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
      {filter === 'pending' && !query
        ? <CheckCircleIcon sx={{ fontSize: 48, mb: 1, color: '#10b981', opacity: 0.7 }} />
        : <PersonSearchIcon sx={{ fontSize: 48, mb: 1, opacity: 0.35 }} />}
      <Typography>{msg}</Typography>
    </Box>
  );
}

// ── Roster panel (shared by single-event and combined view) ───────────────────

function RosterPanel({
  rows, loading, onEnter, onRefresh, error, onClearError,
}: {
  rows: AttendeeRow[];
  loading: boolean;
  onEnter: (ticketId: string) => Promise<void>;
  onRefresh: () => void;
  error: string | null;
  onClearError: () => void;
}) {
  const [searchMode,   setSearchMode]   = useState<SearchMode>('name');
  const [query,        setQuery]        = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [entering,     setEntering]     = useState<string | null>(null);
  const [justEntered,  setJustEntered]  = useState<string | null>(null);
  const [entryMsg,     setEntryMsg]     = useState<{ text: string; severity: 'success' | 'warning' } | null>(null);

  const handleEntry = async (ticketId: string) => {
    setEntering(ticketId);
    setEntryMsg(null);
    try {
      await onEnter(ticketId);
      setJustEntered(ticketId);
      setTimeout(() => setJustEntered(null), 2500);
    } finally {
      setEntering(null);
    }
  };

  const filtered = useMemo(() => rows.filter((row) => {
    if (statusFilter === 'checked_in' && row.status !== 'used') return false;
    if (statusFilter === 'pending'    && row.status === 'used') return false;
    return matchRow(row, searchMode, query);
  }), [rows, searchMode, query, statusFilter]);

  const checkedIn = rows.filter((r) => r.status === 'used').length;
  const pending   = rows.length - checkedIn;
  const currentMode = SEARCH_MODES.find((m) => m.value === searchMode)!;

  return (
    <>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={onClearError}>{error}</Alert>
      )}
      {entryMsg && (
        <Alert severity={entryMsg.severity} sx={{ mb: 2 }} onClose={() => setEntryMsg(null)}>
          {entryMsg.text}
        </Alert>
      )}

      {!loading && rows.length > 0 && <StatsBar rows={rows} />}

      <Paper variant="outlined" sx={{ borderRadius: 2 }}>
        {/* Toolbar */}
        <Box sx={{ p: { xs: 1.5, sm: 2 }, display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search mode toggle */}
          <Box sx={{ display: 'flex', border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden', flexShrink: 0 }}>
            {SEARCH_MODES.map((m, idx) => (
              <Button key={m.value} size="small" startIcon={m.icon}
                onClick={() => { setSearchMode(m.value); setQuery(''); }}
                sx={{
                  borderRadius: 0, px: 1.5, py: 0.75, fontSize: 12, textTransform: 'none', minWidth: 0,
                  bgcolor: searchMode === m.value ? '#6366f1' : 'transparent',
                  color:   searchMode === m.value ? '#fff'    : 'text.secondary',
                  '&:hover': { bgcolor: searchMode === m.value ? '#4f46e5' : '#f1f5f9' },
                  borderRight: idx < SEARCH_MODES.length - 1 ? '1px solid' : undefined,
                  borderColor: 'divider',
                }}
              >
                <Box sx={{ display: { xs: 'none', sm: 'block' } }}>{m.label}</Box>
              </Button>
            ))}
          </Box>

          <TextField size="small" placeholder={currentMode.placeholder}
            value={query} onChange={(e) => setQuery(e.target.value)}
            sx={{ flex: 1, minWidth: 180 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          />

          <Button size="small" startIcon={<RefreshIcon />} onClick={onRefresh} disabled={loading} sx={{ flexShrink: 0 }}>
            Refresh
          </Button>
        </Box>

        {/* Status tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 1 }}>
          <Tabs value={statusFilter} onChange={(_, v) => setStatusFilter(v as StatusFilter)} sx={{ minHeight: 40 }}>
            <Tab value="all"        label={`All (${rows.length})`}   sx={{ minHeight: 40, textTransform: 'none', fontSize: 13, py: 0 }} />
            <Tab value="checked_in" icon={<CheckCircleIcon sx={{ fontSize: 14 }} />} iconPosition="start"
              label={`Checked In (${checkedIn})`} sx={{ minHeight: 40, textTransform: 'none', fontSize: 13, py: 0, color: '#10b981' }} />
            <Tab value="pending"    icon={<PendingIcon sx={{ fontSize: 14 }} />} iconPosition="start"
              label={`Pending (${pending})`}     sx={{ minHeight: 40, textTransform: 'none', fontSize: 13, py: 0, color: '#f59e0b' }} />
          </Tabs>
        </Box>

        {/* List */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
        ) : filtered.length === 0 ? (
          <EmptyState query={query} filter={statusFilter} />
        ) : (
          filtered.map((row, i) => (
            <Box key={row.ticket_id}>
              {i > 0 && <Divider />}
              <AttendeeCard
                row={row}
                entering={entering === row.ticket_id}
                onEnter={handleEntry}
                justEntered={justEntered === row.ticket_id}
              />
            </Box>
          ))
        )}
      </Paper>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function EntryLog() {
  const { token } = useAuth();

  const [allEvents,     setAllEvents]     = useState<EventSummary[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError,   setEventsError]   = useState<string | null>(null);

  // Key for "which events are selected for the roster": array of event IDs.
  // If length > 1 → combined view.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // activeTab: one of the selected event IDs OR '__combined__'
  const [activeTab, setActiveTab] = useState<string>('');

  // roster state: map eventId → rows
  const [rosterMap,    setRosterMap]    = useState<Record<string, AttendeeRow[]>>({});
  const [loadingMap,   setLoadingMap]   = useState<Record<string, boolean>>({});
  const [rosterError,  setRosterError]  = useState<string | null>(null);

  if (!token) return null;

  // ── Load events ─────────────────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([
      apiFetch<{ events: EventSummary[] }>(`${apiBase('events')}/events?status=published&limit=50&sort=date_asc`, token),
      apiFetch<{ events: EventSummary[] }>(`${apiBase('events')}/events?status=completed&limit=50&sort=date_desc`, token),
    ])
      .then(([pub, comp]) => {
        const now = new Date();
        const merged = [...(pub.events ?? []), ...(comp.events ?? [])];

        // Display sort: published events first (nearest date first),
        // then completed/past events (most recent date first).
        // Uses status field — not raw date — so completed events with future
        // dates don't float above published upcoming ones.
        merged.sort((a, b) => {
          const aMs  = new Date(a.start_time).getTime();
          const bMs  = new Date(b.start_time).getTime();
          const aPub = a.status === 'published';
          const bPub = b.status === 'published';
          if (aPub && !bPub)  return -1;        // published before completed
          if (!aPub && bPub)  return 1;
          if (aPub  && bPub)  return aMs - bMs; // both published: nearest first
          return bMs - aMs;                     // both completed: most recent first
        });
        setAllEvents(merged);

        // Auto-select: prefer live events, then the nearest published upcoming event.
        // Never auto-select completed/past events.
        const published = merged.filter((ev) => ev.status === 'published');
        if (published.length > 0) {
          const ts   = now.getTime();
          const live = published.filter((ev) => {
            const s = new Date(ev.start_time).getTime();
            const e = new Date(ev.end_time).getTime();
            return s <= ts && e >= ts;
          });
          // Live events all get selected together; otherwise pick the nearest upcoming
          const toSelect = live.length > 0 ? live : [published[0]];
          const ids = toSelect.map((e) => e.id);
          setSelectedIds(ids);
          setActiveTab(ids.length > 1 ? '__combined__' : ids[0]);
        }
        // If no published events exist, leave empty — guard picks manually
      })
      .catch((e) => setEventsError((e as Error).message))
      .finally(() => setEventsLoading(false));
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load roster whenever selectedIds change ──────────────────────────────────

  const loadRoster = useCallback(async (eventId: string) => {
    setLoadingMap((prev) => ({ ...prev, [eventId]: true }));
    setRosterError(null);
    try {
      const rows = await apiFetch<AttendeeRow[]>(
        `${apiBase('tickets')}/tickets/event/${eventId}`, token,
      );
      setRosterMap((prev) => ({ ...prev, [eventId]: rows }));
    } catch (e) {
      setRosterError((e as Error).message);
    } finally {
      setLoadingMap((prev) => ({ ...prev, [eventId]: false }));
    }
  }, [token]);

  useEffect(() => {
    selectedIds.forEach((id) => {
      if (!rosterMap[id]) loadRoster(id);
    });
  }, [selectedIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mark entry ───────────────────────────────────────────────────────────────

  const handleEntry = useCallback(async (ticketId: string) => {
    const data = await apiFetch<{ already_scanned: boolean; scanned_at: string | null }>(
      `${apiBase('tickets')}/tickets/${ticketId}/enter`, token, { method: 'POST' },
    );
    // Update all rosters that contain this ticket
    setRosterMap((prev) => {
      const updated = { ...prev };
      for (const eid of Object.keys(updated)) {
        updated[eid] = updated[eid].map((r) =>
          r.ticket_id === ticketId ? { ...r, status: 'used', scanned_at: data.scanned_at } : r,
        );
      }
      return updated;
    });
  }, [token]);

  // ── Derived values ───────────────────────────────────────────────────────────

  // Events that overlap with any of the selected events (for the "simultaneous" banner)
  const simultaneousGroups = useMemo(() => {
    if (selectedIds.length === 0) return [];
    const baseEvents = allEvents.filter((e) => selectedIds.includes(e.id));
    return allEvents.filter((e) =>
      !selectedIds.includes(e.id) && baseEvents.some((b) => overlap(b, e)),
    );
  }, [allEvents, selectedIds]);

  // Combined rows for the '__combined__' tab
  const combinedRows = useMemo((): AttendeeRow[] => {
    return selectedIds.flatMap((eid, idx) => {
      const ev = allEvents.find((e) => e.id === eid);
      return (rosterMap[eid] ?? []).map((r) => ({
        ...r,
        _event_id:    eid,
        _event_title: ev?.title ?? '',
        _event_color: EVENT_COLORS[idx % EVENT_COLORS.length],
      }));
    });
  }, [selectedIds, rosterMap, allEvents]);

  const isLoadingAny = selectedIds.some((id) => loadingMap[id]);

  // Rows for the active tab
  const activeRows: AttendeeRow[] = activeTab === '__combined__'
    ? combinedRows
    : (rosterMap[activeTab] ?? []);

  const activeLoading = activeTab === '__combined__' ? isLoadingAny : !!loadingMap[activeTab];

  const handleRefresh = () => {
    if (activeTab === '__combined__') {
      selectedIds.forEach(loadRoster);
    } else if (activeTab) {
      loadRoster(activeTab);
    }
  };

  // ── Manual event selection (dropdown) ────────────────────────────────────────

  const handleDropdownChange = (eventId: string) => {
    if (!eventId) return;
    const now = new Date();
    const chosenEvent = allEvents.find((e) => e.id === eventId);
    if (!chosenEvent) return;

    // Find other events overlapping with the chosen one
    const overlapping = allEvents.filter(
      (e) => e.id !== eventId && overlap(chosenEvent, e),
    );

    if (overlapping.length > 0) {
      // Auto-group with overlapping events
      const ids = [eventId, ...overlapping.map((e) => e.id)];
      setSelectedIds(ids);
      setActiveTab('__combined__');
    } else {
      setSelectedIds([eventId]);
      setActiveTab(eventId);
    }
  };

  // ── Event status badge ────────────────────────────────────────────────────────

  function eventStatusLabel(ev: EventSummary): { label: string; color: string; bg: string } {
    const now = new Date();
    const start = new Date(ev.start_time);
    const end   = new Date(ev.end_time);
    if (start <= now && end >= now) return { label: 'Live',     color: '#166534', bg: '#dcfce7' };
    if (start > now && isNearby(ev, now)) return { label: 'Soon', color: '#92400e', bg: '#fef3c7' };
    if (ev.status === 'completed')        return { label: 'Past', color: '#475569', bg: '#f1f5f9' };
    return { label: 'Upcoming', color: '#1d4ed8', bg: '#dbeafe' };
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const selectedEvents = allEvents.filter((e) => selectedIds.includes(e.id));
  const showCombinedTab = selectedIds.length > 1;

  return (
    <Box component="main">
      {/* Header */}
      <Box sx={{ background: 'linear-gradient(135deg,#1e293b 0%,#312e81 100%)', color: '#fff', py: { xs: 4, md: 5 }, px: 3 }}>
        <Container maxWidth="lg">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
            <FactCheckIcon sx={{ fontSize: 28 }} />
            <Typography variant="h5" fontWeight={800}>Entry Log</Typography>
          </Box>
          <Typography sx={{ fontSize: 15, color: '#c7d2fe' }}>
            Search attendees by name, apartment, or ticket ID — and mark gate entry.
          </Typography>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 4 }}>

        {/* Event selector */}
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 2, mb: 3 }}>
          <Typography fontSize={13} fontWeight={600} color="text.secondary" mb={1.25}>
            Select Event
          </Typography>

          {eventsLoading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={16} />
              <Typography fontSize={13} color="text.secondary">Loading events…</Typography>
            </Box>
          ) : eventsError ? (
            <Alert severity="error">{eventsError}</Alert>
          ) : (
            <FormControl fullWidth size="small">
              <InputLabel>Choose an event</InputLabel>
              <Select
                label="Choose an event"
                value={selectedIds[0] ?? ''}
                onChange={(e) => handleDropdownChange(e.target.value)}
              >
                {allEvents.map((ev) => {
                  const badge = eventStatusLabel(ev);
                  return (
                    <MenuItem key={ev.id} value={ev.id}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography fontSize={14} fontWeight={600} noWrap>{ev.title}</Typography>
                          <Typography fontSize={12} color="text.secondary">
                            {new Date(ev.start_time).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {ev.venue ? ` · ${ev.venue}` : ''}
                          </Typography>
                        </Box>
                        <Chip label={badge.label} size="small"
                          sx={{ height: 20, fontSize: 10, flexShrink: 0, bgcolor: badge.bg, color: badge.color, fontWeight: 600 }}
                        />
                      </Box>
                    </MenuItem>
                  );
                })}
              </Select>
            </FormControl>
          )}

          {/* Simultaneous events notice */}
          {simultaneousGroups.length > 0 && (
            <Alert
              severity="info"
              icon={<LayersIcon fontSize="small" />}
              sx={{ mt: 2, fontSize: 13 }}
              action={
                <Button size="small" color="info" onClick={() => {
                  const ids = [...selectedIds, ...simultaneousGroups.map((e) => e.id)];
                  setSelectedIds(ids);
                  setActiveTab('__combined__');
                }}>
                  View All Together
                </Button>
              }
            >
              <strong>{simultaneousGroups.length} other event{simultaneousGroups.length > 1 ? 's' : ''}</strong> overlap with this time slot:{' '}
              {simultaneousGroups.map((e) => e.title).join(', ')}. Use "View All Together" to manage entry for all simultaneously.
            </Alert>
          )}

          {/* Selected events summary chips when in multi-event mode */}
          {selectedIds.length > 1 && (
            <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Typography fontSize={12} color="text.secondary">Managing:</Typography>
              {selectedEvents.map((ev, i) => (
                <Chip
                  key={ev.id}
                  label={ev.title}
                  size="small"
                  onDelete={() => {
                    const ids = selectedIds.filter((id) => id !== ev.id);
                    setSelectedIds(ids);
                    setActiveTab(ids.length > 1 ? '__combined__' : ids[0] ?? '');
                  }}
                  sx={{
                    bgcolor: EVENT_COLORS[i % EVENT_COLORS.length] + '22',
                    color:   EVENT_COLORS[i % EVENT_COLORS.length],
                    fontWeight: 600, fontSize: 12,
                    '& .MuiChip-deleteIcon': { color: EVENT_COLORS[i % EVENT_COLORS.length] },
                  }}
                />
              ))}
              <Button size="small" sx={{ fontSize: 11 }} onClick={() => {
                if (selectedIds.length > 0) { setSelectedIds([selectedIds[0]]); setActiveTab(selectedIds[0]); }
              }}>
                Clear others
              </Button>
            </Box>
          )}
        </Paper>

        {/* Roster */}
        {selectedIds.length > 0 && (
          <>
            {/* Event tabs — only shown when multiple events are selected */}
            {showCombinedTab && (
              <Paper variant="outlined" sx={{ borderRadius: 2, mb: 2 }}>
                <Tabs
                  value={activeTab}
                  onChange={(_, v) => setActiveTab(v)}
                  variant="scrollable"
                  scrollButtons="auto"
                  sx={{ borderBottom: 0, px: 1 }}
                >
                  <Tab
                    value="__combined__"
                    icon={<LayersIcon fontSize="small" />}
                    iconPosition="start"
                    label={`Combined (${combinedRows.length})`}
                    sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700, fontSize: 13 }}
                  />
                  {selectedEvents.map((ev, i) => {
                    const rows = rosterMap[ev.id] ?? [];
                    const badge = eventStatusLabel(ev);
                    return (
                      <Tab
                        key={ev.id}
                        value={ev.id}
                        label={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: EVENT_COLORS[i % EVENT_COLORS.length], flexShrink: 0 }} />
                            <Box sx={{ textAlign: 'left' }}>
                              <Typography fontSize={13} fontWeight={600} noWrap sx={{ maxWidth: 160 }}>{ev.title}</Typography>
                              <Typography fontSize={10} color="text.secondary">
                                {rows.filter((r) => r.status === 'used').length}/{rows.length} in
                                &nbsp;·&nbsp;
                                <span style={{ color: badge.color }}>{badge.label}</span>
                              </Typography>
                            </Box>
                          </Box>
                        }
                        sx={{ minHeight: 52, textTransform: 'none', alignItems: 'flex-start', px: 2 }}
                      />
                    );
                  })}
                </Tabs>
              </Paper>
            )}

            {/* Single-event header when not combined */}
            {!showCombinedTab && selectedEvents[0] && (() => {
              const ev    = selectedEvents[0];
              const badge = eventStatusLabel(ev);
              return (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
                  <EventNoteIcon sx={{ color: '#6366f1' }} />
                  <Typography fontWeight={700} fontSize={16}>{ev.title}</Typography>
                  <Chip label={badge.label} size="small"
                    sx={{ height: 20, fontSize: 10, bgcolor: badge.bg, color: badge.color, fontWeight: 600 }} />
                  <Typography fontSize={13} color="text.secondary">
                    {new Date(ev.start_time).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {' '}
                    {new Date(ev.start_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    {' – '}
                    {new Date(ev.end_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    {ev.venue ? ` · ${ev.venue}` : ''}
                  </Typography>
                </Box>
              );
            })()}

            <RosterPanel
              rows={activeRows}
              loading={activeLoading}
              onEnter={handleEntry}
              onRefresh={handleRefresh}
              error={rosterError}
              onClearError={() => setRosterError(null)}
            />
          </>
        )}

        {/* Prompt when nothing selected */}
        {selectedIds.length === 0 && !eventsLoading && (
          <Box sx={{ textAlign: 'center', py: 10, color: 'text.secondary' }}>
            <FactCheckIcon sx={{ fontSize: 56, mb: 1.5, opacity: 0.3 }} />
            <Typography fontWeight={600}>Select an event above to view its entry log.</Typography>
            <Typography fontSize={13} mt={0.5}>
              Upcoming or ongoing events are pre-selected automatically.
            </Typography>
          </Box>
        )}
      </Container>
    </Box>
  );
}
