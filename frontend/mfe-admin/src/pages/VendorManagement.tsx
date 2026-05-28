import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Chip,
  Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, MenuItem, Paper, Stack, Table, TableBody,
  TableCell, TableFooter, TableHead, TableRow,
  TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import StorefrontIcon from '@mui/icons-material/Storefront';

type FeeType = 'fixed' | 'revenue_share' | 'free';
type VendorStatus = 'invited' | 'confirmed' | 'cancelled';
type VendorCategory = 'food' | 'beverages' | 'merchandise' | 'games' | 'services' | 'other';

interface EventVendor {
  id: string;
  name: string;
  email: string;
  category: VendorCategory;
  stallNumber: string;
  feeType: FeeType;
  fixedFee: number;
  revSharePct: number;
  actualRevenue: number | null;
  status: VendorStatus;
  notes: string;
}

const INITIAL_VENDORS: EventVendor[] = [
  { id: 'v1', name: 'Raj Sweets & Snacks', email: 'rajan@rajsweets.in', category: 'food',        stallNumber: 'A-01', feeType: 'revenue_share', fixedFee: 0,    revSharePct: 15, actualRevenue: 20000, status: 'confirmed', notes: 'Sweets and snacks stall near main entrance' },
  { id: 'v2', name: 'Fun Games Zone',       email: 'deepak@fungames.in',  category: 'games',       stallNumber: 'B-03', feeType: 'fixed',          fixedFee: 2000, revSharePct: 0,  actualRevenue: null,  status: 'confirmed', notes: 'Games stall for kids and adults' },
  { id: 'v3', name: 'Sparkle Merchandise', email: 'sunita@sparklemerch.in', category: 'merchandise', stallNumber: 'C-02', feeType: 'revenue_share', fixedFee: 0,    revSharePct: 20, actualRevenue: 9500,  status: 'confirmed', notes: 'Diwali-themed gifts and decorative items' },
];

const FEE_TYPE_LABEL: Record<FeeType, string> = {
  fixed:          'Fixed Fee',
  revenue_share:  'Revenue Share',
  free:           'Free',
};

const CATEGORY_COLOR: Record<VendorCategory, 'warning' | 'success' | 'error' | 'primary' | 'secondary' | 'default'> = {
  food:        'warning',
  beverages:   'primary',
  merchandise: 'secondary',
  games:       'success',
  services:    'default',
  other:       'default',
};

const STATUS_COLOR: Record<VendorStatus, 'success' | 'warning' | 'error'> = {
  confirmed: 'success',
  invited:   'warning',
  cancelled: 'error',
};

const CATEGORIES: VendorCategory[] = ['food', 'beverages', 'merchandise', 'games', 'services', 'other'];

function poolContribution(v: EventVendor): number {
  if (v.feeType === 'fixed')          return v.fixedFee;
  if (v.feeType === 'revenue_share')  return v.actualRevenue ? (v.actualRevenue * v.revSharePct) / 100 : 0;
  return 0;
}

