import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Container,
  Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, Paper, Stack, TextField, Typography,
} from '@mui/material';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CheckCircleIcon    from '@mui/icons-material/CheckCircle';
import CloseIcon          from '@mui/icons-material/Close';
import ContentCopyIcon    from '@mui/icons-material/ContentCopy';
import OpenInFullIcon     from '@mui/icons-material/OpenInFull';
import QrCode2Icon        from '@mui/icons-material/QrCode2';
import UploadFileIcon     from '@mui/icons-material/UploadFile';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RefundTask {
  id: string; txn_ref: string; event_id: string; event_title: string;
  amount: number; currency: string;
  payer_upi: string | null; payee_upi: string | null; refund_upi_id: string | null;
  reconciliation_txn_id: string | null;
  status: string; created_at: string; updated_at: string;
  user_name?: string; user_email?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// datetime-local inputs always edit/display in the browser's LOCAL time (their value
// string has no timezone in it) — but the underlying state stays UTC ISO everywhere
// else, matching the frontend<->backend contract. Only this widget's display format
// is local; refund_timestamp is still sent to the backend as UTC ISO.
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

// Size the bank-email search window around the reviewed refund transfer date, same
// reasoning as the resident checkout flow's computeSearchDays — the reconciliation
// API has no separate "search around this date" field, search_days is the only
// lever. Falls back to 3 if the text doesn't parse.
function computeSearchDays(timestampText: string): number {
  const parsed = new Date(timestampText);
  if (isNaN(parsed.getTime())) return 3;
  const daysAgo = Math.ceil((Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24));
  return Math.min(14, Math.max(3, daysAgo + 1));
}

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

function CopyText({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <Typography fontFamily="monospace" fontWeight={700} component="span">{value}</Typography>
      <IconButton size="small" onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true); setTimeout(() => setCopied(false), 2000);
      }}>
        {copied
          ? <CheckCircleIcon sx={{ fontSize: 14, color: 'success.main' }} />
          : <ContentCopyIcon sx={{ fontSize: 14 }} />}
      </IconButton>
    </Box>
  );
}

function refundDestination(task: RefundTask): string | null {
  return task.refund_upi_id || task.payer_upi;
}

// ── Refund QR dialog ──────────────────────────────────────────────────────────
// Scan with your own UPI app instead of hand-copying the UPI ID and retyping
// the amount — the QR pre-fills payee, amount, and a reference note.

function RefundQrDialog({ task, token, onClose }: { task: RefundTask; token: string; onClose: () => void }) {
  const [imgUrl, setImgUrl]   = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    fetch(`/api/payments/refunds/${task.txn_ref}/qr`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async res => {
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          throw new Error(b.detail ?? `HTTP ${res.status}`);
        }
        return res.blob();
      })
      .then(blob => { objectUrl = URL.createObjectURL(blob); setImgUrl(objectUrl); })
      .catch((e: Error) => setError(e.message));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [task.txn_ref, token]);

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Scan to Pay Refund
        <IconButton size="small" onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ textAlign: 'center' }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {!error && !imgUrl && <CircularProgress sx={{ my: 4 }} />}
        {imgUrl && (
          <Box component="img" src={imgUrl} alt="Refund UPI QR"
            sx={{ width: '100%', maxWidth: 280, bgcolor: 'common.white', p: 1, borderRadius: 1 }} />
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Scan with any UPI app to pay ₹{Number(task.amount).toLocaleString('en-IN')} to{' '}
          <strong>{refundDestination(task)}</strong>, then log the UTR to close this task.
        </Typography>
      </DialogContent>
    </Dialog>
  );
}

// ── Complete Refund Dialog ────────────────────────────────────────────────────

