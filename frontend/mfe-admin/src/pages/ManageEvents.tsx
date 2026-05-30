import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
  Container, Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, IconButton, MenuItem, Paper, Stack, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon            from '@mui/icons-material/Add';
import EditIcon           from '@mui/icons-material/Edit';
import PublishIcon        from '@mui/icons-material/PublishOutlined';
import CancelIcon         from '@mui/icons-material/DoNotDisturbOutlined';
import CheckCircleIcon    from '@mui/icons-material/CheckCircleOutline';
import DeleteIcon         from '@mui/icons-material/DeleteOutline';
import OpenInNewIcon      from '@mui/icons-material/OpenInNew';
import CalendarTodayIcon  from '@mui/icons-material/CalendarToday';
import LocationOnIcon     from '@mui/icons-material/LocationOn';
import GroupIcon          from '@mui/icons-material/Group';

// ── API ───────────────────────────────────────────────────────────────────────

function eventsApiBase(): string {
  const { hostname, port, protocol, origin } = window.location;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  if (isLocal && ['4004', '4005'].includes(port)) return `${origin}/api/events`;
  if (isLocal && port !== '8080' && port !== '80')
    return `${protocol}//${hostname}:8080/api/events`;
  return `${origin}/api/events`;
}

async function eventsApiFetch<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${eventsApiBase()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Category { id: string; name: string; color_hex: string | null }

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
}

interface EventListResponse {
  events: EventItem[];
  total: number;
  total_pages: number;
}

