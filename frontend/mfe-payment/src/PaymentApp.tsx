import React, { useState } from 'react';
import {
  Alert, Box, Chip, Container, Divider,
  Paper, Stack, Step, StepLabel, Stepper,
  Table, TableBody, TableCell, TableHead, TableRow,
  Tab, Tabs, Typography,
} from '@mui/material';
import PaymentIcon from '@mui/icons-material/Payment';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';

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
  amount: number;
  method: string;
  status: 'success' | 'failed' | 'refunded';
  emoji: string;
}

const CHECKOUT_ITEMS: CheckoutItem[] = [
  { label: 'Annual Sports Day 2026 · General Entry', qty: 2, unitPrice: 150 },
];

const PAYMENT_HISTORY: PaymentRecord[] = [
  { id: 'p1', ref: 'pay_QnM4x9Kzf3R', event: 'Annual Sports Day 2026', date: '10 Jan 2026, 2:34 PM', amount: 300, method: 'UPI · arjun@okicici', status: 'success', emoji: '🏅' },
  { id: 'p2', ref: 'pay_PLk2d7Bmw1T', event: "Children's Day Carnival", date: '2 Nov 2025, 11:20 AM', amount: 100, method: 'Card · •••• 4242', status: 'success', emoji: '🎡' },
  { id: 'p3', ref: 'pay_JhW9x2Rtv5C', event: 'Holi Colour Festival', date: '5 Jan 2026, 9:05 AM', amount: 100, method: 'UPI · arjun@okicici', status: 'refunded', emoji: '🎨' },
  { id: 'p4', ref: 'pay_XvK8p3Mnq7L', event: 'Diwali Mela 2025', date: '15 Oct 2025, 4:48 PM', amount: 0, method: '—', status: 'success', emoji: '🪔' },
];

const STATUS_STYLE: Record<PaymentRecord['status'], { label: string; bgcolor: string; color: string }> = {
  success:  { label: 'Success',  bgcolor: '#dcfce7', color: '#166534' },
  failed:   { label: 'Failed',   bgcolor: '#fee2e2', color: '#991b1b' },
  refunded: { label: 'Refunded', bgcolor: '#fef3c7', color: '#92400e' },
};

const STEPS = ['Review Order', 'Payment', 'Confirmation'];

// ── Checkout flow ─────────────────────────────────────────────────────────────

function CheckoutFlow() {
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState<'upi' | 'card' | null>(null);

  const subtotal = CHECKOUT_ITEMS.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const convenience = Math.round(subtotal * 0.02);
  const total = subtotal + convenience;

  return (
    <Box>
      <Stepper activeStep={step} sx={{ mb: 4 }}>
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
                <Box sx={{ flex: 1 }}>
                  <Typography fontWeight={600} fontSize={15}>Annual Sports Day 2026</Typography>
                  <Typography fontSize={13} color="text.secondary">Sat, 14 Feb 2026 · PVH Ground (Block A)</Typography>
                </Box>
              </Box>

              <Table size="small">
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
                  <Box sx={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${method === id ? '#6366f1' : '#cbd5e1'}`, bgcolor: method === id ? '#6366f1' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
              <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
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
  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      <Table>
        <TableHead>
          <TableRow sx={{ bgcolor: '#f8fafc' }}>
            <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Event</TableCell>
            <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Date</TableCell>
            <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Reference</TableCell>
            <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Method</TableCell>
            <TableCell align="right" sx={{ fontWeight: 600, fontSize: 12 }}>Amount</TableCell>
            <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {PAYMENT_HISTORY.map(p => {
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
    </Paper>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function PaymentApp() {
  const [tab, setTab] = useState(0);

  return (
    <Box component="main" sx={{ bgcolor: '#f8fafc', minHeight: 'calc(100vh - 64px)', py: 4 }}>
      <Container maxWidth="md">

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          {tab === 0 ? <PaymentIcon sx={{ color: '#6366f1', fontSize: 30 }} /> : <ReceiptLongIcon sx={{ color: '#6366f1', fontSize: 30 }} />}
          <Box>
            <Typography variant="h4" fontWeight={800} color="#0f172a">
              {tab === 0 ? 'Checkout' : 'Payment History'}
            </Typography>
            <Typography color="text.secondary" fontSize={14}>Arjun Sharma · Flat C-301</Typography>
          </Box>
        </Box>

        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: '1px solid #e2e8f0' }}>
          <Tab label="Checkout" sx={{ textTransform: 'none', fontWeight: 600 }} />
          <Tab label="Payment History" sx={{ textTransform: 'none', fontWeight: 600 }} />
        </Tabs>

        {tab === 0 ? <CheckoutFlow /> : <PaymentHistory />}
      </Container>
    </Box>
  );
}
