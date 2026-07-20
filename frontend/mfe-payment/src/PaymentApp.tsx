import React, { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Alert, Box, Button, Chip, CircularProgress, Container,
  Dialog, DialogContent, Divider, IconButton, Paper, Stack, Step, StepLabel,
  Stepper, TextField, Tooltip, Typography,
} from '@mui/material';
import AccountBalanceIcon  from '@mui/icons-material/AccountBalance';
import CheckCircleIcon     from '@mui/icons-material/CheckCircle';
import CloseIcon           from '@mui/icons-material/Close';
import CloudUploadIcon     from '@mui/icons-material/CloudUpload';
import ContentCopyIcon     from '@mui/icons-material/ContentCopy';
import EditIcon            from '@mui/icons-material/Edit';
import ErrorOutlineIcon    from '@mui/icons-material/ErrorOutline';
import FullscreenIcon      from '@mui/icons-material/Fullscreen';
import HourglassTopIcon    from '@mui/icons-material/HourglassTop';
import InfoOutlinedIcon    from '@mui/icons-material/InfoOutlined';
import PaymentIcon         from '@mui/icons-material/Payment';
import QrCode2Icon         from '@mui/icons-material/QrCode2';
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
  registration_id: string | null;
}

// Shape returned by POST /payments/initiate (ManualUpiAdapter) — a locally-built UPI
// intent, verified manually by an admin/committee member (no AI/reconciliation service).
interface PaymentIntentResp {
  txn_ref: string;
  payee_upi: string;
  amount: number;
  upi_intent_uri: string;
  status: string;
}