interface CreateBody {
  title: string;
  description: string;
  venue: string;
  start_time: string;
  end_time: string;
  capacity: string;
  ticket_price: string;
  price_currency: string;
  is_free: boolean;
  category_id: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { label: string; color: 'default' | 'warning' | 'success' | 'error' | 'info' }> = {
  draft:     { label: 'Draft',     color: 'default'  },
  published: { label: 'Published', color: 'success'  },
  cancelled: { label: 'Cancelled', color: 'error'    },
  completed: { label: 'Completed', color: 'info'     },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function toLocalDT(iso: string) {
  // convert ISO to datetime-local input format
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Sub-page navigation cards ─────────────────────────────────────────────────

const SUB_PAGES = [
  { path: 'finance',       label: 'Finance & Expenses',      icon: '💰', color: '#10b981' },
  { path: 'complimentary', label: 'Complimentary Tickets',   icon: '🎟', color: '#6366f1' },
  { path: 'vendors',       label: 'Vendor Management',       icon: '🏪', color: '#f59e0b' },
  { path: 'tickets',       label: 'Ticket Types',            icon: '🎫', color: '#0ea5e9' },
  { path: 'tokens',        label: 'Free Tokens',             icon: '🔑', color: '#8b5cf6' },
  { path: 'revenue',       label: 'Revenue Distribution',    icon: '📊', color: '#ec4899' },
];

// ── Create / Edit form ────────────────────────────────────────────────────────

function EventForm({
  open,
  token,
  categories,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  token: string;
  categories: Category[];
  initial?: EventItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CreateBody>({
    title:          initial?.title          ?? '',
    description:    initial?.description    ?? '',
    venue:          initial?.venue          ?? '',
    start_time:     initial?.start_time     ? toLocalDT(initial.start_time) : '',
    end_time:       initial?.end_time       ? toLocalDT(initial.end_time)   : '',
    capacity:       initial?.capacity       != null ? String(initial.capacity) : '',
    ticket_price:   initial?.ticket_price   != null ? String(initial.ticket_price) : '0',
    price_currency: initial?.price_currency ?? 'INR',
    is_free:        initial?.is_free        ?? true,
    category_id:    initial?.category_id    ?? '',
  });
  const [saving, setSaving]   = useState(false);
  const [error,  setError]    = useState<string | null>(null);

  const set = (k: keyof CreateBody, v: string | boolean) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setError(null);
    if (!form.title || !form.venue || !form.start_time || !form.end_time) {
      setError('Title, venue, and dates are required.');
      return;
    }
    setSaving(true);
    try {
      const body = {
        title:          form.title,
        description:    form.description || null,
        venue:          form.venue,
        start_time:     new Date(form.start_time).toISOString(),
        end_time:       new Date(form.end_time).toISOString(),
        capacity:       form.capacity ? Number(form.capacity) : null,
        ticket_price:   Number(form.ticket_price || 0),
        price_currency: form.price_currency,
        is_free:        form.is_free,
        category_id:    form.category_id || null,
      };
      if (initial) {
        await eventsApiFetch(`/events/${initial.id}`, token, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await eventsApiFetch('/events', token, { method: 'POST', body: JSON.stringify(body) });
      }
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>
        {initial ? `Edit — ${initial.title}` : 'Create New Event'}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField label="Title *" size="small" fullWidth value={form.title}
            onChange={e => set('title', e.target.value)} />

          <TextField label="Description" size="small" fullWidth multiline rows={3}
            value={form.description} onChange={e => set('description', e.target.value)} />

          <TextField label="Venue *" size="small" fullWidth value={form.venue}
            onChange={e => set('venue', e.target.value)} />

          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField label="Start Date & Time *" type="datetime-local" size="small" fullWidth
                InputLabelProps={{ shrink: true }} value={form.start_time}
                onChange={e => set('start_time', e.target.value)} />
            </Grid>
            <Grid item xs={6}>
              <TextField label="End Date & Time *" type="datetime-local" size="small" fullWidth
                InputLabelProps={{ shrink: true }} value={form.end_time}
                onChange={e => set('end_time', e.target.value)} />
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField label="Capacity (blank = unlimited)" type="number" size="small" fullWidth
                value={form.capacity} onChange={e => set('capacity', e.target.value)} />
            </Grid>
            <Grid item xs={6}>
              <TextField label="Category" select size="small" fullWidth value={form.category_id}
                onChange={e => set('category_id', e.target.value)}>
                <MenuItem value=""><em>None</em></MenuItem>
                {categories.map(c => (
                  <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>

          <Grid container spacing={2} alignItems="center">
            <Grid item xs={4}>
              <TextField label="Free event?" select size="small" fullWidth
                value={form.is_free ? 'true' : 'false'}
                onChange={e => {
                  const free = e.target.value === 'true';
                  set('is_free', free);
                  if (free) set('ticket_price', '0');
                }}>
                <MenuItem value="true">Free</MenuItem>
                <MenuItem value="false">Paid</MenuItem>
              </TextField>
            </Grid>
            {!form.is_free && (
              <>
                <Grid item xs={4}>
                  <TextField label="Ticket Price" type="number" size="small" fullWidth
                    value={form.ticket_price} onChange={e => set('ticket_price', e.target.value)} />
                </Grid>
                <Grid item xs={4}>
                  <TextField label="Currency" select size="small" fullWidth
                    value={form.price_currency} onChange={e => set('price_currency', e.target.value)}>
                    {['INR', 'USD', 'GBP', 'EUR', 'SGD', 'AED'].map(c => (
                      <MenuItem key={c} value={c}>{c}</MenuItem>
                    ))}
                  </TextField>
                </Grid>
              </>
            )}
          </Grid>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}
          startIcon={saving ? <CircularProgress size={14} /> : null}>
          {initial ? 'Save Changes' : 'Create Draft'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  token: string | null;
  id?: string;
}

export function ManageEvents({ token, id }: Props) {
  const [events,     setEvents]     = useState<EventItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [formOpen,   setFormOpen]   = useState(id === 'new');
  const [editTarget, setEditTarget] = useState<EventItem | undefined>(undefined);
  const [actionMsg,  setActionMsg]  = useState<string | null>(null);
  const [confirm,    setConfirm]    = useState<{ label: string; action: () => Promise<void> } | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const base = eventsApiBase();
      const [evRes, catRes] = await Promise.all([
        fetch(`${base}/events?status=&limit=50&sort=date_desc`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${base}/categories`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (!evRes.ok) throw new Error(`Events HTTP ${evRes.status}`);
      const evData: EventListResponse = await evRes.json();
      setEvents(evData.events);

      if (catRes.ok) {
        const catData: Category[] = await catRes.json();
        setCategories(catData);
      }
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const action = (label: string, fn: () => Promise<void>) =>
    setConfirm({ label, action: fn });

  const publish  = (e: EventItem) => action(`Publish "${e.title}"?`, async () => {
    await eventsApiFetch(`/events/${e.id}/publish`, token!, { method: 'PATCH' });
    setActionMsg(`"${e.title}" published.`);
    void load();
  });

  const cancel = (e: EventItem) => action(`Cancel "${e.title}"? This will close registrations.`, async () => {
    await eventsApiFetch(`/events/${e.id}/cancel`, token!, { method: 'PATCH' });
    setActionMsg(`"${e.title}" cancelled.`);
    void load();
  });

  const complete = (e: EventItem) => action(`Mark "${e.title}" as completed?`, async () => {
    await eventsApiFetch(`/events/${e.id}/complete`, token!, { method: 'PATCH' });
    setActionMsg(`"${e.title}" marked completed.`);
    void load();
  });

  const remove = (e: EventItem) => action(`Delete draft "${e.title}"? This cannot be undone.`, async () => {
    await eventsApiFetch(`/events/${e.id}`, token!, { method: 'DELETE' });
    setActionMsg(`"${e.title}" deleted.`);
    void load();
  });

  const openEdit = (e: EventItem) => { setEditTarget(e); setFormOpen(true); };

  const handleFormClose = () => { setFormOpen(false); setEditTarget(undefined); };
  const handleFormSaved = () => { setActionMsg('Event saved.'); void load(); };

  if (!token) {
    return (
      <Container maxWidth="md" sx={{ pt: 6 }}>
        <Alert severity="warning">You must be logged in to manage events.</Alert>
      </Container>
    );
  }

  return (
    <Box component="main" sx={{ bgcolor: '#f8fafc', minHeight: 'calc(100vh - 64px)' }}>
      {/* Header bar */}
      <Box sx={{ bgcolor: '#fff', borderBottom: '1px solid', borderColor: 'divider', px: 3, py: 2.5 }}>
        <Container maxWidth="lg">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h5" fontWeight={800}>Manage Events</Typography>
              <Typography fontSize={13} color="text.secondary" mt={0.25}>
                Create, publish, and manage all society events
              </Typography>
            </Box>
            <Button variant="contained" startIcon={<AddIcon />}
              onClick={() => { setEditTarget(undefined); setFormOpen(true); }}>
              New Event
            </Button>
          </Box>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 4 }}>

        {/* Sub-page navigation */}
        <Box sx={{ mb: 4 }}>
          <Typography fontSize={12} fontWeight={700} color="text.secondary"
            textTransform="uppercase" letterSpacing={0.5} mb={1.5}>
            Management Tools
          </Typography>
          <Grid container spacing={1.5}>
            {SUB_PAGES.map(sp => (
              <Grid item xs={6} sm={4} md={2} key={sp.path}>
                <Card variant="outlined" sx={{ borderRadius: 2, cursor: 'pointer',
                  transition: 'box-shadow .15s, transform .15s',
                  '&:hover': { boxShadow: 3, transform: 'translateY(-2px)' } }}
                  onClick={() => { window.location.href = `/manage/${sp.path}`; }}>
                  <CardContent sx={{ p: 1.5, textAlign: 'center', '&:last-child': { pb: 1.5 } }}>
                    <Typography fontSize={24} lineHeight={1.2}>{sp.icon}</Typography>
                    <Typography fontSize={11} fontWeight={600} color="text.secondary" mt={0.5} lineHeight={1.3}>
                      {sp.label}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>

        {/* Messages */}
        {actionMsg && (
          <Alert severity="success" onClose={() => setActionMsg(null)} sx={{ mb: 2 }}>
            {actionMsg}
          </Alert>
        )}
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}
            action={<Button size="small" onClick={() => void load()}>Retry</Button>}>
            {error}
          </Alert>
        )}

        {/* Event table */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : events.length === 0 ? (
          <Paper variant="outlined" sx={{ borderRadius: 2, p: 6, textAlign: 'center' }}>
            <Typography fontSize={40}>📅</Typography>
            <Typography variant="h6" mt={1}>No events yet</Typography>
            <Typography color="text.secondary" fontSize={14} mb={2}>
              Create your first event to get started.
            </Typography>
            <Button variant="contained" startIcon={<AddIcon />}
              onClick={() => { setEditTarget(undefined); setFormOpen(true); }}>
              Create Event
            </Button>
          </Paper>
        ) : (
          <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: '#f8fafc' }}>
                  {['Event', 'Category', 'Date', 'Registrations', 'Status', 'Actions'].map(h => (
                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'text.secondary', py: 1.5 }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {events.map(ev => {
                  const ss = STATUS_STYLE[ev.status] ?? { label: ev.status, color: 'default' as const };
                  return (
                    <TableRow key={ev.id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                      {/* Title + venue */}
                      <TableCell sx={{ maxWidth: 260 }}>
                        <Typography fontWeight={700} fontSize={14} noWrap>{ev.title}</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                          <LocationOnIcon sx={{ fontSize: 11, color: 'text.secondary' }} />
                          <Typography fontSize={12} color="text.secondary" noWrap>{ev.venue}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <GroupIcon sx={{ fontSize: 11, color: 'text.secondary' }} />
                          <Typography fontSize={12} color="text.secondary">
                            By {ev.organizer_name}
                          </Typography>
                        </Box>
                      </TableCell>

                      {/* Category */}
                      <TableCell>
                        {ev.category_name ? (
                          <Chip label={ev.category_name} size="small"
                            sx={{ bgcolor: ev.category_color ? `${ev.category_color}22` : '#f1f5f9',
                                  color: ev.category_color ?? '#475569', fontWeight: 600, fontSize: 11 }} />
                        ) : (
                          <Typography fontSize={12} color="text.secondary">—</Typography>
                        )}
                      </TableCell>

                      {/* Date */}
                      <TableCell sx={{ minWidth: 160 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <CalendarTodayIcon sx={{ fontSize: 12, color: 'text.secondary' }} />
                          <Typography fontSize={12}>{fmtDate(ev.start_time)}</Typography>
                        </Box>
                      </TableCell>

                      {/* Registrations */}
                      <TableCell>
                        <Typography fontWeight={700} fontSize={14}>{ev.confirmed_tickets}</Typography>
                        <Typography fontSize={11} color="text.secondary">
                          {ev.capacity ? `/ ${ev.capacity} capacity` : 'unlimited'}
                        </Typography>
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <Chip label={ss.label} color={ss.color} size="small"
                          sx={{ fontWeight: 700, fontSize: 11 }} />
                        {ev.is_sold_out && (
                          <Typography fontSize={10} color="error.main" mt={0.25}>Sold out</Typography>
                        )}
                      </TableCell>

                      {/* Actions */}
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Stack direction="row" spacing={0.5}>
                          {ev.status === 'draft' && (
                            <>
                              <Tooltip title="Edit draft">
                                <IconButton size="small" color="primary" onClick={() => openEdit(ev)}>
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Publish event">
                                <IconButton size="small" color="success" onClick={() => publish(ev)}>
                                  <PublishIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete draft">
                                <IconButton size="small" color="error" onClick={() => remove(ev)}>
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </>
                          )}
                          {ev.status === 'published' && (
                            <>
                              <Tooltip title="Edit event">
                                <IconButton size="small" color="primary" onClick={() => openEdit(ev)}>
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Mark as completed">
                                <IconButton size="small" color="info" onClick={() => complete(ev)}>
                                  <CheckCircleIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Cancel event">
                                <IconButton size="small" color="error" onClick={() => cancel(ev)}>
                                  <CancelIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </>
                          )}
                          <Tooltip title="Open in events MFE">
                            <IconButton size="small" onClick={() => window.open(`/events`, '_blank')}>
                              <OpenInNewIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Paper>
        )}
      </Container>

      {/* Create / Edit dialog */}
      {formOpen && (
        <EventForm
          open={formOpen}
          token={token}
          categories={categories}
          initial={editTarget}
          onClose={handleFormClose}
          onSaved={handleFormSaved}
        />
      )}

      {/* Confirm dialog */}
      {confirm && (
        <ConfirmDialog
          message={confirm.label}
          onConfirm={async () => {
            try {
              await confirm.action();
            } catch (e: unknown) {
              setError((e as Error).message);
            } finally {
              setConfirm(null);
            }
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </Box>
  );
}

// ── Confirm dialog ────────────────────────────────────────────────────────────

function ConfirmDialog({ message, onConfirm, onCancel }: {
  message: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Confirm</DialogTitle>
      <DialogContent>
        <Typography>{message}</Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant="contained" color="error" disabled={busy}
          startIcon={busy ? <CircularProgress size={14} /> : null}
          onClick={async () => { setBusy(true); await onConfirm(); }}>
          Confirm
        </Button>
      </DialogActions>
    </Dialog>
  );
}
