import React, { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Alert, Box, Button, Chip, CircularProgress, Container,
  Divider, IconButton, Paper, Stack, Step, StepLabel,
  Stepper, TextField, Tooltip, Typography,
} from '@mui/material';
import AccountBalanceIcon  from '@mui/icons-material/AccountBalance';
import CheckCircleIcon     from '@mui/icons-material/CheckCircle';
import ContentCopyIcon     from '@mui/icons-material/ContentCopy';
import ErrorOutlineIcon    from '@mui/icons-material/ErrorOutline';
import HourglassTopIcon    from '@mui/icons-material/HourglassTop';
import InfoOutlinedIcon    from '@mui/icons-material/InfoOutlined';
import PaymentIcon         from '@mui/icons-material/Payment';
import QrCode2Icon         from '@mui/icons-material/QrCode2';
import RefreshIcon         from '@mui/icons-material/Refresh';
import VerifiedIcon        from '@mui/icons-material/Verified';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TicketItem { id: string | null; name: string; qty: number; price: number; is_free: boolean }

interface CheckoutData {
  eventId: string; eventTitle: string; eventVenue: string;
  eventStart: string; currency: string; tickets: TicketItem[];
}

interface Registration {
  id: string; event_id: string; event_title: string;
  event_start_time: string; event_end_time: string;
  event_venue: string; event_is_free: boolean;
  ticket_count: number; total_amount: number;
  display_currency: string; status: string;
  registered_at: string;
}

interface Transaction {
  txn_ref: string; status: string; amount: number;
  payee_upi: string | null; payer_upi: string | null;
  payment_utr: string | null; event_title: string;
}

interface Collector {
  upi_id: string; upi_name: string; upi_intent_uri: string;
  event_title: string; amount: number; currency: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtAmount(n: number, currency = 'INR') {
  if (n === 0) return 'Free';
  return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;
}

function CopyText({ value, mono = false }: { value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <Typography fontWeight={700} component="span" fontFamily={mono ? 'monospace' : undefined}>
        {value}
      </Typography>
      <Tooltip title={copied ? 'Copied!' : 'Copy'}>
        <IconButton size="small" onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}>
          {copied
            ? <CheckCircleIcon sx={{ fontSize: 14, color: 'success.main' }} />
            : <ContentCopyIcon sx={{ fontSize: 14 }} />}
        </IconButton>
      </Tooltip>
    </Box>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; color: 'default' | 'warning' | 'info' | 'success' | 'error'; icon: React.ReactElement }> = {
    pending:           { label: 'Pending Verification', color: 'warning',  icon: <HourglassTopIcon /> },
    verified:          { label: 'Verified',             color: 'success',  icon: <VerifiedIcon /> },
    refund_requested:  { label: 'Refund Requested',     color: 'info',     icon: <InfoOutlinedIcon /> },
    refunded:          { label: 'Refunded',             color: 'default',  icon: <AccountBalanceIcon /> },
    cancelled:         { label: 'Cancelled',            color: 'error',    icon: <ErrorOutlineIcon /> },
  };
  const cfg = map[status] ?? { label: status, color: 'default', icon: <PaymentIcon /> };
  return <Chip label={cfg.label} color={cfg.color} size="small" icon={cfg.icon} />;
}

// ── API ───────────────────────────────────────────────────────────────────────

