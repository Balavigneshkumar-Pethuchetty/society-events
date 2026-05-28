import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Chip,
  Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Grid, Paper, Stack, Switch, Table,
  TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import LocalActivityIcon from '@mui/icons-material/LocalActivity';

interface TicketType {
  id: string;
  name: string;
  description: string;
  price: number;
  isFree: boolean;
  capacity: number | null;
  sortOrder: number;
  isActive: boolean;
}

const INITIAL_TYPES: TicketType[] = [
  { id: 't1', name: 'Participant', description: 'Register as a player in any category (includes kit + refreshments)', price: 150, isFree: false, capacity: null, sortOrder: 1, isActive: true },
  { id: 't2', name: 'Spectator',   description: 'Entry to watch all events from spectator stands',                     price: 50,  isFree: false, capacity: null, sortOrder: 2, isActive: true },
  { id: 't3', name: 'Kids Zone',   description: 'Kids 5-12 years — mini-games and activity corner',                    price: 75,  isFree: false, capacity: 80,   sortOrder: 3, isActive: true },
];

const EMPTY_FORM = { name: '', description: '', price: '', isFree: false, capacity: '', sortOrder: '', isActive: true };

export function TicketTypeSetup() {
  const { id: eventId } = useParams();
  const [types, setTypes]     = useState<TicketType[]>(INITIAL_TYPES);
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId]   = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm]       = useState(EMPTY_FORM);

  const openAdd = () => { setForm(EMPTY_FORM); setEditId(null); setAddOpen(true); };
  const openEdit = (t: TicketType) => {
    setForm({ name: t.name, description: t.description, price: String(t.price), isFree: t.isFree, capacity: t.capacity != null ? String(t.capacity) : '', sortOrder: String(t.sortOrder), isActive: t.isActive });
    setEditId(t.id);
    setAddOpen(true);
  };

  const handleSave = () => {
    if (!form.name) return;
    const next: TicketType = {
      id: editId ?? `new-${Date.now()}`,
      name: form.name, description: form.description,
      price: form.isFree ? 0 : Number(form.price) || 0,
      isFree: form.isFree,
      capacity: form.capacity ? Number(form.capacity) : null,
      sortOrder: Number(form.sortOrder) || types.length + 1,
      isActive: form.isActive,
    };
    setTypes(prev => editId
      ? prev.map(t => t.id === editId ? next : t)
      : [...prev, next]);
    setAddOpen(false);
    setEditId(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    setTypes(prev => prev.filter(t => t.id !== deleteId));
    setDeleteId(null);
  };

  const activeTypes  = types.filter(t => t.isActive).length;
  const paidTypes    = types.filter(t => !t.isFree && t.isActive).length;
  const freeTypes    = types.filter(t => t.isFree  && t.isActive).length;
  const cappedTypes  = types.filter(t => t.capacity != null).length;

  return (
    <Box component="main" sx={{ p: { xs: 2, md: 4 } }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        <Link to="/manage" style={{ color: 'inherit' }}>Manage</Link> → Annual Sports Day 2026 → Ticket Types
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
        <LocalActivityIcon sx={{ color: '#6366f1', fontSize: 28 }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={800}>Ticket Types</Typography>
          <Typography variant="body2" color="text.secondary">Define ticket tiers for this event. Residents select from these when registering.</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>Add Type</Button>
      </Box>

      <Grid container spacing={2.5} sx={{ mb: 4 }}>
        {[
          { label: 'Ticket Types', value: activeTypes,  color: '#6366f1' },
          { label: 'Paid Types',   value: paidTypes,    color: '#10b981' },
          { label: 'Free Types',   value: freeTypes,    color: '#f59e0b' },
          { label: 'Capped',       value: cappedTypes,  color: '#0f172a' },
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

      {types.length === 0 && (
        <Alert severity="info" sx={{ mb: 3, borderRadius: 1.5 }}>
          No ticket types defined yet. Events without ticket types fall back to the single-price setup on the event form.
        </Alert>
      )}

      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: '#f8fafc' }}>
              {['Order', 'Name', 'Description', 'Price', 'Free?', 'Capacity', 'Active', 'Actions'].map(h => (
                <TableCell key={h} sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'text.secondary', letterSpacing: 0.4 }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {[...types].sort((a, b) => a.sortOrder - b.sortOrder).map((t) => (
              <TableRow key={t.id} hover sx={{ opacity: t.isActive ? 1 : 0.5 }}>
                <TableCell><Typography fontWeight={600}>{t.sortOrder}</Typography></TableCell>
                <TableCell><Typography fontWeight={700} fontSize={14}>{t.name}</Typography></TableCell>
                <TableCell sx={{ maxWidth: 240 }}><Typography fontSize={12} color="text.secondary">{t.description}</Typography></TableCell>
                <TableCell>
                  <Typography fontWeight={700} color={t.isFree ? 'success.main' : 'text.primary'}>
                    {t.isFree ? 'Free' : `₹${t.price}`}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip label={t.isFree ? 'Yes' : 'No'} size="small" color={t.isFree ? 'success' : 'default'} sx={{ fontWeight: 700 }} />
                </TableCell>
                <TableCell>
                  <Typography fontSize={13}>{t.capacity != null ? t.capacity : '∞'}</Typography>
                </TableCell>
                <TableCell>
                  <Chip label={t.isActive ? 'Active' : 'Inactive'} size="small" color={t.isActive ? 'success' : 'default'} sx={{ fontWeight: 700 }} />
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

      {/* Add / Edit dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle fontWeight={700}>{editId ? 'Edit Ticket Type' : 'Add Ticket Type'}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ pt: 1 }}>
            <Grid item xs={8}>
              <TextField label="Name *" fullWidth size="small" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Dinner Pass, Games Bundle…" />
            </Grid>
            <Grid item xs={4}>
              <TextField label="Price (₹)" type="number" fullWidth size="small" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} disabled={form.isFree} />
            </Grid>
            <Grid item xs={12}>
              <TextField label="Description" multiline rows={2} fullWidth size="small" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What does this ticket include?" />
            </Grid>
            <Grid item xs={4}>
              <TextField label="Capacity (blank = ∞)" type="number" fullWidth size="small" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} />
            </Grid>
            <Grid item xs={4}>
              <TextField label="Sort Order" type="number" fullWidth size="small" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))} />
            </Grid>
            <Grid item xs={4} sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1 }}>
              <FormControlLabel
                control={<Switch checked={form.isFree}    onChange={e => setForm(f => ({ ...f, isFree:    e.target.checked, price: e.target.checked ? '0' : f.price }))} />}
                label={<Typography fontSize={13} fontWeight={600}>Free Ticket</Typography>}
              />
              <FormControlLabel
                control={<Switch checked={form.isActive}  onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />}
                label={<Typography fontSize={13} fontWeight={600}>Active</Typography>}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!form.name} onClick={handleSave}>{editId ? 'Save Changes' : 'Add Ticket Type'}</Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)} maxWidth="xs" fullWidth>
        <DialogTitle fontWeight={700}>Delete Ticket Type</DialogTitle>
        <DialogContent dividers>
          <Alert severity="error" sx={{ borderRadius: 1.5 }}>
            Deleting a ticket type will remove it from the event. Existing registration items linked to this type will lose their reference.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button variant="contained" color="error" startIcon={<DeleteIcon />} onClick={handleDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