interface VerifyScreenshotResult {
  verification?: { verdict: string; confidence: string; message: string };
  screenshot?: { amount: number | null; upi_ref: string | null; rrn: string | null };
  reconcile?: { new_status: string; refund_ref_id: string | null } | null;
  local_status?: string;
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

function CompleteDialog({
  task, token, onClose, onDone,
}: {
  task: RefundTask; token: string; onClose: () => void; onDone: (message: string) => void;
}) {
  // AI-verified screenshot mode is only possible when the original payment went
  // through the centralized reconciliation flow (has a reconciliation_txn_id) —
  // that's what the other side's refund check is keyed on.
  const canVerifyByScreenshot = !!task.reconciliation_txn_id;
  const [mode, setMode] = useState<'screenshot' | 'manual'>(canVerifyByScreenshot ? 'screenshot' : 'manual');

  const [refundUtr, setRefundUtr]     = useState('');
  const [screenshotFile, setScreenshotFile]       = useState<File | null>(null);
  const [screenshotPreviewUrl, setScreenshotPreviewUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [extracting, setExtracting]   = useState(false);
  const [extracted, setExtracted]     = useState<ExtractedFields | null>(null);
  const [reviewAmount, setReviewAmount] = useState('');
  const [reviewRef, setReviewRef]     = useState('');
  const [reviewTimestamp, setReviewTimestamp] = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [qrOpen, setQrOpen]           = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyScreenshotResult | null>(null);

  // Build/revoke an object URL for the screenshot preview as the file changes —
  // same pattern as the resident checkout flow's screenshot preview.
  useEffect(() => {
    if (!screenshotFile) { setScreenshotPreviewUrl(null); return; }
    const url = URL.createObjectURL(screenshotFile);
    setScreenshotPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [screenshotFile]);

  async function handleFileSelect(file: File | null) {
    setScreenshotFile(file);
    setExtracted(null);
    setReviewAmount('');
    setReviewRef('');
    setReviewTimestamp('');
    setVerifyResult(null);
    if (!file) return;

    setExtracting(true); setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const result: ExtractedFields = await apiFetch('/api/payments/payments/parse-screenshot', token, {
        method: 'POST', body: fd,
      });
      setExtracted(result);
      setReviewAmount(result.extracted_amount != null ? String(result.extracted_amount) : '');
      setReviewRef(result.extracted_upi_ref || result.extracted_rrn || '');
      setReviewTimestamp(result.extracted_timestamp ?? '');
    } catch {
      // Non-fatal — admin can still fill amount/reference in manually below.
      setExtracted({
        parse_id: null, source_type: null, extracted_amount: null, extracted_upi_ref: null,
        extracted_rrn: null, extracted_bank: null, extracted_timestamp: null,
        extracted_status: null, is_reconciled: null, parse_method: 'failed', match_candidates: [],
      });
    } finally {
      setExtracting(false);
    }
  }

  async function submitManual() {
    if (!refundUtr.trim()) { setError('Refund UTR is required.'); return; }
    setLoading(true); setError(null);
    try {
      await apiFetch(`/api/payments/refunds/${task.txn_ref}/complete`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refund_utr: refundUtr.trim() }),
      });
      onDone(`Refund of ₹${Number(task.amount).toLocaleString('en-IN')} for ${task.event_title} marked as complete.`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  async function submitScreenshot() {
    if (!screenshotFile) { setError('Choose a screenshot of the refund transfer first.'); return; }
    setLoading(true); setError(null); setVerifyResult(null);
    try {
      const fd = new FormData();
      fd.append('file', screenshotFile);
      if (reviewRef.trim()) fd.append('manual_upi_ref', reviewRef.trim());
      if (reviewAmount.trim()) fd.append('manual_amount', reviewAmount.trim());
      if (reviewTimestamp.trim()) fd.append('refund_timestamp', reviewTimestamp.trim());
      fd.append('search_days', String(computeSearchDays(reviewTimestamp)));
      const result: VerifyScreenshotResult = await apiFetch(
        `/api/payments/refunds/${task.txn_ref}/verify-screenshot`, token, { method: 'POST', body: fd },
      );
      setVerifyResult(result);
      if (result.local_status === 'refunded') {
        onDone(`Refund of ₹${Number(task.amount).toLocaleString('en-IN')} for ${task.event_title} verified and completed.`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Complete Refund
        <IconButton size="small" onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Stack spacing={2} mb={2}>
          <Box>
            <Typography variant="caption" color="text.secondary">Event</Typography>
            <Typography fontWeight={600}>{task.event_title}</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {task.user_name && (
              <Box>
                <Typography variant="caption" color="text.secondary">Resident</Typography>
                <Typography fontWeight={600}>{task.user_name}</Typography>
                {task.user_email && <Typography variant="caption" color="text.secondary">{task.user_email}</Typography>}
              </Box>
            )}
            <Box>
              <Typography variant="caption" color="text.secondary">Refund Amount</Typography>
              <Typography fontWeight={700} color="error.main" fontSize={18}>
                ₹{Number(task.amount).toLocaleString('en-IN')}
              </Typography>
            </Box>
          </Box>

          {refundDestination(task) && (
            <Box sx={{ p: 2, bgcolor: 'warning.50', border: '1px solid', borderColor: 'warning.200', borderRadius: 1 }}>
              <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                Send refund to this UPI ID
                {task.refund_upi_id ? ' (given by resident at cancellation)' : ' (from their original payment)'}
              </Typography>
              <CopyText value={refundDestination(task)!} />
            </Box>
          )}

          <Alert severity="info" sx={{ fontSize: 12 }}>
            Transfer ₹{Number(task.amount).toLocaleString('en-IN')} to <strong>{refundDestination(task)}</strong> using
            your banking app (or scan the QR below).
          </Alert>

          {refundDestination(task) && (
            <Button size="small" variant="outlined" startIcon={<QrCode2Icon />}
              onClick={() => setQrOpen(true)} sx={{ alignSelf: 'flex-start' }}>
              Show UPI QR
            </Button>
          )}
        </Stack>

        {canVerifyByScreenshot && (
          <Stack direction="row" spacing={1} mb={2}>
            <Button size="small" variant={mode === 'screenshot' ? 'contained' : 'outlined'}
              onClick={() => { setMode('screenshot'); setError(null); }}>
              Upload Screenshot (AI-verified)
            </Button>
            <Button size="small" variant={mode === 'manual' ? 'contained' : 'outlined'}
              onClick={() => { setMode('manual'); setError(null); }}>
              Enter UTR manually
            </Button>
          </Stack>
        )}

        {mode === 'screenshot' && canVerifyByScreenshot ? (
          <Stack spacing={1.5}>
            <Typography variant="body2" color="text.secondary">
              After sending the refund, upload a screenshot of that transfer. The same AI
              extraction + bank-email matching used to verify incoming payments checks it —
              on a confirmed match this refund is closed out automatically, no UTR typing needed.
            </Typography>

            <Box
              component="label"
              sx={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5,
                border: '2px dashed', borderColor: screenshotFile ? 'success.main' : 'divider',
                borderRadius: 2, p: 3,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                pointerEvents: loading ? 'none' : 'auto',
                '&:hover': { borderColor: loading ? undefined : 'primary.main', bgcolor: loading ? undefined : 'action.hover' },
              }}
            >
              <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={loading}
                onChange={e => void handleFileSelect(e.target.files?.[0] ?? null)} />
              {screenshotFile && screenshotPreviewUrl ? (
                <Box sx={{ width: '100%', textAlign: 'center' }}>
                  <Box sx={{ position: 'relative', display: 'inline-block' }}>
                    <Box component="img" src={screenshotPreviewUrl} alt="Refund screenshot preview"
                      sx={{ maxWidth: '100%', maxHeight: 200, borderRadius: 1, display: 'block' }} />
                    <IconButton size="small"
                      onClick={e => { e.preventDefault(); e.stopPropagation(); setPreviewOpen(true); }}
                      sx={{ position: 'absolute', top: 4, right: 4, bgcolor: 'background.paper', boxShadow: 1, '&:hover': { bgcolor: 'background.paper' } }}>
                      <OpenInFullIcon fontSize="small" />
                    </IconButton>
                  </Box>
                  <Typography variant="body2" color="success.main" mt={1}>{screenshotFile.name}</Typography>
                </Box>
              ) : (
                <>
                  <UploadFileIcon sx={{ fontSize: 36, color: 'text.secondary' }} />
                  <Typography variant="body2" color="text.secondary">Click to select screenshot</Typography>
                </>
              )}
            </Box>

            {extracting && (
              <Alert severity="info" icon={<CircularProgress size={16} />}>Reading screenshot…</Alert>
            )}

            {extracted && !extracting && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography fontWeight={700} fontSize={14} mb={0.5}>Review Extracted Details</Typography>
                <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
                  AI-read from the screenshot — correct anything that looks wrong before verifying.
                </Typography>
                {extracted.parse_method === 'failed' && (
                  <Alert severity="warning" sx={{ mb: 1.5, fontSize: 12 }}>
                    Couldn't automatically read this screenshot. Fill in the amount and UTR/RRN manually.
                  </Alert>
                )}
                {extracted.match_candidates.length > 0
                  && task.reconciliation_txn_id
                  && !extracted.match_candidates.some(c => c.transaction_id === task.reconciliation_txn_id) && (
                  <Alert severity="warning" sx={{ mb: 1.5, fontSize: 12 }}>
                    This screenshot looks like it might belong to a different payment
                    ({extracted.match_candidates[0].reference ?? 'another transaction'}
                    {extracted.match_candidates[0].amount != null && ` · ₹${extracted.match_candidates[0].amount}`}).
                    Double-check it's the transfer for this refund.
                  </Alert>
                )}
                <Stack spacing={1.5}>
                  <TextField
                    label="Refund Amount (₹)" size="small" fullWidth type="number"
                    value={reviewAmount} onChange={e => setReviewAmount(e.target.value)} disabled={loading}
                  />
                  <TextField
                    label="UTR / RRN" size="small" fullWidth
                    value={reviewRef} onChange={e => setReviewRef(e.target.value)} disabled={loading}
                    helperText="Whichever the app labeled it — UTR or RRN, same kind of reference number"
                  />
                  <TextField
                    label="Refund Transaction Date & Time" size="small" fullWidth
                    type="datetime-local"
                    InputLabelProps={{ shrink: true }}
                    value={isoToDatetimeLocal(reviewTimestamp)}
                    onChange={e => setReviewTimestamp(datetimeLocalToIso(e.target.value))}
                    disabled={loading}
                    helperText="Shown in your local time — as shown on the screenshot, narrows the bank-email search window instead of the default last-3-days"
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

            {loading && (
              <Alert severity="info" icon={<CircularProgress size={16} />}>
                Verifying against the bank email. This can take up to 2 minutes — please wait.
              </Alert>
            )}
            {verifyResult && verifyResult.local_status !== 'refunded' && (
              <Alert severity={verifyResult.verification?.verdict === 'CONFIRMED' ? 'warning' : 'error'}>
                <strong>{verifyResult.verification?.verdict ?? 'Not confirmed'}:</strong>{' '}
                {verifyResult.verification?.message ?? 'Could not verify this screenshot — try again or enter the UTR manually.'}
              </Alert>
            )}
          </Stack>
        ) : (
          <TextField
            label="Refund UTR / Transaction Reference"
            value={refundUtr} onChange={e => setRefundUtr(e.target.value)}
            fullWidth size="small" autoFocus
            placeholder="e.g. 123456789012"
            helperText="Enter the UTR from your bank after sending the refund"
          />
        )}
      </DialogContent>
      {qrOpen && <RefundQrDialog task={task} token={token} onClose={() => setQrOpen(false)} />}
      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="md" fullWidth>
        <DialogContent sx={{ p: 0, position: 'relative', bgcolor: 'common.black' }}>
          <IconButton onClick={() => setPreviewOpen(false)}
            sx={{ position: 'absolute', top: 8, right: 8, color: 'common.white', bgcolor: 'rgba(0,0,0,0.5)', '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' } }}>
            <CloseIcon />
          </IconButton>
          {screenshotPreviewUrl && (
            <Box component="img" src={screenshotPreviewUrl} alt="Screenshot full view" sx={{ width: '100%', display: 'block' }} />
          )}
        </DialogContent>
      </Dialog>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        {mode === 'screenshot' && canVerifyByScreenshot ? (
          <Button variant="contained" color="error" disabled={loading || !screenshotFile} onClick={submitScreenshot}>
            {loading ? <CircularProgress size={18} color="inherit" /> : 'Verify & Complete'}
          </Button>
        ) : (
          <Button variant="contained" color="error" disabled={loading} onClick={submitManual}>
            {loading ? <CircularProgress size={18} color="inherit" /> : 'Mark as Refunded'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function RefundTasks({ token }: { token?: string | null }) {
  const [tasks, setTasks]       = useState<RefundTask[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [notice, setNotice]     = useState<string | null>(null);
  const [completing, setCompleting] = useState<RefundTask | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data: RefundTask[] = await apiFetch('/api/payments/refunds', token);
      setTasks(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (!token) return <Box sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">Not authenticated.</Typography></Box>;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h5" fontWeight={800} mb={0.5}>Refund Tasks</Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Manually transfer money to the resident's UPI ID, then log the refund UTR to close each task.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice(null)}>{notice}</Alert>}

      {loading
        ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
        : (
          <Stack spacing={1.5}>
            {tasks.length === 0 && (
              <Box textAlign="center" py={8}>
                <AccountBalanceIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                <Typography color="text.secondary">No pending refund tasks.</Typography>
              </Box>
            )}
            {tasks.map(task => (
              <Paper key={task.txn_ref} variant="outlined" sx={{ p: 2.5, borderRadius: 2, borderColor: 'error.200' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
                  <Box sx={{ flex: 1, minWidth: 200 }}>
                    <Typography fontWeight={700}>{task.event_title}</Typography>
                    {task.user_name && (
                      <Typography variant="body2" color="text.secondary">
                        {task.user_name}{task.user_email ? ` · ${task.user_email}` : ''}
                      </Typography>
                    )}
                    <Box sx={{ display: 'flex', gap: 2, mt: 0.5, flexWrap: 'wrap' }}>
                      <Typography variant="body2" fontWeight={700} color="error.main">
                        ₹{Number(task.amount).toLocaleString('en-IN')}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        TXN: {task.txn_ref}
                      </Typography>
                    </Box>
                    {refundDestination(task) && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">Refund to:</Typography>
                        <CopyText value={refundDestination(task)!} />
                      </Box>
                    )}
                    <Typography variant="caption" color="text.secondary">
                      Requested {fmtDate(task.updated_at)}
                    </Typography>
                  </Box>

                  <Button
                    variant="contained" color="error" size="small"
                    onClick={() => setCompleting(task)}
                  >
                    Complete Refund
                  </Button>
                </Box>
              </Paper>
            ))}
          </Stack>
        )}

      {completing && (
        <CompleteDialog
          task={completing} token={token}
          onClose={() => setCompleting(null)}
          onDone={message => { setCompleting(null); setNotice(message); load(); }}
        />
      )}
    </Container>
  );
}