async function apiFetch(path: string, token: string, opts: RequestInit = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error(b.detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Checkout flow ─────────────────────────────────────────────────────────────

const STEPS = ['Confirm Booking', 'Scan & Pay', 'Track Payment'];

function CheckoutFlow({ token }: { token: string }) {
  const [step, setStep]               = useState(0);
  const [checkoutData, setCheckoutData] = useState<CheckoutData | null>(null);
  const [cartLoading, setCartLoading] = useState(true);
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [collector, setCollector]     = useState<Collector | null>(null);
  const [payerUpi, setPayerUpi]       = useState('');
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [loading, setLoading]         = useState(false);
  const pollRef                       = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch('/api/registrations/registrations/cart', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) setCheckoutData({
          eventId: d.event_id, eventTitle: d.event_title,
          eventVenue: d.event_venue, eventStart: d.event_start,
          currency: d.currency, tickets: d.tickets,
        });
        setCartLoading(false);
      })
      .catch(() => setCartLoading(false));
  }, [token]);

  // Poll transaction status until verified
  useEffect(() => {
    if (!transaction || transaction.status === 'verified' || transaction.status === 'cancelled') return;
    pollRef.current = setInterval(async () => {
      try {
        const updated: Transaction = await apiFetch(
          `/api/payments/payments/${transaction.txn_ref}`, token
        );
        setTransaction(updated);
        if (updated.status !== 'pending') clearInterval(pollRef.current!);
      } catch { /* ignore poll errors */ }
    }, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [transaction?.txn_ref, transaction?.status]);

  if (cartLoading) return (
    <Container maxWidth="sm" sx={{ pt: 8, textAlign: 'center' }}><CircularProgress /></Container>
  );

  if (!checkoutData) return (
    <Container maxWidth="sm" sx={{ pt: 6, textAlign: 'center' }}>
      <Typography variant="h6" color="text.secondary">No active cart found.</Typography>
      <Button sx={{ mt: 2 }} variant="contained" onClick={() => { window.location.href = '/events'; }}>
        Browse Events
      </Button>
    </Container>
  );

  const total  = checkoutData.tickets.reduce((s, t) => s + (t.is_free ? 0 : t.price * t.qty), 0);
  const isFree = total === 0;
  const steps  = isFree ? ['Confirm Booking', 'Done'] : STEPS;

  // Step 0: Confirm Booking → create registration (or resume existing)
  async function handleConfirm() {
    setLoading(true); setError(null);
    try {
      let reg: Registration;

      // Try to create a new registration
      const regRes = await fetch('/api/registrations/registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          event_id: checkoutData!.eventId,
          tickets: checkoutData!.tickets.map(t => ({
            ticket_type_id: t.id, ticket_type_name: t.name,
            quantity: t.qty, unit_price: t.price,
          })),
          ticket_count: checkoutData!.tickets.reduce((s, t) => s + t.qty, 0),
        }),
      });

      if (regRes.ok) {
        reg = await regRes.json();
      } else if (regRes.status === 409) {
        // Already registered — resume the existing registration
        const myRegs: Registration[] = await apiFetch('/api/registrations/registrations/my', token);
        const existing = myRegs.find(
          r => r.event_id === checkoutData!.eventId && r.status !== 'cancelled'
        );
        if (!existing) throw new Error('Already registered but could not locate your registration.');
        reg = existing;
      } else {
        const b = await regRes.json().catch(() => ({}));
        throw new Error((b as { detail?: string }).detail ?? `HTTP ${regRes.status}`);
      }

      setRegistration(reg);
      fetch('/api/registrations/registrations/cart', {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});

      // If already confirmed (paid or free), go straight to success screen
      if (isFree || reg.status === 'confirmed') { setStep(1); return; }

      // pending_payment — resolve collector and show QR
      const col: Collector = await apiFetch(
        `/api/payments/registry/events/${checkoutData!.eventId}/collector?amount=${total}`, token
      );
      setCollector(col);
      setStep(1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  // Step 1: User has scanned QR and clicks "I've Paid" (payer UPI is optional)
  async function handlePaid() {
    if (!registration) return;
    setLoading(true); setError(null);
    try {
      const result = await apiFetch('/api/payments/payments/initiate', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: checkoutData!.eventId,
          registration_id: registration.id,
          payer_upi: payerUpi.trim(),
        }),
      });
      // Fetch full transaction object
      const txn: Transaction = await apiFetch(`/api/payments/payments/${result.txn_ref}`, token);
      setTransaction(txn);
      setStep(2);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not record payment');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Typography variant="h5" fontWeight={800} mb={3}>Checkout</Typography>
      <Stepper activeStep={step} sx={{ mb: 4 }}>
        {steps.map(l => <Step key={l}><StepLabel>{l}</StepLabel></Step>)}
      </Stepper>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* ── Step 0: Order summary ── */}
      {step === 0 && (
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
          <Typography fontWeight={700} variant="h6" mb={0.5}>{checkoutData.eventTitle}</Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            {fmtDate(checkoutData.eventStart)} · {checkoutData.eventVenue}
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <Stack spacing={1} mb={2}>
            {checkoutData.tickets.map((t, i) => (
              <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">{t.name} × {t.qty}</Typography>
                <Typography variant="body2" fontWeight={600}>
                  {t.is_free ? 'Free' : fmtAmount(t.price * t.qty, checkoutData.currency)}
                </Typography>
              </Box>
            ))}
          </Stack>
          <Divider sx={{ mb: 2 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
            <Typography fontWeight={700}>Total</Typography>
            <Typography fontWeight={700} color="primary">{fmtAmount(total, checkoutData.currency)}</Typography>
          </Box>
          <Button fullWidth variant="contained" size="large" disabled={loading} onClick={handleConfirm}>
            {loading ? <CircularProgress size={22} color="inherit" /> : isFree ? 'Register for Free' : 'Confirm & Proceed to Payment'}
          </Button>
        </Paper>
      )}

      {/* ── Step 1b: Free event confirmed OR already-confirmed paid registration ── */}
      {step === 1 && (isFree || registration?.status === 'confirmed') && (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
          <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
          <Typography variant="h6" fontWeight={700}>Registration Confirmed!</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 3 }}>
            {checkoutData.eventTitle} · {fmtDate(checkoutData.eventStart)}
          </Typography>
          <Button variant="contained" onClick={() => { window.location.href = '/tickets'; }}>View My Tickets</Button>
        </Paper>
      )}

      {/* ── Step 1a: Pay via UPI ── */}
      {step === 1 && !isFree && registration?.status !== 'confirmed' && collector && registration && (
        <Stack spacing={3}>
          <Alert severity="info" icon={<QrCode2Icon />}>
            Scan the QR or copy the UPI ID below to pay <strong>{fmtAmount(total)}</strong>.
            Then enter your own UPI ID and click <strong>"I've Paid"</strong>.
          </Alert>

          <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
            <Typography fontWeight={700} mb={2}>Pay via UPI</Typography>

            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {/* QR rendered client-side from UPI intent URI */}
              <Box sx={{ textAlign: 'center', flexShrink: 0 }}>
                <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1, display: 'inline-block' }}>
                  <QRCodeSVG
                    value={collector.upi_intent_uri}
                    size={160}
                    level="M"
                    includeMargin={false}
                  />
                </Box>
                <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                  Scan with any UPI app
                </Typography>
              </Box>

              {/* Collector UPI details */}
              <Stack spacing={1.5} sx={{ flex: 1, minWidth: 180 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Amount</Typography>
                  <Typography fontWeight={700} fontSize={20} color="primary.main">
                    {fmtAmount(total)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Pay to UPI ID</Typography>
                  <Box><CopyText value={collector.upi_id} mono /></Box>
                  <Typography variant="caption" color="text.secondary">({collector.upi_name})</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Event</Typography>
                  <Typography variant="body2" fontWeight={600}>{collector.event_title}</Typography>
                </Box>
              </Stack>
            </Box>
          </Paper>

          {/* Payer UPI (optional) + submit */}
          <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
            <Typography fontWeight={700} mb={1.5}>After Paying</Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Once you have transferred the amount, click the button below to notify the admin.
              Optionally provide your UPI ID to make refunds easier.
            </Typography>
            <TextField
              label="Your UPI ID (optional)"
              value={payerUpi}
              onChange={e => setPayerUpi(e.target.value)}
              fullWidth size="small" sx={{ mb: 2 }}
              placeholder="yourname@okicici"
              helperText="Optional — helps us process refunds if needed"
            />
            <Button
              fullWidth variant="contained" size="large" color="success"
              disabled={loading}
              onClick={handlePaid}
            >
              {loading ? <CircularProgress size={22} color="inherit" /> : "I've Paid — Notify Admin"}
            </Button>
          </Paper>
        </Stack>
      )}

      {/* ── Step 1a (no collector): fallback ── */}
      {step === 1 && !isFree && !collector && (
        <Alert severity="warning" icon={<AccountBalanceIcon />}>
          No payment collector has been assigned for this event yet. Contact an admin to complete your registration.
        </Alert>
      )}

      {/* ── Step 2: Tracking ── */}
      {step === 2 && transaction && (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 2 }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            {transaction.status === 'verified'
              ? <VerifiedIcon sx={{ fontSize: 64, color: 'success.main' }} />
              : <HourglassTopIcon sx={{ fontSize: 64, color: 'warning.main' }} />}
          </Box>

          <Typography variant="h6" fontWeight={700} textAlign="center" mb={0.5}>
            {transaction.status === 'verified' ? 'Payment Verified!' : 'Payment Pending Verification'}
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center" mb={3}>
            {transaction.status === 'verified'
              ? 'Your registration is confirmed. You can view your ticket now.'
              : 'An admin will verify your payment shortly. This page auto-updates.'}
          </Typography>

          <Divider sx={{ mb: 2 }} />

          <Stack spacing={1.5}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">Transaction ID</Typography>
              <CopyText value={transaction.txn_ref} mono />
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">Amount</Typography>
              <Typography fontWeight={700}>{fmtAmount(transaction.amount)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">Status</Typography>
              <StatusChip status={transaction.status} />
            </Box>
            {transaction.payment_utr && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">UTR</Typography>
                <CopyText value={transaction.payment_utr} mono />
              </Box>
            )}
          </Stack>

          <Box sx={{ display: 'flex', gap: 1.5, mt: 3 }}>
            {transaction.status === 'pending' && (
              <Button
                variant="outlined" startIcon={<RefreshIcon />}
                onClick={async () => {
                  const updated: Transaction = await apiFetch(`/api/payments/payments/${transaction.txn_ref}`, token);
                  setTransaction(updated);
                }}
              >
                Refresh
              </Button>
            )}
            <Button
              variant="contained" fullWidth
              onClick={() => { window.location.href = transaction.status === 'verified' ? '/tickets' : '/registrations'; }}
            >
              {transaction.status === 'verified' ? 'View My Tickets' : 'View My Registrations'}
            </Button>
          </Box>
        </Paper>
      )}
    </Container>
  );
}