export function VendorManagement() {
  const { id: eventId } = useParams();
  const [vendors, setVendors] = useState<EventVendor[]>(INITIAL_VENDORS);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '', email: '', category: 'food' as VendorCategory,
    stallNumber: '', feeType: 'fixed' as FeeType,
    fixedFee: '', revSharePct: '', notes: '',
  });

  const totalPool    = vendors.filter(v => v.status !== 'cancelled').reduce((s, v) => s + poolContribution(v), 0);
  const totalSales   = vendors.reduce((s, v) => s + (v.actualRevenue ?? 0), 0);
  const confirmed    = vendors.filter(v => v.status === 'confirmed').length;

  const handleAdd = () => {
    if (!form.name) return;
    setVendors(prev => [...prev, {
      id: `new-${Date.now()}`, name: form.name, email: form.email,
      category: form.category, stallNumber: form.stallNumber,
      feeType: form.feeType, fixedFee: Number(form.fixedFee) || 0,
      revSharePct: Number(form.revSharePct) || 0, actualRevenue: null,
      status: 'invited', notes: form.notes,
    }]);
    setAddOpen(false);
    setForm({ name: '', email: '', category: 'food', stallNumber: '', feeType: 'fixed', fixedFee: '', revSharePct: '', notes: '' });
  };

  const handleDelete = () => {
    if (!deleteId) return;
    setVendors(prev => prev.filter(v => v.id !== deleteId));
    setDeleteId(null);
  };

  const stats = [
    { label: 'Invited',       value: vendors.length,                    color: '#6366f1' },
    { label: 'Confirmed',     value: confirmed,                          color: '#10b981' },
    { label: 'Revenue Pool',  value: `₹${totalPool.toLocaleString()}`,   color: '#6366f1' },
    { label: 'Vendor Sales',  value: `₹${totalSales.toLocaleString()}`,  color: '#f59e0b' },
  ];

  return (
    <Box component="main" sx={{ p: { xs: 2, md: 4 } }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        <Link to="/manage" style={{ color: 'inherit' }}>Manage</Link> → Diwali Mela 2025 → Vendors
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
        <StorefrontIcon sx={{ color: '#6366f1', fontSize: 28 }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={800}>Vendor Stalls</Typography>
          <Typography variant="body2" color="text.secondary">Invite shops and assign fee arrangements for this event.</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
          Invite Vendor
        </Button>
      </Box>

      <Grid container spacing={2.5} sx={{ mb: 4 }}>
        {stats.map((s) => (
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

      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', mb: 4 }}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: '#f8fafc' }}>
              {['Vendor', 'Category', 'Stall', 'Fee Type', 'Fee / Share', 'Actual Revenue', 'Pool Contribution', 'Status', 'Actions'].map(h => (
                <TableCell key={h} sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'text.secondary', letterSpacing: 0.4 }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {vendors.map((v) => (
              <TableRow key={v.id} hover>
                <TableCell>
                  <Typography fontWeight={700} fontSize={14}>{v.name}</Typography>
                  <Typography fontSize={12} color="text.secondary">{v.email}</Typography>
                </TableCell>
                <TableCell>
                  <Chip label={v.category} size="small" color={CATEGORY_COLOR[v.category]} sx={{ textTransform: 'capitalize', fontSize: 11, fontWeight: 700 }} />
                </TableCell>
                <TableCell><Typography fontSize={13}>{v.stallNumber || '—'}</Typography></TableCell>
                <TableCell><Chip label={FEE_TYPE_LABEL[v.feeType]} size="small" variant="outlined" sx={{ fontSize: 11 }} /></TableCell>
                <TableCell>
                  {v.feeType === 'fixed'          && <Typography fontSize={13}>₹{v.fixedFee.toLocaleString()}</Typography>}
                  {v.feeType === 'revenue_share'  && <Typography fontSize={13}>{v.revSharePct}%</Typography>}
                  {v.feeType === 'free'           && <Typography fontSize={13} color="text.secondary">—</Typography>}
                </TableCell>
                <TableCell>
                  <Typography fontSize={13}>{v.actualRevenue != null ? `₹${v.actualRevenue.toLocaleString()}` : '—'}</Typography>
                </TableCell>
                <TableCell>
                  <Typography fontWeight={700} fontSize={13} color="success.main">
                    ₹{poolContribution(v).toLocaleString()}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip label={v.status} size="small" color={STATUS_COLOR[v.status]} sx={{ fontWeight: 700, textTransform: 'capitalize' }} />
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={1}>
                    <Button size="small" variant="outlined" startIcon={<EditIcon />}>Edit</Button>
                    <Button size="small" variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => setDeleteId(v.id)}>Remove</Button>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow sx={{ bgcolor: '#f8fafc' }}>
              <TableCell colSpan={6} align="right" sx={{ color: 'text.secondary', fontSize: 12 }}>Total pool collected</TableCell>
              <TableCell sx={{ fontWeight: 700, color: '#6366f1' }}>₹{totalPool.toLocaleString()}</TableCell>
              <TableCell colSpan={2} />
            </TableRow>
          </TableFooter>
        </Table>
      </Paper>

      {/* Invite dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle fontWeight={700}>Invite a Vendor</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ pt: 1 }}>
            <Grid item xs={8}>
              <TextField label="Vendor Name *" fullWidth size="small" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </Grid>
            <Grid item xs={4}>
              <TextField label="Category" fullWidth size="small" select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as VendorCategory }))}>
                {CATEGORIES.map(c => <MenuItem key={c} value={c} sx={{ textTransform: 'capitalize' }}>{c}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={6}>
              <TextField label="Contact Email" type="email" fullWidth size="small" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </Grid>
            <Grid item xs={6}>
              <TextField label="Stall Number" fullWidth size="small" value={form.stallNumber} onChange={e => setForm(f => ({ ...f, stallNumber: e.target.value }))} placeholder="e.g. D-04" />
            </Grid>
            <Grid item xs={4}>
              <TextField label="Fee Type" fullWidth size="small" select value={form.feeType} onChange={e => setForm(f => ({ ...f, feeType: e.target.value as FeeType }))}>
                <MenuItem value="fixed">Fixed Fee</MenuItem>
                <MenuItem value="revenue_share">Revenue Share %</MenuItem>
                <MenuItem value="free">Free (No Fee)</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={4}>
              <TextField label="Fixed Fee (₹)" type="number" fullWidth size="small" value={form.fixedFee} onChange={e => setForm(f => ({ ...f, fixedFee: e.target.value }))} disabled={form.feeType !== 'fixed'} />
            </Grid>
            <Grid item xs={4}>
              <TextField label="Revenue Share %" type="number" fullWidth size="small" value={form.revSharePct} onChange={e => setForm(f => ({ ...f, revSharePct: e.target.value }))} disabled={form.feeType !== 'revenue_share'} />
            </Grid>
            <Grid item xs={12}>
              <TextField label="Notes" multiline rows={2} fullWidth size="small" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" startIcon={<AddIcon />} disabled={!form.name} onClick={handleAdd}>Send Invite</Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)} maxWidth="xs" fullWidth>
        <DialogTitle fontWeight={700}>Remove Vendor</DialogTitle>
        <DialogContent dividers>
          <Alert severity="warning" sx={{ borderRadius: 1.5 }}>
            This will remove the vendor from this event. The vendor record itself is not deleted.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button variant="contained" color="error" startIcon={<DeleteIcon />} onClick={handleDelete}>Remove</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
