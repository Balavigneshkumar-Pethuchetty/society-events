import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Chip,
  Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  Grid, InputAdornment, MenuItem, Paper, Stack,
  Table, TableBody, TableCell, TableFooter, TableHead,
  TablePagination, TableRow, TableSortLabel,
  TextField, Typography,
} from '@mui/material';
import AddIcon     from '@mui/icons-material/Add';
import EditIcon    from '@mui/icons-material/Edit';
import DeleteIcon  from '@mui/icons-material/Delete';
import SearchIcon  from '@mui/icons-material/Search';
import StorefrontIcon from '@mui/icons-material/Storefront';

type FeeType      = 'fixed' | 'revenue_share' | 'free';
type VendorStatus = 'invited' | 'confirmed' | 'cancelled';
type VendorCategory = 'food' | 'beverages' | 'merchandise' | 'games' | 'services' | 'other';
type SortDir = 'asc' | 'desc';
type SortKey = 'name' | 'category' | 'status' | 'feeType' | 'stallNumber';

interface EventVendor {
  id: string; name: string; email: string;
  category: VendorCategory; stallNumber: string;
  feeType: FeeType; fixedFee: number; revSharePct: number;
  actualRevenue: number | null; status: VendorStatus; notes: string;
}

const INITIAL_VENDORS: EventVendor[] = [
  { id: 'v1', name: 'Raj Sweets & Snacks', email: 'rajan@rajsweets.in',     category: 'food',        stallNumber: 'A-01', feeType: 'revenue_share', fixedFee: 0,    revSharePct: 15, actualRevenue: 20000, status: 'confirmed', notes: '' },
  { id: 'v2', name: 'Fun Games Zone',       email: 'deepak@fungames.in',     category: 'games',       stallNumber: 'B-03', feeType: 'fixed',          fixedFee: 2000, revSharePct: 0,  actualRevenue: null,  status: 'confirmed', notes: '' },
  { id: 'v3', name: 'Sparkle Merchandise', email: 'sunita@sparklemerch.in', category: 'merchandise', stallNumber: 'C-02', feeType: 'revenue_share', fixedFee: 0,    revSharePct: 20, actualRevenue: 9500,  status: 'confirmed', notes: '' },
];

const FEE_TYPE_LABEL: Record<FeeType, string> = {
  fixed: 'Fixed Fee', revenue_share: 'Revenue Share', free: 'Free',
};

const CATEGORY_COLOR: Record<VendorCategory, 'warning' | 'success' | 'error' | 'primary' | 'secondary' | 'default'> = {
  food: 'warning', beverages: 'primary', merchandise: 'secondary',
  games: 'success', services: 'default', other: 'default',
};

const STATUS_COLOR: Record<VendorStatus, 'success' | 'warning' | 'error'> = {
  confirmed: 'success', invited: 'warning', cancelled: 'error',
};

const CATEGORIES: VendorCategory[] = ['food', 'beverages', 'merchandise', 'games', 'services', 'other'];

function poolContribution(v: EventVendor): number {
  if (v.feeType === 'fixed')         return v.fixedFee;
  if (v.feeType === 'revenue_share') return v.actualRevenue ? (v.actualRevenue * v.revSharePct) / 100 : 0;
  return 0;
}

function feeLabel(v: EventVendor): string {
  if (v.feeType === 'fixed')         return `₹${v.fixedFee.toLocaleString()}`;
  if (v.feeType === 'revenue_share') return `${v.revSharePct}%`;
  return '—';
}

