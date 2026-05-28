import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Chip,
  Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, MenuItem, Paper, Stack, Table, TableBody,
  TableCell, TableFooter, TableHead, TableRow,
  TextField, Typography,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';

type RecipientType = 'sponsor' | 'organizer' | 'resident' | 'society';
type EntryStatus = 'pending' | 'paid';
type DistributionStatus = 'draft' | 'approved' | 'distributed';

interface DistributionEntry {
  id: string;
  recipientType: RecipientType;
  recipientName: string;
  sharePct: number;
  amount: number;
  status: EntryStatus;
}

const TOTAL_POOL = 6900;

const INITIAL_ENTRIES: DistributionEntry[] = [
  { id: 'e1', recipientType: 'sponsor',   recipientName: 'TechCorp Solutions',         sharePct: 30, amount: 2070, status: 'pending' },
  { id: 'e2', recipientType: 'sponsor',   recipientName: 'Community Welfare Foundation', sharePct: 10, amount: 690,  status: 'pending' },
  { id: 'e3', recipientType: 'organizer', recipientName: 'Meera Krishnan',              sharePct: 30, amount: 2070, status: 'pending' },
  { id: 'e4', recipientType: 'society',   recipientName: 'Prestige Verdant Heights',    sharePct: 30, amount: 2070, status: 'pending' },
];

const RECIPIENT_OPTIONS: Record<RecipientType, string[]> = {
  sponsor:   ['TechCorp Solutions', 'Community Welfare Foundation'],
  organizer: ['Meera Krishnan', 'Rajesh Iyer'],
  resident:  ['Arjun Sharma', 'Priya Nair', 'Sanjay Mehta'],
  society:   ['Prestige Verdant Heights'],
};

const RECIPIENT_COLOR: Record<RecipientType, 'secondary' | 'primary' | 'success' | 'default'> = {
  sponsor:   'secondary',
  organizer: 'primary',
  resident:  'success',
  society:   'default',
};

const DIST_STATUS: Record<DistributionStatus, { label: string; color: 'warning' | 'success' | 'primary' }> = {
  draft:       { label: 'Draft',       color: 'warning' },
  approved:    { label: 'Approved',    color: 'primary' },
  distributed: { label: 'Distributed', color: 'success' },
};

