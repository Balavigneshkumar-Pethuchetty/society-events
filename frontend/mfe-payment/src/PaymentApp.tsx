import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import {
  Alert, Box, Button, Chip, CircularProgress, Container,
  Divider, IconButton, Paper, Stack, Step, StepLabel,
  Stepper, Tooltip, Typography,
} from '@mui/material';
import AccountBalanceIcon  from '@mui/icons-material/AccountBalance';
import CheckCircleIcon     from '@mui/icons-material/CheckCircle';
import ContentCopyIcon     from '@mui/icons-material/ContentCopy';
import ErrorOutlineIcon    from '@mui/icons-material/ErrorOutline';
import HourglassTopIcon    from '@mui/icons-material/HourglassTop';
import InfoOutlinedIcon    from '@mui/icons-material/InfoOutlined';
import PaymentIcon         from '@mui/icons-material/Payment';
import QrCode2Icon         from '@mui/icons-material/QrCode2';
import UploadFileIcon      from '@mui/icons-material/UploadFile';
import VerifiedIcon        from '@mui/icons-material/Verified';

// ── Constants ─────────────────────────────────────────────────────────────────

const PAY_BASE = 'https://pay.gm-global-techies-town.club';

// Module-level cache: populated once from GET /channels, then reused.
// Can be pre-seeded at build time via VITE_PAY_CHANNEL_ID.
let _channelId: string | null =
  (import.meta.env.VITE_PAY_CHANNEL_ID as string | undefined) ?? null;

async function fetchChannelId(token: string): Promise<string | null> {
  if (_channelId) return _channelId;
  try {
    const channels: Array<{ id: string; is_active: boolean }> = await apiFetch(
      `${PAY_BASE}/channels`, token
    );
    const active = channels.find(c => c.is_active);
    if (active) { _channelId = active.id; }
  } catch { /* requires admin role — falls back to null if caller lacks it */ }
  return _channelId;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  try { return JSON.parse(atob(token.split('.')[1])); }
  catch { return {}; }
}

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

interface PaymentIntentResp {
  transaction_id: string;
  status: string;
  amount: number;
  upi_qr_data: string;   // data:image/png;base64,...
  upi_vpa: string;
  expiry_at: string;
  checksum_hash: string;
}

interface VerifyResult {
  verdict: string;       // CONFIRMED | AMOUNT_MISMATCH | PENDING
  confidence: string;
  upiRef: string | null;
  amount: number | null;
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
    throw new Error((b as { detail?: string }).detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Checkout flow ─────────────────────────────────────────────────────────────

const STEPS = ['Confirm Booking', 'Scan & Pay', 'Upload Proof', 'Done'];

function CheckoutFlow({ token }: { token: string }) {
  const [step, setStep]               = useState(0);
  const [checkoutData, setCheckoutData] = useState<CheckoutData | null>(null);
  const [cartLoading, setCartLoading] = useState(true);
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [paymentIntent, setPaymentIntent] = useState<PaymentIntentResp | null>(null);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [verifying, setVerifying]     = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [loading, setLoading]         = useState(false);
  const sseAbortRef                   = useRef<AbortController | null>(null);

  // Close SSE when the component unmounts
  useEffect(() => () => { sseAbortRef.current?.abort(); }, []);

  // Auto-redirect to My Tickets after successful confirmation
  useEffect(() => {
    if (verifyResult?.verdict !== 'CONFIRMED') return;
    const t = setTimeout(() => { window.location.href = '/tickets'; }, 3000);
    return () => clearTimeout(t);
  }, [verifyResult]);

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

  // ── Step 0: Confirm Booking ────────────────────────────────────────────────

  async function handleConfirm() {
    setLoading(true); setError(null);
    try {
      let reg: Registration;

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
      } else {
        const b = await regRes.json().catch(() => ({}));
        throw new Error((b as { detail?: string }).detail ?? `HTTP ${regRes.status}`);
      }

      setRegistration(reg);
      fetch('/api/registrations/registrations/cart', {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});

      if (reg.status === 'confirmed') { setStep(1); return; }

      // Create payment intent via centralized reconciliation service
      const ticketCount = checkoutData!.tickets.reduce((s, t) => s + t.qty, 0);
      const claims      = decodeJwtPayload(token);
      const payerId     = (claims.preferred_username as string) || (claims.sub as string) || 'member';

      const intent: PaymentIntentResp = await apiFetch(`${PAY_BASE}/createPayment`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ctx_type: 'EVENT',
          amount: total,
          payer_id: payerId,
          description: `${checkoutData!.eventTitle} - ${ticketCount} ticket${ticketCount !== 1 ? 's' : ''}`,
          payment_category: 'event_ticket',
          expiry_hours: 24,
          payment_metadata: {
            event_id: checkoutData!.eventId,
            ticket_count: ticketCount,
            registration_id: reg.id,
          },
        }),
      });
      setPaymentIntent(intent);

