import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import {
  Alert, Box, Button, Chip, CircularProgress, Container,
  Dialog, DialogContent, Divider, IconButton, Paper, Stack, Step, StepLabel,
  Stepper, TextField, Tooltip, Typography,
} from '@mui/material';
import AccountBalanceIcon  from '@mui/icons-material/AccountBalance';
import CheckCircleIcon     from '@mui/icons-material/CheckCircle';
import CloseIcon           from '@mui/icons-material/Close';
import ContentCopyIcon     from '@mui/icons-material/ContentCopy';
import ErrorOutlineIcon    from '@mui/icons-material/ErrorOutline';
import HourglassTopIcon    from '@mui/icons-material/HourglassTop';
import InfoOutlinedIcon    from '@mui/icons-material/InfoOutlined';
import OpenInFullIcon      from '@mui/icons-material/OpenInFull';
import PaymentIcon         from '@mui/icons-material/Payment';
import QrCode2Icon         from '@mui/icons-material/QrCode2';
import UploadFileIcon      from '@mui/icons-material/UploadFile';
import VerifiedIcon        from '@mui/icons-material/Verified';

// ── Constants ─────────────────────────────────────────────────────────────────

const PAY_BASE = 'https://pay.gm-global-techies-town.club';

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

interface MatchCandidate {
  transaction_id: string;
  amount: number | null;
  payer_id: string | null;
  upi_vpa: string | null;
  ctx_type: string | null;
  reference: string | null;
  created_at: string | null;
  match_score: number;
  match_signals: string[];
  auto_reconcile: boolean;
}

interface ExtractedFields {
  parse_id: string | null;
  source_type: string | null;
  extracted_amount: number | null;
  extracted_upi_ref: string | null;
  extracted_rrn: string | null;
  extracted_bank: string | null;
  extracted_timestamp: string | null;
  extracted_status: string | null;
  is_reconciled: boolean | null;
  parse_method: string | null;
  match_candidates: MatchCandidate[];
}

