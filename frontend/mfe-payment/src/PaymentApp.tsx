import React, { useMemo, useState } from 'react';
import {
  Alert, Box, Chip, Container, Divider,
  InputAdornment, MenuItem, Paper, Select,
  Stack, Step, StepLabel, Stepper,
  Table, TableBody, TableCell, TableHead, TablePagination,
  TableRow, TableSortLabel, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import PaymentIcon from '@mui/icons-material/Payment';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import SearchIcon from '@mui/icons-material/Search';

// ── Types & mock data ─────────────────────────────────────────────────────────

interface CheckoutItem {
  label: string;
  qty: number;
  unitPrice: number;
}

interface PaymentRecord {
  id: string;
  ref: string;
  event: string;
  date: string;
  dateMs: number;
  amount: number;
  method: string;
  status: 'success' | 'failed' | 'refunded';
  emoji: string;
}

const CHECKOUT_ITEMS: CheckoutItem[] = [
  { label: 'Annual Sports Day 2026 · General Entry', qty: 2, unitPrice: 150 },
];

const PAYMENT_HISTORY: PaymentRecord[] = [
  { id: 'p1', ref: 'pay_QnM4x9Kzf3R', event: 'Annual Sports Day 2026',  date: '10 Jan 2026, 2:34 PM', dateMs: new Date('2026-01-10').getTime(), amount: 300, method: 'UPI · arjun@okicici', status: 'success',  emoji: '🏅' },
  { id: 'p2', ref: 'pay_PLk2d7Bmw1T', event: "Children's Day Carnival", date: '2 Nov 2025, 11:20 AM',  dateMs: new Date('2025-11-02').getTime(), amount: 100, method: 'Card · •••• 4242', status: 'success',  emoji: '🎡' },
  { id: 'p3', ref: 'pay_JhW9x2Rtv5C', event: 'Holi Colour Festival',    date: '5 Jan 2026, 9:05 AM',   dateMs: new Date('2026-01-05').getTime(), amount: 100, method: 'UPI · arjun@okicici', status: 'refunded', emoji: '🎨' },
  { id: 'p4', ref: 'pay_XvK8p3Mnq7L', event: 'Diwali Mela 2025',        date: '15 Oct 2025, 4:48 PM',  dateMs: new Date('2025-10-15').getTime(), amount: 0,   method: '—',                 status: 'success',  emoji: '🪔' },
];

const STATUS_STYLE: Record<PaymentRecord['status'], { label: string; bgcolor: string; color: string }> = {
  success:  { label: 'Success',  bgcolor: '#dcfce7', color: '#166534' },
  failed:   { label: 'Failed',   bgcolor: '#fee2e2', color: '#991b1b' },
  refunded: { label: 'Refunded', bgcolor: '#fef3c7', color: '#92400e' },
};

const STEPS = ['Review Order', 'Payment', 'Confirmation'];

type SortDir = 'asc' | 'desc';
type SortKey = 'event' | 'dateMs' | 'amount' | 'status';

// ── Checkout flow ─────────────────────────────────────────────────────────────

function CheckoutFlow() {
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState<'upi' | 'card' | null>(null);

  const subtotal = CHECKOUT_ITEMS.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const convenience = Math.round(subtotal * 0.02);
  const total = subtotal + convenience;

  return (
    <Box>
      <Stepper activeStep={step} sx={{ mb: 4 }} alternativeLabel>
        {STEPS.map(label => (
          <Step key={label}><StepLabel>{label}</StepLabel></Step>
        ))}
      </Stepper>

      {step === 0 && (
        <Box>
          <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', mb: 3 }}>
            <Box sx={{ px: 2, py: 1.5, bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <Typography fontWeight={700}>Order Summary</Typography>
            </Box>
            <Box sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', p: 2, bgcolor: '#f8fafc', borderRadius: 1.5, mb: 2 }}>
                <Typography fontSize={30}>🏅</Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography fontWeight={600} fontSize={15}>Annual Sports Day 2026</Typography>
                  <Typography fontSize={13} color="text.secondary">Sat, 14 Feb 2026 · PVH Ground (Block A)</Typography>
                </Box>
              </Box>

              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: 300 }}>
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f8fafc' }}>
                      <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Item</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600, fontSize: 12 }}>Qty</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600, fontSize: 12 }}>Price</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600, fontSize: 12 }}>Total</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {CHECKOUT_ITEMS.map(item => (
                      <TableRow key={item.label}>
                        <TableCell sx={{ fontSize: 13 }}>{item.label}</TableCell>
                        <TableCell align="center" sx={{ fontSize: 13 }}>{item.qty}</TableCell>
                        <TableCell align="right" sx={{ fontSize: 13 }}>₹{item.unitPrice}</TableCell>
                        <TableCell align="right" sx={{ fontSize: 13, fontWeight: 600 }}>₹{item.qty * item.unitPrice}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>

              <Divider sx={{ my: 1.5 }} />
              {[['Subtotal', subtotal], ['Convenience fee (2%)', convenience]].map(([k, v]) => (
                <Box key={k as string} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography fontSize={13} color="text.secondary">{k}</Typography>
                  <Typography fontSize={13}>₹{v}</Typography>
                </Box>
              ))}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, pt: 1, borderTop: '2px solid #e2e8f0' }}>
                <Typography fontWeight={700}>Total</Typography>
                <Typography fontWeight={700} fontSize={17} color="#6366f1">₹{total}</Typography>
              </Box>
            </Box>
          </Paper>

          <Box component="button" onClick={() => setStep(1)}
            sx={{ width: '100%', border: 'none', borderRadius: 1.5, py: 1.25, bgcolor: '#6366f1', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', '&:hover': { bgcolor: '#4f46e5' } }}>
            Continue to Payment →
          </Box>
        </Box>
      )}

      {step === 1 && (
        <Box>
          <Typography fontWeight={700} mb={2}>Choose Payment Method</Typography>
          <Stack spacing={1.5} sx={{ mb: 3 }}>
            {([['upi', '📱', 'UPI', 'Google Pay, PhonePe, Paytm, BHIM'], ['card', '💳', 'Credit / Debit Card', 'Visa, Mastercard, RuPay']] as ['upi' | 'card', string, string, string][]).map(([id, emoji, label, sub]) => (
              <Paper key={id} variant="outlined" onClick={() => setMethod(id)}
                sx={{ p: 2, cursor: 'pointer', borderRadius: 2, borderColor: method === id ? '#6366f1' : '#e2e8f0', bgcolor: method === id ? '#f5f3ff' : '#fff', transition: 'all .15s', '&:hover': { borderColor: '#6366f1' } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Typography fontSize={24}>{emoji}</Typography>
                  <Box sx={{ flex: 1 }}>
                    <Typography fontWeight={600} fontSize={14}>{label}</Typography>
                    <Typography fontSize={12} color="text.secondary">{sub}</Typography>
                  </Box>
                  <Box sx={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${method === id ? '#6366f1' : '#cbd5e1'}`, bgcolor: method === id ? '#6366f1' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {method === id && <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#fff' }} />}
                  </Box>
                </Box>
              </Paper>
            ))}
          </Stack>

          <Alert severity="info" sx={{ mb: 3, fontSize: 13 }}>
            You'll be redirected to Razorpay's secure payment page. Total: <strong>₹{total}</strong>
          </Alert>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <Box component="button" onClick={() => setStep(0)}
              sx={{ flex: 1, border: '1.5px solid #e2e8f0', borderRadius: 1.5, py: 1.25, bgcolor: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#475569' }}>
              ← Back
            </Box>
            <Box component="button" disabled={!method} onClick={() => setStep(2)}
              sx={{ flex: 2, border: 'none', borderRadius: 1.5, py: 1.25, fontSize: 14, fontWeight: 700, cursor: method ? 'pointer' : 'not-allowed', bgcolor: method ? '#6366f1' : '#e2e8f0', color: method ? '#fff' : '#94a3b8' }}>
              Pay ₹{total}
            </Box>
          </Box>
        </Box>
      )}

      {step === 2 && (
        <Box sx={{ textAlign: 'center', py: 2 }}>
          <CheckCircleIcon sx={{ fontSize: 64, color: '#10b981', mb: 2 }} />
          <Typography variant="h5" fontWeight={800} color="#0f172a" mb={1}>Payment Successful!</Typography>
          <Typography color="text.secondary" mb={3}>
            Your tickets for <strong>Annual Sports Day 2026</strong> are confirmed.
          </Typography>

          <Paper variant="outlined" sx={{ borderRadius: 2, p: 2, mb: 3, textAlign: 'left', maxWidth: 380, mx: 'auto' }}>
            {[
              ['Booking Ref', 'PVH-2026-0214-042'],
              ['Amount Paid', `₹${total}`],
              ['Payment Method', method === 'upi' ? 'UPI' : 'Card'],
              ['Tickets', `${CHECKOUT_ITEMS[0].qty} × General Entry`],
            ].map(([k, v]) => (
              <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75, flexWrap: 'wrap', gap: 1 }}>
                <Typography fontSize={13} color="text.secondary">{k}</Typography>
                <Typography fontSize={13} fontWeight={600}>{v}</Typography>
              </Box>
            ))}
          </Paper>

          <Box component="button" onClick={() => setStep(0)}
            sx={{ border: '1.5px solid #6366f1', borderRadius: 1.5, px: 3, py: 1, bgcolor: 'transparent', color: '#6366f1', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Back to Home
          </Box>
        </Box>
      )}
    </Box>
  );
}

// ── Payment History ───────────────────────────────────────────────────────────

function PaymentHistory() {
  const [search,    setSearch]    = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortKey,   setSortKey]   = useState<SortKey>('dateMs');
  const [sortDir,   setSortDir]   = useState<SortDir>('desc');
  const [page,      setPage]      = useState(0);
  const [rpp,       setRpp]       = useState(10);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(0);
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = PAYMENT_HISTORY.filter(p =>
      (p.event.toLowerCase().includes(q) || p.ref.toLowerCase().includes(q) || p.method.toLowerCase().includes(q)) &&
      (statusFilter === '' || p.status === statusFilter)
    );
    return [...list].sort((a, b) => {
      let va: string | number, vb: string | number;
      if (sortKey === 'dateMs' || sortKey === 'amount') {
        va = a[sortKey]; vb = b[sortKey];
        return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
      }
      va = String(a[sortKey]); vb = String(b[sortKey]);
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }, [search, statusFilter, sortKey, sortDir]);

  const paginated = filtered.slice(page * rpp, page * rpp + rpp);

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      {/* Search + filter bar */}
      <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="Search event, ref, method…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 16, color: 'text.secondary' }} /></InputAdornment> }}
          sx={{ minWidth: 200, flex: 1, maxWidth: 340, bgcolor: '#fff' }}
        />
        <Select
          size="small"
          displayEmpty
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(0); }}
          sx={{ minWidth: 140, fontSize: 13, bgcolor: '#fff' }}
        >
          <MenuItem value="" sx={{ fontSize: 13 }}><em>All statuses</em></MenuItem>
          <MenuItem value="success"  sx={{ fontSize: 13 }}>Success</MenuItem>
          <MenuItem value="refunded" sx={{ fontSize: 13 }}>Refunded</MenuItem>
          <MenuItem value="failed"   sx={{ fontSize: 13 }}>Failed</MenuItem>
        </Select>
        {(search || statusFilter) && (
          <Typography fontSize={13} color="text.secondary">{filtered.length} of {PAYMENT_HISTORY.length}</Typography>
        )}
      </Box>

      {/* ── Mobile: card list ── */}
      {paginated.length === 0 ? (
        <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>No payment records match your filter.</Box>
      ) : (
        <>
          <Stack spacing={1.5} sx={{ display: { xs: 'flex', md: 'none' }, p: 2 }}>
            {paginated.map(p => {
              const s = STATUS_STYLE[p.status];
              return (
                <Paper key={p.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1, gap: 1 }}>
                    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', minWidth: 0 }}>
                      <Typography fontSize={22} sx={{ flexShrink: 0 }}>{p.emoji}</Typography>
                      <Typography fontWeight={700} fontSize={14} noWrap>{p.event}</Typography>
                    </Box>
                    <Typography fontWeight={800} fontSize={16} color={p.status === 'refunded' ? '#f59e0b' : '#0f172a'} sx={{ flexShrink: 0 }}>
                      {p.amount > 0 ? `₹${p.amount}` : 'Free'}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Chip label={s.label} size="small" sx={{ bgcolor: s.bgcolor, color: s.color, fontWeight: 600, fontSize: 11 }} />
                    <Typography fontSize={12} color="text.secondary">{p.date}</Typography>
                  </Box>
                  <Box sx={{ mt: 1, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    <Box>
                      <Typography fontSize={11} color="text.secondary">Method</Typography>
                      <Typography fontSize={12} fontWeight={600}>{p.method}</Typography>
                    </Box>
                    <Box>
                      <Typography fontSize={11} color="text.secondary">Reference</Typography>
                      <Typography fontSize={11} sx={{ fontFamily: 'monospace', color: '#64748b' }}>{p.ref}</Typography>
                    </Box>
                  </Box>
                </Paper>
              );
            })}
          </Stack>

          {/* ── Desktop: table ── */}
          <Box sx={{ display: { xs: 'none', md: 'block' }, overflowX: 'auto' }}>
            <Table sx={{ minWidth: 560 }}>
              <TableHead>
                <TableRow sx={{ bgcolor: '#f8fafc' }}>
                  <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>
                    <TableSortLabel active={sortKey === 'event'} direction={sortKey === 'event' ? sortDir : 'asc'} onClick={() => toggleSort('event')}>Event</TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>
                    <TableSortLabel active={sortKey === 'dateMs'} direction={sortKey === 'dateMs' ? sortDir : 'asc'} onClick={() => toggleSort('dateMs')}>Date</TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Reference</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Method</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, fontSize: 12 }}>
                    <TableSortLabel active={sortKey === 'amount'} direction={sortKey === 'amount' ? sortDir : 'asc'} onClick={() => toggleSort('amount')}>Amount</TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>
                    <TableSortLabel active={sortKey === 'status'} direction={sortKey === 'status' ? sortDir : 'asc'} onClick={() => toggleSort('status')}>Status</TableSortLabel>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginated.map(p => {
                  const s = STATUS_STYLE[p.status];
                  return (
                    <TableRow key={p.id} hover>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography fontSize={18}>{p.emoji}</Typography>
                          <Typography fontSize={13} fontWeight={600}>{p.event}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell><Typography fontSize={13} color="text.secondary">{p.date}</Typography></TableCell>
                      <TableCell><Typography fontSize={12} sx={{ fontFamily: 'monospace', color: '#64748b' }}>{p.ref}</Typography></TableCell>
                      <TableCell><Typography fontSize={13} color="text.secondary">{p.method}</Typography></TableCell>
                      <TableCell align="right">
                        <Typography fontSize={13} fontWeight={700} color={p.status === 'refunded' ? '#f59e0b' : '#0f172a'}>
                          {p.amount > 0 ? `₹${p.amount}` : 'Free'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={s.label} size="small" sx={{ bgcolor: s.bgcolor, color: s.color, fontWeight: 600, fontSize: 11 }} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        </>
      )}
      <TablePagination
        component="div"
        count={filtered.length}
        page={page}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPage={rpp}
        onRowsPerPageChange={e => { setRpp(parseInt(e.target.value, 10)); setPage(0); }}
        rowsPerPageOptions={[5, 10, 25]}
        sx={{ borderTop: '1px solid', borderColor: 'divider' }}
      />
    </Paper>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function PaymentApp() {
  const [tab, setTab] = useState(0);

  return (
    <Box component="main" sx={{ bgcolor: '#f8fafc', minHeight: 'calc(100vh - 64px)', py: { xs: 2, md: 4 } }}>
      <Container maxWidth="md">

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          {tab === 0 ? <PaymentIcon sx={{ color: '#6366f1', fontSize: { xs: 26, md: 30 } }} /> : <ReceiptLongIcon sx={{ color: '#6366f1', fontSize: { xs: 26, md: 30 } }} />}
          <Box>
            <Typography variant="h4" fontWeight={800} color="#0f172a" sx={{ fontSize: { xs: 24, md: 32 } }}>
              {tab === 0 ? 'Checkout' : 'Payment History'}
            </Typography>
            <Typography color="text.secondary" fontSize={14}>Arjun Sharma · Flat C-301</Typography>
          </Box>
        </Box>

        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: '1px solid #e2e8f0' }} variant="scrollable" scrollButtons="auto">
          <Tab label="Checkout" sx={{ textTransform: 'none', fontWeight: 600 }} />
          <Tab label="Payment History" sx={{ textTransform: 'none', fontWeight: 600 }} />
        </Tabs>

        {tab === 0 ? <CheckoutFlow /> : <PaymentHistory />}
      </Container>
    </Box>
  );
}