export function VendorManagement() {
  useParams(); // eventId available if needed
  const [vendors,  setVendors]  = useState<EventVendor[]>(INITIAL_VENDORS);
  const [addOpen,  setAddOpen]  = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [search,         setSearch]         = useState('');
  const [categoryFilter, setCategoryFilter] = useState<VendorCategory | ''>('');
  const [statusFilter,   setStatusFilter]   = useState<VendorStatus | ''>('');
  const [sortKey,        setSortKey]        = useState<SortKey>('name');
  const [sortDir,        setSortDir]        = useState<SortDir>('asc');
  const [page,           setPage]           = useState(0);
  const [rpp,            setRpp]            = useState(10);

  const [form, setForm] = useState({
    name: '', email: '', category: 'food' as VendorCategory,
    stallNumber: '', feeType: 'fixed' as FeeType,
    fixedFee: '', revSharePct: '', notes: '',
  });

  const totalPool  = vendors.filter(v => v.status !== 'cancelled').reduce((s, v) => s + poolContribution(v), 0);
  const totalSales = vendors.reduce((s, v) => s + (v.actualRevenue ?? 0), 0);
  const confirmed  = vendors.filter(v => v.status === 'confirmed').length;

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

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(0);
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = vendors.filter(v =>
      (v.name.toLowerCase().includes(q) || v.email.toLowerCase().includes(q) || v.stallNumber.toLowerCase().includes(q)) &&
      (categoryFilter === '' || v.category === categoryFilter) &&
      (statusFilter   === '' || v.status   === statusFilter)
    );
    return [...list].sort((a, b) => {
      const va = String(a[sortKey] ?? ''); const vb = String(b[sortKey] ?? '');
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }, [vendors, search, categoryFilter, statusFilter, sortKey, sortDir]);

  const paginated = filtered.slice(page * rpp, (page + 1) * rpp);

  const statsCards = [
    { label: 'Invited',      value: vendors.length,                   color: '#6366f1' },
    { label: 'Confirmed',    value: confirmed,                         color: '#10b981' },
    { label: 'Revenue Pool', value: `₹${totalPool.toLocaleString()}`,  color: '#6366f1' },
    { label: 'Vendor Sales', value: `₹${totalSales.toLocaleString()}`, color: '#f59e0b' },
  ];

  return (
    <Box component="main" sx={{ p: { xs: 2, md: 4 } }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        <Link to="/manage" style={{ color: 'inherit' }}>Manage</Link> → Diwali Mela 2025 → Vendors
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2, flexWrap: 'wrap' }}>
        <StorefrontIcon sx={{ color: '#6366f1', fontSize: 28 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5" fontWeight={800} sx={{ fontSize: { xs: 20, md: 24 } }}>Vendor Stalls</Typography>
          <Typography variant="body2" color="text.secondary">Invite shops and assign fee arrangements for this event.</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>Invite Vendor</Button>
      </Box>

      <Grid container spacing={2} sx={{ mb: 4 }}>
        {statsCards.map(s => (
          <Grid item xs={6} md={3} key={s.label}>
            <Card variant="outlined" sx={{ borderRadius: 2 }}>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Typography fontSize={{ xs: 22, md: 28 }} fontWeight={800} sx={{ color: s.color }}>{s.value}</Typography>
                <Typography fontSize={11} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, mt: 0.5 }}>{s.label}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', mb: 4 }}>
        {/* Search + filter bar */}
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            size="small" placeholder="Search vendor, email, stall…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 16, color: 'text.secondary' }} /></InputAdornment> }}
            sx={{ minWidth: 180, flex: 1, maxWidth: 300, bgcolor: '#fff' }}
          />
          <TextField size="small" select label="Category" value={categoryFilter}
            onChange={e => { setCategoryFilter(e.target.value as VendorCategory | ''); setPage(0); }}
            sx={{ minWidth: 135, bgcolor: '#fff' }}>
            <MenuItem value=""><em>All categories</em></MenuItem>
            {CATEGORIES.map(c => <MenuItem key={c} value={c} sx={{ textTransform: 'capitalize' }}>{c}</MenuItem>)}
          </TextField>
          <TextField size="small" select label="Status" value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value as VendorStatus | ''); setPage(0); }}
            sx={{ minWidth: 125, bgcolor: '#fff' }}>
            <MenuItem value=""><em>All statuses</em></MenuItem>
            <MenuItem value="confirmed">Confirmed</MenuItem>
            <MenuItem value="invited">Invited</MenuItem>
            <MenuItem value="cancelled">Cancelled</MenuItem>
          </TextField>
          {(search || categoryFilter || statusFilter) && (
            <Typography fontSize={13} color="text.secondary">{filtered.length} of {vendors.length}</Typography>
          )}
        </Box>

        {paginated.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>No vendors match your filter.</Box>
        ) : (
          <>
            {/* ── Mobile: card list ── */}
            <Stack spacing={1.5} sx={{ display: { xs: 'flex', md: 'none' }, p: 2 }}>
              {paginated.map(v => (
                <Paper key={v.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  {/* Title row */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1, gap: 1 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography fontWeight={700} fontSize={15}>{v.name}</Typography>
                      <Typography fontSize={12} color="text.secondary" noWrap>{v.email}</Typography>
                    </Box>
                    <Chip label={v.status} size="small" color={STATUS_COLOR[v.status]} sx={{ fontWeight: 700, textTransform: 'capitalize', flexShrink: 0 }} />
                  </Box>

                  {/* Tags row */}
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                    <Chip label={v.category} size="small" color={CATEGORY_COLOR[v.category]} sx={{ textTransform: 'capitalize', fontSize: 11, fontWeight: 700 }} />
                    <Chip label={FEE_TYPE_LABEL[v.feeType]} size="small" variant="outlined" sx={{ fontSize: 11 }} />
                    {v.stallNumber && <Chip label={`Stall ${v.stallNumber}`} size="small" variant="outlined" sx={{ fontSize: 11 }} />}
                  </Box>

                  <Divider sx={{ my: 1 }} />

                  {/* Numbers row */}
                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 1.5 }}>
                    <Box>
                      <Typography fontSize={11} color="text.secondary">Fee / Share</Typography>
                      <Typography fontSize={14} fontWeight={700}>{feeLabel(v)}</Typography>
                    </Box>
                    <Box>
                      <Typography fontSize={11} color="text.secondary">Actual Revenue</Typography>
                      <Typography fontSize={14} fontWeight={700}>{v.actualRevenue != null ? `₹${v.actualRevenue.toLocaleString()}` : '—'}</Typography>
                    </Box>
                    <Box>
                      <Typography fontSize={11} color="text.secondary">Pool Contribution</Typography>
                      <Typography fontSize={14} fontWeight={700} color="success.main">₹{poolContribution(v).toLocaleString()}</Typography>
                    </Box>
                  </Box>

                  {/* Actions */}
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button fullWidth size="small" variant="outlined" startIcon={<EditIcon />}>Edit</Button>
                    <Button fullWidth size="small" variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => setDeleteId(v.id)}>Remove</Button>
                  </Box>
                </Paper>
              ))}
            </Stack>

            {/* ── Desktop: table ── */}
            <Box sx={{ display: { xs: 'none', md: 'block' }, overflowX: 'auto' }}>
              <Table sx={{ minWidth: 800 }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    {([['name','Vendor'],['category','Category'],['stallNumber','Stall'],['feeType','Fee Type']] as [SortKey, string][]).map(([k, l]) => (
                      <TableCell key={k} sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'text.secondary', letterSpacing: 0.4 }}>
                        <TableSortLabel active={sortKey === k} direction={sortKey === k ? sortDir : 'asc'} onClick={() => toggleSort(k)}>{l}</TableSortLabel>
                      </TableCell>
                    ))}
                    {['Fee / Share', 'Actual Revenue', 'Pool Contribution'].map(h => (
                      <TableCell key={h} sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'text.secondary', letterSpacing: 0.4 }}>{h}</TableCell>
                    ))}
                    <TableCell sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'text.secondary', letterSpacing: 0.4 }}>
                      <TableSortLabel active={sortKey === 'status'} direction={sortKey === 'status' ? sortDir : 'asc'} onClick={() => toggleSort('status')}>Status</TableSortLabel>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'text.secondary', letterSpacing: 0.4 }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginated.map(v => (
                    <TableRow key={v.id} hover>
                      <TableCell>
                        <Typography fontWeight={700} fontSize={14}>{v.name}</Typography>
                        <Typography fontSize={12} color="text.secondary">{v.email}</Typography>
                      </TableCell>
                      <TableCell><Chip label={v.category} size="small" color={CATEGORY_COLOR[v.category]} sx={{ textTransform: 'capitalize', fontSize: 11, fontWeight: 700 }} /></TableCell>
                      <TableCell><Typography fontSize={13}>{v.stallNumber || '—'}</Typography></TableCell>
                      <TableCell><Chip label={FEE_TYPE_LABEL[v.feeType]} size="small" variant="outlined" sx={{ fontSize: 11 }} /></TableCell>
                      <TableCell><Typography fontSize={13}>{feeLabel(v)}</Typography></TableCell>
                      <TableCell><Typography fontSize={13}>{v.actualRevenue != null ? `₹${v.actualRevenue.toLocaleString()}` : '—'}</Typography></TableCell>
                      <TableCell><Typography fontWeight={700} fontSize={13} color="success.main">₹{poolContribution(v).toLocaleString()}</Typography></TableCell>
                      <TableCell><Chip label={v.status} size="small" color={STATUS_COLOR[v.status]} sx={{ fontWeight: 700, textTransform: 'capitalize' }} /></TableCell>
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
            </Box>
          </>
        )}

        <TablePagination
          component="div" count={filtered.length} page={page}
          onPageChange={(_, p) => setPage(p)} rowsPerPage={rpp}
          onRowsPerPageChange={e => { setRpp(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[5, 10, 25]}
          sx={{ borderTop: '1px solid', borderColor: 'divider' }}
        />
      </Paper>

      {/* Invite dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle fontWeight={700}>Invite a Vendor</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ pt: 1 }}>
            <Grid item xs={8}><TextField label="Vendor Name *" fullWidth size="small" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></Grid>
            <Grid item xs={4}>
              <TextField label="Category" fullWidth size="small" select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as VendorCategory }))}>
                {CATEGORIES.map(c => <MenuItem key={c} value={c} sx={{ textTransform: 'capitalize' }}>{c}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={6}><TextField label="Contact Email" type="email" fullWidth size="small" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></Grid>
            <Grid item xs={6}><TextField label="Stall Number" fullWidth size="small" value={form.stallNumber} onChange={e => setForm(f => ({ ...f, stallNumber: e.target.value }))} placeholder="e.g. D-04" /></Grid>
            <Grid item xs={4}>
              <TextField label="Fee Type" fullWidth size="small" select value={form.feeType} onChange={e => setForm(f => ({ ...f, feeType: e.target.value as FeeType }))}>
                <MenuItem value="fixed">Fixed Fee</MenuItem>
                <MenuItem value="revenue_share">Revenue Share %</MenuItem>
                <MenuItem value="free">Free (No Fee)</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={4}><TextField label="Fixed Fee (₹)" type="number" fullWidth size="small" value={form.fixedFee} onChange={e => setForm(f => ({ ...f, fixedFee: e.target.value }))} disabled={form.feeType !== 'fixed'} /></Grid>
            <Grid item xs={4}><TextField label="Revenue Share %" type="number" fullWidth size="small" value={form.revSharePct} onChange={e => setForm(f => ({ ...f, revSharePct: e.target.value }))} disabled={form.feeType !== 'revenue_share'} /></Grid>
            <Grid item xs={12}><TextField label="Notes" multiline rows={2} fullWidth size="small" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></Grid>
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