export function RevenueDistribution() {
  const { id: eventId } = useParams();
  const [entries, setEntries]     = useState<DistributionEntry[]>(INITIAL_ENTRIES);
  const [distStatus, setDistStatus] = useState<DistributionStatus>('draft');
  const [addOpen, setAddOpen]     = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [formType,      setFormType]      = useState<RecipientType>('sponsor');
  const [formRecipient, setFormRecipient] = useState('');
  const [formPct,       setFormPct]       = useState('');
  const [formNotes,     setFormNotes]     = useState('');

  const totalPct    = entries.reduce((s, e) => s + e.sharePct, 0);
  const totalAmt    = entries.reduce((s, e) => s + e.amount,    0);
  const pctValid    = Math.abs(totalPct - 100) < 0.01;

  const handleAdd = () => {
    if (!formRecipient || !formPct) return;
    const pct = Number(formPct);
    const amt = Math.round((TOTAL_POOL * pct) / 100 * 100) / 100;
    setEntries(prev => [...prev, {
      id: `new-${Date.now()}`, recipientType: formType, recipientName: formRecipient,
      sharePct: pct, amount: amt, status: 'pending',
    }]);
    setAddOpen(false);
    setFormType('sponsor'); setFormRecipient(''); setFormPct(''); setFormNotes('');
  };

  const handleApprove = () => {
    setDistStatus('approved');
    setConfirmOpen(false);
  };

  const handleDistribute = () => {
    setEntries(prev => prev.map(e => ({ ...e, status: 'paid' })));
    setDistStatus('distributed');
  };

  const stats = [
    { label: 'Total Pool',  value: `₹${TOTAL_POOL.toLocaleString()}`, color: '#6366f1' },
    { label: 'Recipients',  value: entries.length,                     color: '#0f172a' },
    { label: 'Allocated',   value: `${totalPct.toFixed(0)}%`,          color: pctValid ? '#10b981' : '#ef4444' },
    { label: 'Status',      value: DIST_STATUS[distStatus].label,      color: distStatus === 'distributed' ? '#10b981' : '#f59e0b' },
  ];

  return (
    <Box component="main" sx={{ p: { xs: 2, md: 4 } }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        <Link to="/manage" style={{ color: 'inherit' }}>Manage</Link> → Diwali Mela 2025 → Revenue Pool
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
        <AccountBalanceIcon sx={{ color: '#6366f1', fontSize: 28 }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={800}>Vendor Revenue Distribution</Typography>
          <Typography variant="body2" color="text.secondary">Plan how vendor pool earnings are shared among sponsors, organizers, and society.</Typography>
        </Box>
        <Chip label={DIST_STATUS[distStatus].label} color={DIST_STATUS[distStatus].color} sx={{ fontWeight: 700 }} />
        {distStatus === 'draft' && (
          <Button variant="contained" color="success" startIcon={<CheckIcon />} disabled={!pctValid} onClick={() => setConfirmOpen(true)}>
            Approve &amp; Distribute
          </Button>
        )}
        {distStatus === 'approved' && (
          <Button variant="contained" color="primary" startIcon={<CheckIcon />} onClick={handleDistribute}>
            Mark as Distributed
          </Button>
        )}
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

      {!pctValid && (
        <Alert severity="warning" sx={{ mb: 2, borderRadius: 1.5 }}>
          Percentages currently total <strong>{totalPct.toFixed(1)}%</strong>. They must sum to 100% before you can approve.
        </Alert>
      )}

      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', mb: 4 }}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: '#f8fafc' }}>
              {['Recipient', 'Type', 'Share %', 'Amount (₹)', 'Status', 'Actions'].map(h => (
                <TableCell key={h} sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'text.secondary', letterSpacing: 0.4 }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.id} hover>
                <TableCell>
                  <Typography fontWeight={700} fontSize={14}>{e.recipientName}</Typography>
                </TableCell>
                <TableCell>
                  <Chip label={e.recipientType} size="small" color={RECIPIENT_COLOR[e.recipientType]} sx={{ textTransform: 'capitalize', fontWeight: 700, fontSize: 11 }} />
                </TableCell>
                <TableCell>
                  {distStatus === 'draft' ? (
                    <TextField
                      type="number" size="small" value={e.sharePct}
                      sx={{ width: 80 }}
                      onChange={ev => {
                        const pct = Number(ev.target.value);
                        setEntries(prev => prev.map(r => r.id === e.id
                          ? { ...r, sharePct: pct, amount: Math.round((TOTAL_POOL * pct) / 100 * 100) / 100 }
                          : r));
                      }}
                    />
                  ) : (
                    <Typography fontWeight={600}>{e.sharePct}%</Typography>
                  )}
                </TableCell>
                <TableCell><Typography fontWeight={700}>₹{e.amount.toLocaleString()}</Typography></TableCell>
                <TableCell>
                  <Chip label={e.status} size="small" color={e.status === 'paid' ? 'success' : 'default'} sx={{ fontWeight: 700, textTransform: 'capitalize' }} />
                </TableCell>
                <TableCell>
                  {distStatus === 'draft' && (
                    <Button size="small" variant="outlined" color="error" startIcon={<DeleteIcon />}
                      onClick={() => setEntries(prev => prev.filter(r => r.id !== e.id))}>
                      Remove
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow sx={{ bgcolor: '#f8fafc' }}>
              <TableCell colSpan={2} sx={{ color: 'text.secondary', fontSize: 12 }} align="right">Total allocated</TableCell>
              <TableCell sx={{ fontWeight: 700, color: pctValid ? '#10b981' : '#ef4444' }}>{totalPct.toFixed(0)}%</TableCell>
              <TableCell sx={{ fontWeight: 700, color: pctValid ? '#10b981' : '#ef4444' }}>₹{totalAmt.toLocaleString()}</TableCell>
              <TableCell colSpan={2} />
            </TableRow>
          </TableFooter>
        </Table>
      </Paper>

      {distStatus === 'draft' && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>Add Recipient</Button>
        </Box>
      )}

      {/* Add recipient dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle fontWeight={700}>Add Recipient</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ pt: 1 }}>
            <Grid item xs={6}>
              <TextField label="Recipient Type" fullWidth size="small" select value={formType}
                onChange={e => { setFormType(e.target.value as RecipientType); setFormRecipient(''); }}>
                {(['sponsor', 'organizer', 'resident', 'society'] as RecipientType[]).map(t =>
                  <MenuItem key={t} value={t} sx={{ textTransform: 'capitalize' }}>{t}</MenuItem>
                )}
              </TextField>
            </Grid>
            <Grid item xs={6}>
              <TextField label="Recipient" fullWidth size="small" select value={formRecipient} onChange={e => setFormRecipient(e.target.value)}>
                <MenuItem value="">— select —</MenuItem>
                {RECIPIENT_OPTIONS[formType].map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={6}>
              <TextField label="Share %" type="number" fullWidth size="small" value={formPct} onChange={e => setFormPct(e.target.value)} />
            </Grid>
            <Grid item xs={6}>
              <TextField label="Notes (optional)" fullWidth size="small" value={formNotes} onChange={e => setFormNotes(e.target.value)} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" startIcon={<AddIcon />} disabled={!formRecipient || !formPct} onClick={handleAdd}>Add</Button>
        </DialogActions>
      </Dialog>

      {/* Approve confirm dialog */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle fontWeight={700}>Approve Distribution</DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ borderRadius: 1.5 }}>
            This will lock the distribution plan. Recipients will be notified and payouts can be marked as paid individually.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" color="success" startIcon={<CheckIcon />} onClick={handleApprove}>Confirm Approval</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