// Shape returned by POST /payments/{txn_ref}/screenshot — the screenshot plus
// whatever the AI extraction could read off it (any field may be null).
interface ScreenshotAnalysis {
  screenshot_url: string | null;
  parsed_amount: number | null;
  parsed_upi_ref: string | null;
  parsed_rrn: string | null;
  parsed_timestamp: string | null;
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

// <input type="datetime-local"> takes/returns "YYYY-MM-DDTHH:mm" with no timezone
// (interpreted as local time) — renders as 12h or 24h purely per the browser/OS
// locale, same as the datetime-local fields already used in ManageEvents.tsx.
function isoToLocalInputValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputValueToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return isNaN(d.getTime()) ? null : d.toISOString();
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
// Manual-only: a resident pays via the UPI QR/intent built from POST /payments/initiate,
// then an admin/committee member confirms the payment_transaction from the admin
// Reconciliation Console (approve/verify). There is no AI screenshot verification or
// live push here — see ReportFindings/CLAUDE.md history for the disabled auto flow.

const STEPS = ['Confirm Booking', 'Scan & Pay', 'Upload Payment Screenshot', 'Done'];

function CheckoutFlow({ token }: { token: string }) {
  const [step, setStep]               = useState(0);
  const [checkoutData, setCheckoutData] = useState<CheckoutData | null>(null);
  const [cartLoading, setCartLoading] = useState(true);
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [paymentIntent, setPaymentIntent] = useState<PaymentIntentResp | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [loading, setLoading]         = useState(false);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [uploading, setUploading]     = useState(false);
  const [analyzed, setAnalyzed]       = useState<ScreenshotAnalysis | null>(null);
  const [editing, setEditing]         = useState(false);
  const [confirming, setConfirming]   = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [reviewDatetime, setReviewDatetime] = useState('');
  const [reviewReference, setReviewReference] = useState('');
  const [reviewAmount, setReviewAmount]       = useState('');

  // Resuming an existing pending registration (from "Upload Payment" / "Re-upload" on
  // My Registrations) skips the cart entirely — go straight to the Scan & Pay step with
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
        const resumedRegistration: Registration = {
          id: reg.id, event_id: reg.event_id, event_title: reg.event_title,
          event_start_time: reg.event_start_time, event_end_time: reg.event_end_time,
          event_venue: reg.event_venue, event_is_free: reg.event_is_free,
          ticket_count: reg.ticket_count, total_amount: reg.total_amount,
          display_currency: reg.display_currency, status: reg.status,
          registered_at: reg.registered_at,
        };
        setRegistration(resumedRegistration);
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

        const intent: PaymentIntentResp = await apiFetch('/api/payments/payments/initiate', token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_id: reg.event_id, registration_id: reg.id }),
        });
        setPaymentIntent(intent);
        setStep(1);
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

      // Build a manual UPI payment intent via our own backend, which resolves this
      // event's collector UPI from committee_registry — amount is resolved
      // server-side from the registration, not trusted from the client.
      const intent: PaymentIntentResp = await apiFetch('/api/payments/payments/initiate', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: checkoutData!.eventId,
          registration_id: reg.id,
        }),
      });
      setPaymentIntent(intent);
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

    try {
      await fetch(`/api/registrations/registrations/${registration.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* best-effort — even if this fails, sending the resident back is still useful */ }
    window.location.href = `/events/${registration.event_id}`;
  }

  // ── Upload & Analyze — attaches the resident's UPI screenshot as proof to the
  // pending transaction from /initiate, then runs it through AI extraction so the
  // resident can review/correct the transaction datetime, reference number, and
  // amount before the organizer is notified (see handleConfirmDetails below).

  async function handleAnalyzeScreenshot() {
    if (!paymentIntent || !screenshotFile) return;
    setUploading(true); setError(null);
    try {
      const form = new FormData();
      form.append('file', screenshotFile);
      const res = await fetch(`/api/payments/payments/${paymentIntent.txn_ref}/screenshot`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error((b as { detail?: string }).detail ?? `HTTP ${res.status}`);
      }
      const result: ScreenshotAnalysis = await res.json();
      setAnalyzed(result);
      setReviewDatetime(isoToLocalInputValue(result.parsed_timestamp));
      setReviewReference(result.parsed_upi_ref || result.parsed_rrn || '');
      setReviewAmount(result.parsed_amount != null ? String(result.parsed_amount) : String(total));
      // Nothing usable extracted at all — start the reviewer unlocked so the
      // resident can just type the details in directly instead of "editing" blanks.
      setEditing(!result.parsed_amount && !result.parsed_upi_ref && !result.parsed_rrn && !result.parsed_timestamp);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not upload your payment screenshot.');
    } finally {
      setUploading(false);
    }
  }

  // ── Submit Payment — the resident's final confirmation of the (possibly
  // corrected) screenshot details; this is what actually notifies the organizer.

  async function handleConfirmDetails() {
    if (!paymentIntent) return;
    const referenceDigits = reviewReference.trim();
    if (!/^\d{12}$/.test(referenceDigits)) {
      setError('Reference number must be exactly 12 digits.');
      return;
    }
    const amountNum = Number(reviewAmount);
    if (!reviewAmount || isNaN(amountNum) || amountNum <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    if (!reviewDatetime) {
      setError('Enter the transaction date & time.');
      return;
    }
    setConfirming(true); setError(null);
    try {
      await apiFetch(`/api/payments/payments/${paymentIntent.txn_ref}/confirm-details`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference_number: referenceDigits,
          amount: amountNum,
          transaction_datetime: localInputValueToIso(reviewDatetime),
        }),
      });
      setStep(3);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not submit your payment details.');
    } finally {
      setConfirming(false);
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

      {/* ── Step 1: Scan & Pay ── */}
      {step === 1 && registration?.status !== 'confirmed' && paymentIntent && (
        <Stack spacing={3}>
          <Alert severity="info" icon={<QrCode2Icon />}>
            Scan the QR or copy the UPI ID below to pay <strong>{fmtAmount(total)}</strong>.
            Once you've paid, continue to upload a screenshot as proof.
          </Alert>

          <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
            <Typography fontWeight={700} mb={2}>Pay via UPI</Typography>
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <Box sx={{ textAlign: 'center', flexShrink: 0 }}>
                <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1, display: 'inline-block', bgcolor: 'common.white' }}>
                  <QRCodeSVG value={paymentIntent.upi_intent_uri} size={160} />
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
                  <Box><CopyText value={paymentIntent.payee_upi} mono /></Box>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Transaction ID</Typography>
                  <Box><CopyText value={paymentIntent.txn_ref} mono /></Box>
                </Box>
              </Stack>
            </Box>
          </Paper>

          <Button fullWidth variant="contained" size="large" onClick={() => setStep(2)}>
            I've Paid — Continue
          </Button>

          <Button fullWidth variant="text" color="error" onClick={handleCancelRegistration}>
            Cancel & choose different tickets
          </Button>
        </Stack>
      )}

      {/* ── Step 1 fallback: could not create a payment intent ── */}
      {step === 1 && !isFree && registration?.status !== 'confirmed' && !paymentIntent && (
        <Alert severity="warning" icon={<AccountBalanceIcon />}>
          Could not connect to the payment service. Please try again or contact an admin.
        </Alert>
      )}

      {/* ── Step 2a: Upload Payment Screenshot (before analysis) ── */}
      {step === 2 && paymentIntent && !analyzed && (
        <Stack spacing={3}>
          <Alert severity="info" icon={<CloudUploadIcon />}>
            Upload a screenshot of your successful payment — we'll read the transaction
            details off it automatically so you can just double-check them.
          </Alert>

          <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
            <Typography fontWeight={700} mb={1.5}>Upload Payment Screenshot</Typography>
            <Button
              component="label" variant="outlined" startIcon={<CloudUploadIcon />}
              fullWidth sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
              disabled={uploading}
            >
              {screenshotFile ? screenshotFile.name : 'Choose screenshot to upload'}
              <input
                type="file" hidden accept="image/*,.pdf"
                onChange={e => setScreenshotFile(e.target.files?.[0] ?? null)}
              />
            </Button>
            <Typography variant="caption" color="text.secondary" display="block" mt={1}>
              A screenshot of the successful UPI payment (bank/app confirmation screen).
            </Typography>
          </Paper>

          <Button
            fullWidth variant="contained" size="large"
            disabled={!screenshotFile || uploading}
            onClick={handleAnalyzeScreenshot}
          >
            {uploading
              ? <><CircularProgress size={20} color="inherit" sx={{ mr: 1.5 }} />Analyzing screenshot — this can take up to a minute…</>
              : 'Upload & Analyze'}
          </Button>

          <Button fullWidth variant="text" onClick={() => setStep(1)} disabled={uploading}>
            Back to Scan & Pay
          </Button>
        </Stack>
      )}

      {/* ── Step 2b: Review & confirm the extracted details ── */}
      {step === 2 && paymentIntent && analyzed && (
        <Stack spacing={3}>
          <Alert severity="info" icon={<InfoOutlinedIcon />}>
            Check the details below against your screenshot. They're locked by default —
            click <strong>Edit</strong> if anything looks wrong, then submit.
          </Alert>

          {analyzed.screenshot_url && (
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, position: 'relative' }}>
              <Box
                component="img"
                src={analyzed.screenshot_url}
                alt="Payment screenshot"
                sx={{ width: '100%', maxHeight: 320, objectFit: 'contain', borderRadius: 1, display: 'block' }}
              />
              <Tooltip title="View full screen">
                <IconButton
                  onClick={() => setPreviewOpen(true)}
                  sx={{
                    position: 'absolute', top: 12, right: 12,
                    bgcolor: 'rgba(0,0,0,0.55)', color: 'common.white',
                    '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' },
                  }}
                  size="small"
                >
                  <FullscreenIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Paper>
          )}

          <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography fontWeight={700}>Transaction Details</Typography>
              {!editing && (
                <Button size="small" startIcon={<EditIcon />} onClick={() => setEditing(true)}>
                  Edit
                </Button>
              )}
            </Box>
            <Stack spacing={2.5}>
              <TextField
                label="Transaction Date & Time"
                type="datetime-local"
                value={reviewDatetime}
                onChange={e => setReviewDatetime(e.target.value)}
                disabled={!editing}
                fullWidth size="small"
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Reference Number (UTR / RRN)"
                value={reviewReference}
                onChange={e => setReviewReference(e.target.value.replace(/[^0-9]/g, '').slice(0, 12))}
                disabled={!editing}
                fullWidth size="small"
                inputProps={{ inputMode: 'numeric', maxLength: 12 }}
                helperText="12-digit reference number from your bank statement/UPI app"
              />
              <TextField
                label="Amount Paid"
                type="number"
                value={reviewAmount}
                onChange={e => setReviewAmount(e.target.value)}
                disabled={!editing}
                fullWidth size="small"
                InputProps={{ startAdornment: <Typography sx={{ mr: 0.5 }}>₹</Typography> }}
              />
            </Stack>
          </Paper>

          <Button
            fullWidth variant="contained" size="large"
            disabled={confirming}
            onClick={handleConfirmDetails}
          >
            {confirming ? <CircularProgress size={22} color="inherit" /> : 'Submit Payment'}
          </Button>

          <Button
            fullWidth variant="text" disabled={confirming}
            onClick={() => {
              setAnalyzed(null); setScreenshotFile(null); setEditing(false);
              setReviewDatetime(''); setReviewReference(''); setReviewAmount('');
            }}
          >
            Re-upload a different screenshot
          </Button>
        </Stack>
      )}

      {analyzed?.screenshot_url && previewOpen && (
        <Dialog open onClose={() => setPreviewOpen(false)} maxWidth="lg" fullWidth>
          <DialogContent sx={{ p: 0, position: 'relative', bgcolor: 'common.black' }}>
            <IconButton
              onClick={() => setPreviewOpen(false)}
              sx={{ position: 'absolute', top: 8, right: 8, color: 'common.white', bgcolor: 'rgba(0,0,0,0.5)', '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' } }}
            >
              <CloseIcon />
            </IconButton>
            <Box component="img" src={analyzed.screenshot_url} alt="Payment screenshot full view" sx={{ width: '100%', display: 'block' }} />
          </DialogContent>
        </Dialog>
      )}

      {/* ── Step 3: Pending admin verification ── */}
      {step === 3 && (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
          <HourglassTopIcon sx={{ fontSize: 64, color: 'warning.main', mb: 2 }} />
          <Typography variant="h6" fontWeight={700}>Payment Submitted</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 3 }}>
            Thanks — your payment is now pending verification. An admin or committee
            member will confirm it shortly and your registration will be updated
            automatically. No further action is needed from you.
          </Typography>
          <Button variant="contained" onClick={() => { window.location.href = '/registrations'; }}>
            Go to My Registrations
          </Button>
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

  // Deep link from a notification (?txn_ref=...) — scroll to and highlight
  // the specific transaction the resident was pointed at.
  const [highlightRef] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('txn_ref'),
  );
  const highlightEl = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (highlightRef && highlightEl.current) {
      highlightEl.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightRef, txns]);

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
          <Paper key={txn.txn_ref} variant="outlined"
            ref={txn.txn_ref === highlightRef ? highlightEl : undefined}
            sx={{ p: 2.5, borderRadius: 2, ...(txn.txn_ref === highlightRef && { bgcolor: 'action.selected' }) }}>
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
              <Stack spacing={1} alignItems="flex-end">
                <StatusChip status={txn.status} />
                {txn.status === 'cancelled' && txn.registration_id && (
                  <Button
                    size="small" variant="outlined" color="error"
                    onClick={() => { window.location.href = `/checkout?registration_id=${txn.registration_id}`; }}
                  >
                    Re-upload & Retry
                  </Button>
                )}
              </Stack>
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
