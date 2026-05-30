import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Grid, IconButton, Paper, Stack, Switch,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon           from '@mui/icons-material/Add';
import EditIcon          from '@mui/icons-material/Edit';
import DeleteIcon        from '@mui/icons-material/Delete';
import ArrowUpwardIcon   from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import LocalActivityIcon from '@mui/icons-material/LocalActivity';
import ArrowBackIcon     from '@mui/icons-material/ArrowBack';

// ── API ───────────────────────────────────────────────────────────────────────

function eventsApiBase(): string {
  const { hostname, port, protocol, origin } = window.location;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  if (isLocal && ['4004', '4005'].includes(port)) return `${origin}/api/events`;
  if (isLocal && port !== '8080' && port !== '80')
    return `${protocol}//${hostname}:8080/api/events`;
  return `${origin}/api/events`;
}

async function apiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${eventsApiBase()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  const ct = res.headers.get('content-type') ?? '';
  if (!res.ok) {
    if (ct.includes('application/json')) {
      const b = await res.json().catch(() => ({}));
      throw new Error((b as { detail?: string }).detail ?? `HTTP ${res.status}`);
    }
    throw new Error(`HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface TicketType {
  id: string; name: string; description: string | null;
  price: number; is_free: boolean; capacity: number | null;
  sort_order: number; is_active: boolean;
}

const EMPTY_FORM = { name: '', description: '', price: '', isFree: false, capacity: '', sortOrder: '', isActive: true };

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  token?: string | null;
  id?: string;  // event ID passed from ManageRoutes
}

export function TicketTypeSetup({ token, id: eventId }: Props) {
  const [types,    setTypes]    = useState<TicketType[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [addOpen,  setAddOpen]  = useState(false);
  const [editId,   setEditId]   = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [form,     setForm]     = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    if (!token || !eventId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<TicketType[]>(`/events/${eventId}/ticket-types`, token);
      setTypes(data);
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [token, eventId]);

  useEffect(() => { void load(); }, [load]);

  const openAdd = () => { setForm(EMPTY_FORM); setEditId(null); setAddOpen(true); };
  const openEdit = (t: TicketType) => {
    setForm({ name: t.name, description: t.description ?? '', price: String(t.price),
              isFree: t.is_free, capacity: t.capacity != null ? String(t.capacity) : '',
              sortOrder: String(t.sort_order), isActive: t.is_active });
    setEditId(t.id);
    setAddOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !token || !eventId) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        name:        form.name,
        description: form.description || null,
        price:       form.isFree ? 0 : Number(form.price) || 0,
        is_free:     form.isFree,
        capacity:    form.capacity ? Number(form.capacity) : null,
        sort_order:  Number(form.sortOrder) || 0,
        is_active:   form.isActive,
      };
      if (editId) {
        await apiFetch(`/events/${eventId}/ticket-types/${editId}`, token, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch(`/events/${eventId}/ticket-types`, token, { method: 'POST', body: JSON.stringify(body) });
      }
      setAddOpen(false);
      setEditId(null);
      void load();
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId || !token || !eventId) return;
    try {
      await apiFetch(`/events/${eventId}/ticket-types/${deleteId}`, token, { method: 'DELETE' });
      setDeleteId(null);
      void load();
    } catch (e: unknown) { setError((e as Error).message); }
  };

  const toggleActive = async (t: TicketType) => {
    if (!token || !eventId) return;
    try {
      await apiFetch(`/events/${eventId}/ticket-types/${t.id}`, token,
        { method: 'PUT', body: JSON.stringify({ is_active: !t.is_active }) });
      void load();
    } catch (e: unknown) { setError((e as Error).message); }
  };

  const reorder = async (t: TicketType, dir: 'up' | 'down') => {
    if (!token || !eventId) return;
    const sorted = [...types].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex(x => x.id === t.id);
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    try {
      await Promise.all([
        apiFetch(`/events/${eventId}/ticket-types/${t.id}`,     token, { method: 'PUT', body: JSON.stringify({ sort_order: other.sort_order }) }),
        apiFetch(`/events/${eventId}/ticket-types/${other.id}`, token, { method: 'PUT', body: JSON.stringify({ sort_order: t.sort_order }) }),
      ]);
      void load();
    } catch (e: unknown) { setError((e as Error).message); }
  };

  // ── No token ────────────────────────────────────────────────────────────────

  if (!token) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="warning">You must be logged in to manage ticket types.</Alert>
      </Box>
    );
  }

  // ── No event ID ─────────────────────────────────────────────────────────────

  if (!eventId) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="info" sx={{ mb: 2 }}>
          Navigate to this page from an event's edit dialog to manage its ticket types.
        </Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => { window.location.href = '/manage'; }}>
          Back to Manage Events
        </Button>
      </Box>
    );
  }

  const sorted       = [...types].sort((a, b) => a.sort_order - b.sort_order);
  const activeTypes  = types.filter(t => t.is_active).length;
  const paidTypes    = types.filter(t => !t.is_free && t.is_active).length;
  const freeTypes    = types.filter(t => t.is_free  && t.is_active).length;
  const cappedTypes  = types.filter(t => t.capacity != null).length;

  return (
    <Box component="main" sx={{ p: { xs: 2, md: 4 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Button size="small" startIcon={<ArrowBackIcon />} onClick={() => { window.location.href = '/manage'; }}>
          Manage Events
        </Button>
        <Typography fontSize={13} color="text.secondary">› Ticket Types</Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
        <LocalActivityIcon sx={{ color: '#6366f1', fontSize: 28 }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={800}>Ticket Types</Typography>
          <Typography variant="body2" color="text.secondary">
            Define ticket tiers — kids play area, lunch coupon, music pass, water games, etc.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>Add Type</Button>
      </Box>

      {error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>{error}</Alert>}

      {/* Stat cards */}
      <Grid container spacing={2.5} sx={{ mb: 4 }}>
        {[
          { label: 'Active Types', value: activeTypes, color: '#6366f1' },
          { label: 'Paid Types',   value: paidTypes,   color: '#10b981' },
          { label: 'Free Types',   value: freeTypes,   color: '#f59e0b' },
          { label: 'Capped',       value: cappedTypes, color: '#0f172a' },
        ].map(s => (
          <Grid item xs={6} md={3} key={s.label}>
            <Card variant="outlined" sx={{ borderRadius: 2 }}>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Typography fontSize={28} fontWeight={800} sx={{ color: s.color }}>{s.value}</Typography>
                <Typography fontSize={11} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, mt: 0.5 }}>{s.label}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {types.length === 0 && !loading && (
        <Alert severity="info" sx={{ mb: 3, borderRadius: 1.5 }}>
          No ticket types yet. Add types for sub-events: kids play area, lunch coupon, dinner pass, music area, water games, etc. Events without types use the single price from the event settings.
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : (
        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                {['Order', 'Name & Description', 'Price', 'Capacity', 'Active', 'Actions'].map(h => (
                  <TableCell key={h} sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'text.secondary', letterSpacing: 0.4 }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map((t, i) => (
                <TableRow key={t.id} hover sx={{ opacity: t.is_active ? 1 : 0.55, '&:last-child td': { borderBottom: 0 } }}>
                  <TableCell>
                    <Stack direction="row" spacing={0.25} alignItems="center">
                      <Typography fontWeight={600} fontSize={14} sx={{ minWidth: 24 }}>{t.sort_order}</Typography>
                      <Stack>
                        <Tooltip title="Move up"><span>
                          <IconButton size="small" disabled={i === 0} onClick={() => void reorder(t, 'up')} sx={{ p: 0.25 }}>
                            <ArrowUpwardIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </span></Tooltip>
                        <Tooltip title="Move down"><span>
                          <IconButton size="small" disabled={i === sorted.length - 1} onClick={() => void reorder(t, 'down')} sx={{ p: 0.25 }}>
                            <ArrowDownwardIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </span></Tooltip>
                      </Stack>
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ maxWidth: 240 }}>
                    <Typography fontWeight={700} fontSize={14}>{t.name}</Typography>
                    {t.description && <Typography fontSize={12} color="text.secondary">{t.description}</Typography>}
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={700} color={t.is_free ? 'success.main' : 'text.primary'}>
                      {t.is_free ? 'Free' : `₹${Number(t.price).toLocaleString('en-IN')}`}
                    </Typography>
                    <Chip label={t.is_free ? 'Free' : 'Paid'} size="small" color={t.is_free ? 'success' : 'default'} sx={{ fontWeight: 700, height: 18, fontSize: 10, mt: 0.5 }} />
                  </TableCell>
                  <TableCell>
                    <Typography fontSize={13}>{t.capacity != null ? t.capacity.toLocaleString() : '∞'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Switch size="small" checked={t.is_active} onChange={() => void toggleActive(t)} />
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1}>
                      <Button size="small" variant="outlined" startIcon={<EditIcon />} onClick={() => openEdit(t)}>Edit</Button>
                      <Button size="small" variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => setDeleteId(t.id)}>Delete</Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle fontWeight={700}>{editId ? 'Edit Ticket Type' : 'Add Ticket Type'}</DialogTitle>
        <DialogContent dividers>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Grid container spacing={2} sx={{ pt: 1 }}>
            <Grid item xs={8}>
              <TextField label="Name *" fullWidth size="small" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Kids Play Area, Lunch Coupon, Water Games Pass…" />
            </Grid>
            <Grid item xs={4}>
              <TextField label="Sort Order" type="number" fullWidth size="small"
                value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))} />
            </Grid>
            <Grid item xs={12}>
              <TextField label="Description" multiline rows={2} fullWidth size="small"
                value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="What does this ticket include?" />
            </Grid>
            <Grid item xs={4}>
              <TextField label="Capacity (blank = ∞)" type="number" fullWidth size="small"
                value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} />
            </Grid>
            <Grid item xs={4}>
              <TextField label="Price (₹)" type="number" fullWidth size="small"
                value={form.price} disabled={form.isFree}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
            </Grid>
            <Grid item xs={4} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, justifyContent: 'center' }}>
              <FormControlLabel
                control={<Switch checked={form.isFree}
                  onChange={e => setForm(f => ({ ...f, isFree: e.target.checked, price: e.target.checked ? '0' : f.price }))} />}
                label={<Typography fontSize={13} fontWeight={600}>Free Ticket</Typography>}
              />
              <FormControlLabel
                control={<Switch checked={form.isActive}
                  onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />}
                label={<Typography fontSize={13} fontWeight={600}>Active</Typography>}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!form.name || saving}
            startIcon={saving ? <CircularProgress size={14} /> : null}
            onClick={() => void handleSave()}>
            {editId ? 'Save Changes' : 'Add Ticket Type'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)} maxWidth="xs" fullWidth>
        <DialogTitle fontWeight={700}>Delete Ticket Type</DialogTitle>
        <DialogContent dividers>
          <Alert severity="error" sx={{ borderRadius: 1.5 }}>
            Deleting a ticket type will remove it from the event. Existing registrations linked to this type will lose the reference.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button variant="contained" color="error" startIcon={<DeleteIcon />}
            onClick={() => void handleDelete()}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