interface VerifyScreenshotResponse {
  verification: { verdict: string; confidence: string; message: string };
  screenshot: { amount: number | null; upi_ref: string | null };
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

// datetime-local inputs always edit/display in the browser's LOCAL time (their value
// string has no timezone in it) — but the underlying state stays UTC ISO everywhere
// else in this app, matching the frontend<->backend contract. Only this widget's
// display format is local; nothing is ever sent to the backend in local time.
function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToIso(local: string): string {
  if (!local) return '';
  const d = new Date(local);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

// Size the bank-email search window around the resident-confirmed payment date,
// since the reconciliation API has no separate "search around this date" field —
// search_days is the only lever, so widen it to cover an older payment date instead
// of always defaulting to the last 3 days. Falls back to 3 if the text doesn't parse.
function computeSearchDays(timestampText: string): number {
  const parsed = new Date(timestampText);
  if (isNaN(parsed.getTime())) return 3;
  const daysAgo = Math.ceil((Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24));
  return Math.min(14, Math.max(3, daysAgo + 1));
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
    cancelled:         { label: 'Rejected',              color: 'error',    icon: <ErrorOutlineIcon /> },
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
  const [screenshotPreviewUrl, setScreenshotPreviewUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [extracting, setExtracting]   = useState(false);
  const [extracted, setExtracted]     = useState<ExtractedFields | null>(null);
  const [reviewAmount, setReviewAmount] = useState('');
  const [reviewUpiRef, setReviewUpiRef] = useState('');
  const [reviewTimestamp, setReviewTimestamp] = useState('');
  const [reviewPayerUpi, setReviewPayerUpi] = useState('');
  const [verifying, setVerifying]     = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [loading, setLoading]         = useState(false);
  const sseAbortRef                   = useRef<AbortController | null>(null);
  // Guards against double-processing: the verify-screenshot HTTP response now
  // resolves the verdict directly (SSE is fragile as the sole source of truth —
  // a missed/late event previously left the UI spinning forever with no fallback).
  // SSE stays subscribed as a backup for a later async confirmation, so both paths
  // check this before acting.
  const resolvedRef                   = useRef(false);
  // Hard cap: if neither the direct response nor SSE resolves within 30s, give up
  // rather than let the resident sit on a spinner indefinitely.
  const verifyTimeoutRef              = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef                  = useRef<HTMLInputElement | null>(null);

  // Close SSE and cancel the verify timeout when the component unmounts
  useEffect(() => () => {
    sseAbortRef.current?.abort();
    if (verifyTimeoutRef.current) clearTimeout(verifyTimeoutRef.current);
  }, []);

  // Build/revoke an object URL for the screenshot preview as the file changes
  useEffect(() => {
    if (!screenshotFile) { setScreenshotPreviewUrl(null); return; }
    const url = URL.createObjectURL(screenshotFile);
    setScreenshotPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [screenshotFile]);

  // Auto-redirect once we have a verdict — to My Tickets when confirmed, or to My
  // Registrations when not (so the resident can retry from there once admin/committee
  // reviews it manually) — a bit longer delay so there's time to read the popup.
  useEffect(() => {
    if (!verifyResult) return;
    const confirmed = verifyResult.verdict === 'CONFIRMED';
    const delay = confirmed ? 3000 : 6000;
    const t = setTimeout(() => { window.location.href = confirmed ? '/tickets' : '/registrations'; }, delay);
    return () => clearTimeout(t);
  }, [verifyResult]);

  // Resuming an existing pending registration (from "Upload Payment" / "Re-upload" on
  // My Registrations) skips the cart entirely — go straight to the screenshot step with
  // a fresh payment intent, instead of the normal Confirm Booking → Scan & Pay flow.
  useEffect(() => {
    const resumeId = new URLSearchParams(window.location.search).get('registration_id');
    if (!resumeId) {
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
      return;
    }

    (async () => {
      try {
        const reg = await apiFetch(`/api/registrations/registrations/${resumeId}`, token);
        if (reg.status !== 'pending_payment') {
          window.location.href = '/registrations';
          return;
        }
        setRegistration({
          id: reg.id, event_id: reg.event_id, event_title: reg.event_title,
          event_start_time: reg.event_start_time, event_end_time: reg.event_end_time,
          event_venue: reg.event_venue, event_is_free: reg.event_is_free,
          ticket_count: reg.ticket_count, total_amount: reg.total_amount,
          display_currency: reg.display_currency, status: reg.status,
          registered_at: reg.registered_at,
        });
        // Synthetic single-line cart so `total`/`isFree` below still compute correctly
        // if the resident navigates back to the QR step — there's no real cart to read.
        setCheckoutData({
          eventId: reg.event_id, eventTitle: reg.event_title, eventVenue: reg.event_venue,
          eventStart: reg.event_start_time, currency: reg.display_currency,
          tickets: [{
            id: null, name: 'Ticket', qty: reg.ticket_count,
            price: Number(reg.total_amount) / (reg.ticket_count || 1),
            is_free: Number(reg.total_amount) === 0,
          }],
        });

        const intent: PaymentIntentResp = await apiFetch('/api/payments/payments/checkout-intent', token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_id: reg.event_id, registration_id: reg.id }),
        });
        setPaymentIntent(intent);
        openSse(intent.transaction_id);
        setStep(2);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not resume this registration.');
      } finally {
        setCartLoading(false);
      }
    })();
  }, [token]);

  if (cartLoading) return (
    <Container maxWidth="sm" sx={{ pt: 8, textAlign: 'center' }}><CircularProgress /></Container>
  );

  if (!checkoutData) return (
    <Container maxWidth="sm" sx={{ pt: 6, textAlign: 'center' }}>
      <Typography variant="h6" color="text.secondary">{error ?? 'No active cart found.'}</Typography>
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

      // Create payment intent via our own backend, which resolves this event's
      // collector UPI from committee_registry before calling the centralized
      // reconciliation service — amount is also resolved server-side from the
      // registration, not trusted from the client.
      const intent: PaymentIntentResp = await apiFetch('/api/payments/payments/checkout-intent', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: checkoutData!.eventId,
          registration_id: reg.id,
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

  // ── Cancel the still-unpaid registration and go pick different tickets ──────

  async function handleCancelRegistration() {
    if (!registration) return;
    if (!window.confirm('Cancel this registration and choose different tickets? You have not paid yet, so this is safe.')) return;

    sseAbortRef.current?.abort();
    try {
      await fetch(`/api/registrations/registrations/${registration.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* best-effort — even if this fails, sending the resident back is still useful */ }
    window.location.href = `/events/${registration.event_id}`;
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
        if (resolvedRef.current) return; // already resolved via the direct HTTP response
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

        resolvedRef.current = true;
        clearVerifyTimeout();
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

  function clearVerifyTimeout() {
    if (verifyTimeoutRef.current) { clearTimeout(verifyTimeoutRef.current); verifyTimeoutRef.current = null; }
  }

  async function markTicketPurchased(result: VerifyResult) {
    if (!registration || !paymentIntent) {
      // Should be impossible on this code path (both are set before Step 2 renders
      // at all) — logged loudly because a silent return here previously looked
      // identical to a successful confirm: reconciliation succeeds server-side,
      // but nothing ever marks the local registration/payment_transaction as paid.
      console.error('markTicketPurchased: missing registration or paymentIntent', {
        hasRegistration: !!registration, hasPaymentIntent: !!paymentIntent, result,
      });
      return;
    }
    clearVerifyTimeout();

    // The reconciliation service has already confirmed this payment by the time we get
    // here — this call just mirrors that into our own DB (registration + payment_transaction).
    // It used to be a single best-effort attempt with a silently swallowed failure, which
    // left registrations permanently stuck 'pending_payment' with no visible error anywhere
    // even though the resident's money was matched. Retry a few times before giving up.
    const body = JSON.stringify({
      event_id:              registration.event_id,
      registration_id:       registration.id,
      reconciliation_txn_id: paymentIntent.transaction_id,
      upi_ref:               result.upiRef ?? 'RECONCILED',
      amount:                result.amount ?? paymentIntent.amount,
      payer_upi:             reviewPayerUpi.trim() || null,
    });

    const attempts = 3;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await apiFetch('/api/payments/payments/auto-confirm', token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        break;
      } catch (e: unknown) {
        console.error(`auto-confirm attempt ${attempt}/${attempts} failed:`, e);
        if (attempt === attempts) {
          // Backend reconciliation is real regardless — still show the resident their
          // confirmed payment below. This registration is now the kind of stuck-pending
          // row an admin can repair via POST /payments/{txn_ref}/sync-reconciliation.
          break;
        }
        await new Promise(res => setTimeout(res, attempt * 1000));
      }
    }

    sseAbortRef.current?.abort();
    setVerifyResult(result);
    setVerifying(false);
    setStep(3);
  }

  // ── Step 2: Select screenshot → extract details for review ──────────────────

  async function handleFileSelect(file: File | null) {
    setScreenshotFile(file);
    setExtracted(null);
    setReviewAmount('');
    setReviewUpiRef('');
    setReviewTimestamp('');
    if (!file) return;

    setExtracting(true); setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const result: ExtractedFields = await apiFetch('/api/payments/payments/parse-screenshot', token, {
        method: 'POST',
        body: fd,
      });
      setExtracted(result);
      setReviewAmount(result.extracted_amount != null ? String(result.extracted_amount) : '');
      setReviewUpiRef(result.extracted_upi_ref || result.extracted_rrn || '');
      setReviewTimestamp(result.extracted_timestamp ?? '');
    } catch (e: unknown) {
      // Non-fatal — the resident can still fill the fields in manually below.
      setExtracted({
        parse_id: null, source_type: null, extracted_amount: null, extracted_upi_ref: null,
        extracted_rrn: null, extracted_bank: null, extracted_timestamp: null,
        extracted_status: null, is_reconciled: null, parse_method: 'failed', match_candidates: [],
      });
    } finally {
      setExtracting(false);
    }
  }

  // ── Step 2: Submit for verification (using the reviewed/corrected fields) ───

  async function handleScreenshotUpload() {
    if (!screenshotFile || !paymentIntent || !registration) return;
    resolvedRef.current = false;
    setVerifying(true); setError(null);

    clearVerifyTimeout();
    // This has to stay longer than every layer verify-screenshot's own request can take
    // to actually finish (nginx's proxy_read_timeout for /api/payments/ is 120s; the
    // reconciliation service's AI extraction chain alone has been measured up to ~90s on
    // this box's CPU-bound Ollama). 30s was firing on almost every real request — the
    // backend would go on to genuinely reconcile the payment a minute later, but by then
    // resolvedRef.current was already true, so that real CONFIRMED response got silently
    // discarded below and auto-confirm was never called even though reconciliation
    // actually succeeded. This is the single biggest cause of registrations stuck
    // 'pending_payment' despite a successful backend reconciliation.
    verifyTimeoutRef.current = setTimeout(() => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      sseAbortRef.current?.abort();
      setVerifyResult({ verdict: 'TIMEOUT', confidence: '', upiRef: null, amount: null });
      setVerifying(false);
      setStep(3);
    }, 130000);

    const fd = new FormData();
    fd.append('file', screenshotFile);
    fd.append('event_id', registration.event_id);
    fd.append('registration_id', registration.id);
    fd.append('txn_id', paymentIntent.transaction_id);
    fd.append('search_days', String(computeSearchDays(reviewTimestamp)));
    if (reviewUpiRef.trim()) fd.append('manual_upi_ref', reviewUpiRef.trim());
    if (reviewAmount.trim()) fd.append('manual_amount', reviewAmount.trim());
    if (reviewPayerUpi.trim()) fd.append('payer_upi', reviewPayerUpi.trim());

    try {
      // Resolve the verdict directly from this response instead of waiting on SSE —
      // a missed or late SSE event previously left the UI spinning forever with no
      // fallback, even though this same response already carries the answer.
      const resp: VerifyScreenshotResponse = await apiFetch('/api/payments/payments/verify-screenshot', token, {
        method: 'POST',
        body: fd,
      });
      if (resolvedRef.current) return; // SSE or the 30s timeout beat us to it
      resolvedRef.current = true;
      clearVerifyTimeout();

      const result: VerifyResult = {
        verdict:    resp.verification?.verdict ?? 'PENDING',
        confidence: resp.verification?.confidence ?? '',
        upiRef:     resp.screenshot?.upi_ref ?? null,
        amount:     resp.screenshot?.amount ?? null,
      };

      if (result.verdict === 'CONFIRMED') {
        await markTicketPurchased(result);
      } else {
        sseAbortRef.current?.abort();
        setVerifyResult(result);
        setVerifying(false);
        setStep(3);
      }
    } catch (e: unknown) {
      if (resolvedRef.current) return; // already timed out / resolved by SSE
      resolvedRef.current = true;
      clearVerifyTimeout();
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

          <Button fullWidth variant="text" color="error" onClick={handleCancelRegistration}>
            Cancel & choose different tickets
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
                borderRadius: 2, p: 3,
                cursor: verifying ? 'not-allowed' : 'pointer',
                opacity: verifying ? 0.6 : 1,
                pointerEvents: verifying ? 'none' : 'auto',
                transition: 'border-color 0.2s',
                '&:hover': { borderColor: verifying ? undefined : 'primary.main', bgcolor: verifying ? undefined : 'action.hover' },
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                disabled={verifying}
                onChange={e => void handleFileSelect(e.target.files?.[0] ?? null)}
              />
              {screenshotFile && screenshotPreviewUrl ? (
                <Box sx={{ width: '100%', textAlign: 'center' }}>
                  <Box sx={{ position: 'relative', display: 'inline-block' }}>
                    <Box
                      component="img"
                      src={screenshotPreviewUrl}
                      alt="Screenshot preview"
                      sx={{ maxWidth: '100%', maxHeight: 220, borderRadius: 1, display: 'block' }}
                    />
                    <IconButton
                      size="small"
                      onClick={e => { e.preventDefault(); e.stopPropagation(); setPreviewOpen(true); }}
                      sx={{ position: 'absolute', top: 4, right: 4, bgcolor: 'background.paper', boxShadow: 1, '&:hover': { bgcolor: 'background.paper' } }}
                    >
                      <OpenInFullIcon fontSize="small" />
                    </IconButton>
                  </Box>
                  <Typography variant="body2" color="success.main" textAlign="center" mt={1}>
                    {screenshotFile.name}
                  </Typography>
                  <Button
                    size="small" variant="outlined" startIcon={<UploadFileIcon fontSize="small" />}
                    disabled={extracting || verifying}
                    onClick={e => { e.preventDefault(); e.stopPropagation(); fileInputRef.current?.click(); }}
                    sx={{ mt: 1.5 }}
                  >
                    Re-upload Screenshot
                  </Button>
                </Box>
              ) : (
                <>
                  <UploadFileIcon sx={{ fontSize: 40, color: 'text.secondary' }} />
                  <Typography variant="body2" color="text.secondary" textAlign="center">
                    Click to select screenshot (JPG, PNG, WebP)
                  </Typography>
                </>
              )}
            </Box>
          </Paper>

          {extracting && (
            <Alert severity="info" icon={<CircularProgress size={16} />}>
              Reading your screenshot…
            </Alert>
          )}

          {extracted && !extracting && (
            <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
              <Typography fontWeight={700} mb={1}>Review Extracted Details</Typography>
              <Typography variant="caption" color="text.secondary" display="block" mb={2}>
                AI-read from your screenshot — double-check these match your payment before submitting,
                and correct anything that looks wrong.
              </Typography>

              {extracted.parse_method === 'failed' && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  Couldn't automatically read this screenshot. Please fill in the amount and UTR/reference number manually.
                </Alert>
              )}

              {extracted.match_candidates.length > 0
                && paymentIntent
                && !extracted.match_candidates.some(c => c.transaction_id === paymentIntent.transaction_id) && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  This screenshot looks like it might belong to a different payment
                  ({extracted.match_candidates[0].reference ?? 'another transaction'}
                  {extracted.match_candidates[0].amount != null && ` · ${fmtAmount(extracted.match_candidates[0].amount)}`}).
                  Make sure you uploaded the screenshot for <strong>this</strong> booking.
                </Alert>
              )}

              <Stack spacing={2}>
                <TextField
                  label="Amount Paid (₹)" size="small" fullWidth type="number" required
                  value={reviewAmount} onChange={e => setReviewAmount(e.target.value)} disabled={verifying}
                />
                <TextField
                  label="UTR / Transaction Reference" size="small" fullWidth required
                  value={reviewUpiRef} onChange={e => setReviewUpiRef(e.target.value)} disabled={verifying}
                  helperText="The 12-digit UPI reference number from your payment app"
                />
                <TextField
                  label="Payment Date & Time (optional)" size="small" fullWidth
                  type="datetime-local"
                  InputLabelProps={{ shrink: true }}
                  value={isoToDatetimeLocal(reviewTimestamp)}
                  onChange={e => setReviewTimestamp(datetimeLocalToIso(e.target.value))}
                  disabled={verifying}
                  helperText="Shown in your local time — as shown on your screenshot, used to widen the bank-email search if the payment wasn't made today"
                />
                <TextField
                  label="Your UPI ID (optional)" size="small" fullWidth
                  value={reviewPayerUpi} onChange={e => setReviewPayerUpi(e.target.value)} disabled={verifying}
                  placeholder="e.g. yourname@okhdfcbank"
                  helperText="The UPI ID you paid FROM — not auto-extracted, enter it yourself for the payment record"
                />
                {(extracted.extracted_bank || extracted.extracted_status) && (
                  <Typography variant="caption" color="text.secondary">
                    {extracted.extracted_bank && <>Bank: {extracted.extracted_bank}</>}
                    {extracted.extracted_bank && extracted.extracted_status && ' · '}
                    {extracted.extracted_status && <>Status: {extracted.extracted_status}</>}
                  </Typography>
                )}
              </Stack>
            </Paper>
          )}

          {verifying && (
            <Alert severity="info" icon={<CircularProgress size={16} />}>
              Verifying your payment against the bank email. This can take up to 2 minutes —
              please keep this tab open and don't refresh.
            </Alert>
          )}

          <Button
            fullWidth variant="contained" size="large" color="success"
            disabled={!screenshotFile || extracting || verifying
              || !reviewAmount.trim() || !reviewUpiRef.trim()}
            onClick={handleScreenshotUpload}
          >
            {verifying
              ? <CircularProgress size={22} color="inherit" />
              : 'Submit Proof for Verification'}
          </Button>

          <Button variant="text" size="small" disabled={verifying} onClick={() => setStep(1)}>
            ← Back to QR
          </Button>
        </Stack>
      )}

      {/* ── Step 3: Done ── */}
      {step === 3 && verifyResult?.verdict === 'CONFIRMED' && (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
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
        </Paper>
      )}

      {/* ── Not auto-confirmed: apologetic popup, no retry — admin/committee reviews manually ── */}
      <Dialog open={step === 3 && !!verifyResult && verifyResult.verdict !== 'CONFIRMED'} maxWidth="xs" fullWidth>
        <DialogContent sx={{ textAlign: 'center', p: 4 }}>
          <HourglassTopIcon sx={{ fontSize: 56, color: 'warning.main', mb: 2 }} />
          <Typography variant="h6" fontWeight={700}>We're Sorry for the Inconvenience</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, mb: 3 }}>
            We couldn't automatically verify your payment just now, but please don't worry —
            your screenshot has been saved, and an admin or committee member will manually
            review it and mark your payment as paid shortly. No further action is needed from you.
          </Typography>
          <Button variant="contained" onClick={() => { window.location.href = '/registrations'; }}>
            Go to My Registrations
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="md" fullWidth>
        <DialogContent sx={{ p: 0, position: 'relative', bgcolor: 'common.black' }}>
          <IconButton
            onClick={() => setPreviewOpen(false)}
            sx={{ position: 'absolute', top: 8, right: 8, color: 'common.white', bgcolor: 'rgba(0,0,0,0.5)', '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' } }}
          >
            <CloseIcon />
          </IconButton>
          {screenshotPreviewUrl && (
            <Box component="img" src={screenshotPreviewUrl} alt="Screenshot full view" sx={{ width: '100%', display: 'block' }} />
          )}
        </DialogContent>
      </Dialog>
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
      const data: Transaction[] = await apiFetch('/api/payments/payments/my', token);
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