      // Open SSE before user uploads proof so we never miss the event
      openSse(intent.transaction_id);
      setStep(1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  // ── SSE listener ──────────────────────────────────────────────────────────

  function openSse(transactionId: string) {
    sseAbortRef.current?.abort();
    const abort = new AbortController();
    sseAbortRef.current = abort;

    fetchEventSource(`${PAY_BASE}/events/subscribe`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: abort.signal,
      openWhenHidden: true,
      async onmessage(ev) {
        if (ev.event !== 'payment_verified') return;
        let data: Record<string, unknown>;
        try { data = JSON.parse(ev.data); }
        catch { return; }

        if (data.transaction_id !== transactionId) return;

        const result: VerifyResult = {
          verdict:    String(data.verdict    ?? 'PENDING'),
          confidence: String(data.confidence ?? ''),
          upiRef:     (data.upi_ref as string | null) ?? null,
          amount:     (data.amount as number | null) ?? null,
        };

        if (result.verdict === 'CONFIRMED') {
          await markTicketPurchased(result);
        } else {
          setVerifyResult(result);
          setVerifying(false);
          setStep(3);
        }
      },
      onerror(err) {
        console.warn('SSE error:', err);
        // returning undefined causes fetchEventSource to reconnect automatically
      },
    });
  }

