import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Container,
  Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CheckCircleIcon    from '@mui/icons-material/CheckCircle';
import CloseIcon          from '@mui/icons-material/Close';
import CloudUploadIcon    from '@mui/icons-material/CloudUpload';
import ContentCopyIcon    from '@mui/icons-material/ContentCopy';
import EditIcon           from '@mui/icons-material/Edit';
import FullscreenIcon     from '@mui/icons-material/Fullscreen';
import QrCode2Icon        from '@mui/icons-material/QrCode2';

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

// <input type="datetime-local"> takes/returns "YYYY-MM-DDTHH:mm" with no timezone
// (interpreted as local time) — same helper used for the resident checkout review step.
function isoToLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
// Manual-only: admin transfers the refund via UPI (QR or hand-copied ID), uploads a
// screenshot of that transfer, then explicitly clicks Analyze to run the same
// best-effort AI extraction as the resident checkout flow. Extracted fields land in
// a locked review form (unlock via the Edit icon) — no bank-email cross-check, no
// auto-completion, admin still confirms every field before submitting.

function CompleteDialog({
  task, token, onClose, onDone,
}: {
  task: RefundTask; token: string; onClose: () => void; onDone: (message: string) => void;
}) {
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl]   = useState<string | null>(null);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const [analyzing, setAnalyzing]     = useState(false);
  const [analyzed, setAnalyzed]       = useState(false);
  const [editing, setEditing]         = useState(false);
  const [refundUtr, setRefundUtr]     = useState('');
  const [reviewDatetime, setReviewDatetime] = useState('');
  const [reviewAmount, setReviewAmount]     = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [qrOpen, setQrOpen]           = useState(false);

  // Revokes the outgoing object URL whenever a new one is set (or on unmount) —
  // handleFileChange only ever creates the new URL, this is the single place that frees it.
  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  function handleFileChange(file: File | null) {
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
    setScreenshotFile(file);
    setAnalyzed(false);
    setEditing(false);
    setRefundUtr('');
    setReviewDatetime('');
    setReviewAmount('');
    setError(null);
  }

  async function handleAnalyze() {
    if (!screenshotFile) return;
    setAnalyzing(true); setError(null);
    try {
      const form = new FormData();
      form.append('file', screenshotFile);
      const result = await apiFetch(`/api/payments/refunds/${task.txn_ref}/extract-screenshot`, token, {
        method: 'POST',
        body: form,
      });
      const ref = result.parsed_upi_ref || result.parsed_rrn;
      setRefundUtr(ref || '');
      setReviewDatetime(isoToLocalInputValue(result.parsed_timestamp));
      setReviewAmount(result.parsed_amount != null ? String(result.parsed_amount) : String(task.amount));
      setAnalyzed(true);
      // Nothing usable extracted at all — start the reviewer unlocked so the admin
      // can just type the details in directly instead of "editing" blanks.
      setEditing(!ref && result.parsed_amount == null && !result.parsed_timestamp);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not analyze the screenshot — you can still enter details manually.');
      setAnalyzed(true);
      setEditing(true);
    } finally {
      setAnalyzing(false);
    }
  }

  async function submitManual() {
    if (!refundUtr.trim()) { setError('Refund UTR is required.'); return; }
    if (!screenshotFile) { setError('A screenshot of the refund transfer is required.'); return; }
    setLoading(true); setError(null);
    try {
      const form = new FormData();
      form.append('refund_utr', refundUtr.trim());
      form.append('file', screenshotFile);
      await apiFetch(`/api/payments/refunds/${task.txn_ref}/complete`, token, {
        method: 'POST',
        body: form,
      });
      onDone(`Refund of ₹${Number(task.amount).toLocaleString('en-IN')} for ${task.event_title} marked as complete.`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  const reviewAmountNum = reviewAmount ? Number(reviewAmount) : null;

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

        {/* ── Upload (before analysis) ── */}
        {!previewUrl && (
          <Button
            component="label" variant="outlined" startIcon={<CloudUploadIcon />}
            fullWidth sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
          >
            Upload screenshot of the refund transfer
            <input
              type="file" hidden accept="image/*,.pdf"
              onChange={e => handleFileChange(e.target.files?.[0] ?? null)}
            />
          </Button>
        )}

        {/* ── Preview + Analyze ── */}
        {previewUrl && !analyzed && (
          <Stack spacing={2}>
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, position: 'relative' }}>
              <Box
                component="img" src={previewUrl} alt="Refund transfer screenshot"
                sx={{ width: '100%', maxHeight: 280, objectFit: 'contain', borderRadius: 1, display: 'block' }}
              />
              <Tooltip title="View full screen">
                <IconButton
                  onClick={() => setPreviewFullscreen(true)}
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

            <Button size="small" variant="text" onClick={() => handleFileChange(null)} disabled={analyzing}
              sx={{ alignSelf: 'flex-start' }}>
              Choose a different screenshot
            </Button>

            <Button
              fullWidth variant="contained" disabled={analyzing}
              onClick={handleAnalyze}
            >
              {analyzing
                ? <><CircularProgress size={18} color="inherit" sx={{ mr: 1.5 }} />Analyzing screenshot…</>
                : 'Analyze'}
            </Button>
          </Stack>
        )}

        {/* ── Review & confirm the extracted details ── */}
        {previewUrl && analyzed && (
          <Stack spacing={2}>
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, position: 'relative' }}>
              <Box
                component="img" src={previewUrl} alt="Refund transfer screenshot"
                sx={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 1, display: 'block' }}
              />
              <Tooltip title="View full screen">
                <IconButton
                  onClick={() => setPreviewFullscreen(true)}
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

            <Paper variant="outlined" sx={{ p: 2 }}>
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
                  label="Refund UTR / Reference / RRN"
                  value={refundUtr}
                  onChange={e => setRefundUtr(e.target.value.replace(/[^0-9]/g, '').slice(0, 12))}
                  disabled={!editing}
                  fullWidth size="small"
                  inputProps={{ inputMode: 'numeric', maxLength: 12 }}
                  helperText="12-digit reference number from the bank statement/UPI app"
                />
                <TextField
                  label="Amount"
                  type="number"
                  value={reviewAmount}
                  onChange={e => setReviewAmount(e.target.value)}
                  disabled={!editing}
                  fullWidth size="small"
                  InputProps={{ startAdornment: <Typography sx={{ mr: 0.5 }}>₹</Typography> }}
                />
              </Stack>
            </Paper>

            <Button size="small" variant="text" onClick={() => handleFileChange(null)} disabled={loading}
              sx={{ alignSelf: 'flex-start' }}>
              Choose a different screenshot
            </Button>

            {reviewAmountNum != null && !isNaN(reviewAmountNum) && Math.abs(reviewAmountNum - Number(task.amount)) > 0.5 && (
              <Alert severity="warning" sx={{ fontSize: 12 }}>
                The amount extracted from the screenshot (₹{reviewAmountNum.toLocaleString('en-IN')}) doesn't match
                the refund amount (₹{Number(task.amount).toLocaleString('en-IN')}) — double-check you uploaded the right screenshot.
              </Alert>
            )}
          </Stack>
        )}
      </DialogContent>
      {qrOpen && <RefundQrDialog task={task} token={token} onClose={() => setQrOpen(false)} />}
      {previewUrl && previewFullscreen && (
        <Dialog open onClose={() => setPreviewFullscreen(false)} maxWidth="lg" fullWidth>
          <DialogContent sx={{ p: 0, position: 'relative', bgcolor: 'common.black' }}>
            <IconButton
              onClick={() => setPreviewFullscreen(false)}
              sx={{ position: 'absolute', top: 8, right: 8, color: 'common.white', bgcolor: 'rgba(0,0,0,0.5)', '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' } }}
            >
              <CloseIcon />
            </IconButton>
            <Box component="img" src={previewUrl} alt="Refund transfer screenshot full view" sx={{ width: '100%', display: 'block' }} />
          </DialogContent>
        </Dialog>
      )}
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button
          variant="contained" color="error"
          disabled={loading || !analyzed || !refundUtr.trim() || !screenshotFile}
          onClick={submitManual}
        >
          {loading ? <CircularProgress size={18} color="inherit" /> : 'Mark as Refunded'}
        </Button>
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

  // Deep link from a notification (?txn_id=...) — open the Complete Refund
  // dialog directly for that specific task.
  const [highlightId] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('txn_id'),
  );
  const [handledHighlight, setHandledHighlight] = useState(false);

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

  useEffect(() => {
    if (!highlightId || handledHighlight || tasks.length === 0) return;
    const target = tasks.find(t => t.id === highlightId);
    if (target) setCompleting(target);
    setHandledHighlight(true);
  }, [highlightId, handledHighlight, tasks]);

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
              <Paper key={task.txn_ref} variant="outlined"
                sx={{
                  p: 2.5, borderRadius: 2, borderColor: 'error.200',
                  ...(task.id === highlightId && { bgcolor: 'action.selected' }),
                }}>
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