// ── My Payments history ───────────────────────────────────────────────────────

function MyPayments({ token }: { token: string }) {
  const [txns, setTxns]       = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data: Transaction[] = await apiFetch('/api/payments/payments', token);
      setTxns(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}><CircularProgress /></Box>;

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h5" fontWeight={800} mb={3}>My Payments</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {txns.length === 0 && !error && (
        <Box textAlign="center" py={8}>
          <Typography variant="body1" color="text.secondary" mb={2}>No payments yet.</Typography>
          <Button variant="contained" onClick={() => { window.location.href = '/events'; }}>Browse Events</Button>
        </Box>
      )}
      <Stack spacing={2}>
        {txns.map(txn => (
          <Paper key={txn.txn_ref} variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1 }}>
              <Box>
                <Typography fontWeight={700}>{txn.event_title}</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">TXN</Typography>
                  <CopyText value={txn.txn_ref} mono />
                </Box>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {fmtAmount(txn.amount)}
                  {txn.payment_utr && <> · UTR: <strong>{txn.payment_utr}</strong></>}
                </Typography>
              </Box>
              <StatusChip status={txn.status} />
            </Box>
          </Paper>
        ))}
      </Stack>
    </Container>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export interface PaymentAppProps { token?: string | null }

export function PaymentApp({ token }: PaymentAppProps) {
  const isCheckout = window.location.pathname.startsWith('/checkout');

  if (!token) return (
    <Container maxWidth="sm" sx={{ pt: 8, textAlign: 'center' }}>
      <Typography variant="h6" color="text.secondary" mb={2}>Please log in to continue.</Typography>
      <Button variant="contained" onClick={() => { window.location.href = '/'; }}>Go to Login</Button>
    </Container>
  );

  if (isCheckout) return <CheckoutFlow token={token} />;
  return <MyPayments token={token} />;
}

export default PaymentApp;