  async function markTicketPurchased(result: VerifyResult) {
    if (!registration || !paymentIntent) return;
    try {
      await apiFetch('/api/payments/payments/auto-confirm', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id:              registration.event_id,
          registration_id:       registration.id,
          reconciliation_txn_id: paymentIntent.transaction_id,
          upi_ref:               result.upiRef ?? 'RECONCILED',
          amount:                result.amount ?? paymentIntent.amount,
        }),
      });
    } catch { /* best-effort — reconciliation already confirmed; admin can resolve */ }

    sseAbortRef.current?.abort();
    setVerifyResult(result);
    setVerifying(false);
    setStep(3);
  }

  // ── Step 2: Upload screenshot ──────────────────────────────────────────────

  async function handleScreenshotUpload() {
    if (!screenshotFile || !paymentIntent) return;
    setVerifying(true); setError(null);

    const channelId = await fetchChannelId(token);
    if (!channelId) {
      setError('No payment channel is configured. Contact an admin.');
      setVerifying(false);
      return;
    }

    const fd = new FormData();
    fd.append('file', screenshotFile);
    fd.append('channel_id', channelId);
    fd.append('txn_id', paymentIntent.transaction_id);
    fd.append('search_days', '3');

    try {
      // The response body is ignored here — the SSE event carries the verdict.
      // verifying stays true until the SSE handler resolves it.
      await fetch(`${PAY_BASE}/verifyPaymentScreenshot`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
    } catch (e: unknown) {
      setVerifying(false);
      setError(e instanceof Error ? e.message : 'Verification request failed. Please try again.');
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

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
            {loading
              ? <CircularProgress size={22} color="inherit" />
              : isFree ? 'Register for Free' : 'Confirm & Proceed to Payment'}
          </Button>
        </Paper>
      )}

      {/* ── Step 1b: Free / already-confirmed ── */}
      {step === 1 && registration?.status === 'confirmed' && (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
          <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
          <Typography variant="h6" fontWeight={700}>Registration Confirmed!</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 3 }}>
            {checkoutData.eventTitle} · {fmtDate(checkoutData.eventStart)}
          </Typography>
          <Button variant="contained" onClick={() => { window.location.href = '/tickets'; }}>View My Tickets</Button>
        </Paper>
      )}

      {/* ── Step 1a: Scan & Pay ── */}
      {step === 1 && registration?.status !== 'confirmed' && paymentIntent && (
        <Stack spacing={3}>
          <Alert severity="info" icon={<QrCode2Icon />}>
            Scan the QR or copy the UPI ID below to pay <strong>{fmtAmount(total)}</strong>.
            Then click <strong>"I've Paid"</strong> to upload your confirmation screenshot.
          </Alert>

          <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
            <Typography fontWeight={700} mb={2}>Pay via UPI</Typography>
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <Box sx={{ textAlign: 'center', flexShrink: 0 }}>
                <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1, display: 'inline-block' }}>
                  <img
                    src={paymentIntent.upi_qr_data}
                    alt="UPI QR Code"
                    style={{ width: 160, height: 160, display: 'block' }}
                  />
                </Box>
                <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                  Scan with any UPI app
                </Typography>
              </Box>

              <Stack spacing={1.5} sx={{ flex: 1, minWidth: 180 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Amount</Typography>
                  <Typography fontWeight={700} fontSize={20} color="primary.main">
                    {fmtAmount(total)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Pay to UPI ID</Typography>
                  <Box><CopyText value={paymentIntent.upi_vpa} mono /></Box>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Transaction ID</Typography>
                  <Box><CopyText value={paymentIntent.transaction_id} mono /></Box>
                </Box>
              </Stack>
            </Box>
          </Paper>

          <Button fullWidth variant="contained" size="large" onClick={() => setStep(2)}>
            I've Paid — Upload Screenshot
          </Button>
        </Stack>
      )}

      {/* ── Step 1a fallback: reconciliation service unavailable ── */}
      {step === 1 && !isFree && registration?.status !== 'confirmed' && !paymentIntent && (
        <Alert severity="warning" icon={<AccountBalanceIcon />}>
          Could not connect to the payment service. Please try again or contact an admin.
        </Alert>
      )}

      {/* ── Step 2: Upload Proof ── */}
      {step === 2 && paymentIntent && (
        <Stack spacing={3}>
          <Alert severity="info">
            Upload a screenshot of your UPI payment confirmation. We'll match it against the
            society bank notification email automatically — this takes up to 30 seconds.
          </Alert>

          <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
            <Typography fontWeight={700} mb={2}>Payment Screenshot</Typography>
            <Box
              component="label"
              sx={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5,
                border: '2px dashed',
                borderColor: screenshotFile ? 'success.main' : 'divider',
                borderRadius: 2, p: 3, cursor: 'pointer',
                transition: 'border-color 0.2s',
                '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
              }}
            >
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={e => setScreenshotFile(e.target.files?.[0] ?? null)}
              />
              <UploadFileIcon sx={{ fontSize: 40, color: screenshotFile ? 'success.main' : 'text.secondary' }} />
              <Typography variant="body2" color={screenshotFile ? 'success.main' : 'text.secondary'} textAlign="center">
                {screenshotFile ? screenshotFile.name : 'Click to select screenshot (JPG, PNG, WebP)'}
              </Typography>
            </Box>
          </Paper>

          {verifying && (
            <Alert severity="info" icon={<CircularProgress size={16} />}>
              Verifying your payment against the bank email. Please wait…
            </Alert>
          )}

          <Button
            fullWidth variant="contained" size="large" color="success"
            disabled={!screenshotFile || verifying}
            onClick={handleScreenshotUpload}
          >
            {verifying
              ? <CircularProgress size={22} color="inherit" />
              : 'Submit Proof for Verification'}
          </Button>

          <Button variant="text" size="small" onClick={() => setStep(1)}>
            ← Back to QR
          </Button>
        </Stack>
      )}

      {/* ── Step 3: Done ── */}
      {step === 3 && verifyResult && (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
          {verifyResult.verdict === 'CONFIRMED' ? (
            <>
              <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
              <Typography variant="h6" fontWeight={700}>Payment Confirmed!</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 0.5 }}>
                {verifyResult.upiRef && <>UTR: <strong>{verifyResult.upiRef}</strong><br /></>}
                Redirecting to My Tickets in 3 seconds…
              </Typography>
              <Button variant="contained" sx={{ mt: 3 }}
                onClick={() => { window.location.href = '/tickets'; }}>
                View My Tickets
              </Button>
            </>
          ) : verifyResult.verdict === 'AMOUNT_MISMATCH' ? (
            <>
              <ErrorOutlineIcon sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />
              <Typography variant="h6" fontWeight={700}>Amount Mismatch</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 3 }}>
                The screenshot shows a different amount than expected (₹{verifyResult.amount}).
                An admin will review your payment and update the status shortly.
              </Typography>
              <Button variant="outlined" onClick={() => { window.location.href = '/registrations'; }}>
                View My Registrations
              </Button>
            </>
          ) : (
            <>
              <HourglassTopIcon sx={{ fontSize: 64, color: 'warning.main', mb: 2 }} />
              <Typography variant="h6" fontWeight={700}>Payment Under Review</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 3 }}>
                We couldn't automatically verify your payment right now. An admin will review
                it shortly and confirm your registration.
              </Typography>
              <Button variant="contained" onClick={() => { window.location.href = '/registrations'; }}>
                View My Registrations
              </Button>
            </>
          )}
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
