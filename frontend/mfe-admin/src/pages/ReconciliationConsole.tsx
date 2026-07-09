import React, { useCallback, useEffect, useState } from 'react';
import { AdminSidebar } from '../components/AdminSidebar';
import {
  Alert, Box, Button, Chip, CircularProgress, Container,
  Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, IconButton, Paper, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import CheckCircleIcon   from '@mui/icons-material/CheckCircle';
import CloseIcon         from '@mui/icons-material/Close';
import ContentCopyIcon   from '@mui/icons-material/ContentCopy';
import HourglassTopIcon  from '@mui/icons-material/HourglassTop';
import InboxIcon         from '@mui/icons-material/Inbox';
import ThumbDownIcon     from '@mui/icons-material/ThumbDown';
import ThumbUpIcon       from '@mui/icons-material/ThumbUp';
import VerifiedIcon      from '@mui/icons-material/Verified';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Transaction {
  id: string; txn_ref: string; event_id: string; event_title: string;
  registration_id: string | null; amount: number; currency: string;
  payee_upi: string | null; payer_upi: string | null;
  status: string; payment_utr: string | null; refund_utr: string | null;
  created_at: string; updated_at: string;
  user_name: string | null; user_email: string | null;
  screenshot_url: string | null;
  refund_screenshot_url: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

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

function CopyText({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <Typography fontFamily="monospace" fontSize={12} component="span">{value}</Typography>
      <IconButton size="small" onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true); setTimeout(() => setCopied(false), 2000);
      }}>
        {copied
          ? <CheckCircleIcon sx={{ fontSize: 12, color: 'success.main' }} />
          : <ContentCopyIcon sx={{ fontSize: 12 }} />}
      </IconButton>
    </Box>
  );
}

function StatusChip({ status }: { status: string }) {
  if (status === 'pending')          return <Chip label="Pending" color="warning" size="small" icon={<HourglassTopIcon />} />;
  if (status === 'verified')         return <Chip label="Approved" color="success" size="small" icon={<VerifiedIcon />} />;
  if (status === 'cancelled')        return <Chip label="Rejected" color="error" size="small" />;
  if (status === 'refund_requested') return <Chip label="Refund Pending" color="warning" size="small" icon={<HourglassTopIcon />} />;
  if (status === 'refunded')         return <Chip label="Refunded" color="success" size="small" icon={<VerifiedIcon />} />;
  return <Chip label={status} size="small" />;
}

// ── Approve dialog ────────────────────────────────────────────────────────────

function ApproveDialog({
  txn, token, onClose, onDone,
}: {
  txn: Transaction; token: string; onClose: () => void; onDone: () => void;
}) {
  const [notes, setNotes]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function submit() {
    setLoading(true); setError(null);
    try {
      await apiFetch(`/api/payments/payments/${txn.txn_ref}/approve`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes.trim() || null }),
      });
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Approve failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Approve Payment
        <IconButton size="small" onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack spacing={1.5} mb={2}>
          <Box>
            <Typography variant="caption" color="text.secondary">Event</Typography>
            <Typography fontWeight={600}>{txn.event_title}</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 3 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">Resident</Typography>
              <Typography fontWeight={600}>{txn.user_name ?? '—'}</Typography>
              {txn.user_email && <Typography variant="caption" color="text.secondary">{txn.user_email}</Typography>}
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Amount</Typography>
              <Typography fontWeight={700} color="success.main" fontSize={18}>
                ₹{Number(txn.amount).toLocaleString('en-IN')}
              </Typography>
            </Box>
          </Box>
          {txn.payer_upi && (
            <Box>
              <Typography variant="caption" color="text.secondary">Payer UPI</Typography>
              <Typography variant="body2" fontFamily="monospace">{txn.payer_upi}</Typography>
            </Box>
          )}
        </Stack>
        <Alert severity="info" sx={{ mb: 2, fontSize: 12 }}>
          Approving will confirm the registration and allow the resident to view their ticket.
        </Alert>
        <TextField
          label="Notes (optional)"
          value={notes} onChange={e => setNotes(e.target.value)}
          fullWidth size="small" multiline rows={2}
          placeholder="e.g. Payment confirmed via bank statement"
        />
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button
          variant="contained" color="success" startIcon={<ThumbUpIcon />}
          disabled={loading} onClick={submit}
        >
          {loading ? <CircularProgress size={18} color="inherit" /> : 'Approve Payment'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Reject dialog ─────────────────────────────────────────────────────────────

function RejectDialog({
  txn, token, onClose, onDone,
}: {
  txn: Transaction; token: string; onClose: () => void; onDone: () => void;
}) {
  const [notes, setNotes]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function submit() {
    if (!notes.trim()) { setError('Please provide a reason for rejection.'); return; }
    setLoading(true); setError(null);
    try {
      await apiFetch(`/api/payments/payments/${txn.txn_ref}/reject`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes.trim() }),
      });
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Reject failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Reject Payment
        <IconButton size="small" onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box mb={2}>
          <Typography fontWeight={600}>{txn.event_title}</Typography>
          <Typography variant="body2" color="text.secondary">
            {txn.user_name} · ₹{Number(txn.amount).toLocaleString('en-IN')}
          </Typography>
        </Box>
        <Alert severity="warning" sx={{ mb: 2, fontSize: 12 }}>
          The resident will need to re-initiate payment. Their registration remains pending.
        </Alert>
        <TextField
          label="Reason for rejection *"
          value={notes} onChange={e => setNotes(e.target.value)}
          fullWidth size="small" multiline rows={2} autoFocus
          placeholder="e.g. Payment amount does not match, incorrect UPI ID…"
        />
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button
          variant="contained" color="error" startIcon={<ThumbDownIcon />}
          disabled={loading} onClick={submit}
        >
          {loading ? <CircularProgress size={18} color="inherit" /> : 'Reject Payment'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Transaction row ───────────────────────────────────────────────────────────

function TxnRow({
  txn, onApprove, onReject,
}: {
  txn: Transaction;
  onApprove: (t: Transaction) => void;
  onReject: (t: Transaction) => void;
}) {
  // Tracks which of the two screenshots (original payment vs. outgoing refund transfer)
  // is open in the full-view dialog — null means closed.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
        {(txn.screenshot_url || txn.refund_screenshot_url) && (
          <Stack direction="row" spacing={1}>
            {txn.screenshot_url && (
              <Box textAlign="center">
                <Box
                  component="img"
                  src={txn.screenshot_url}
                  alt="Payment screenshot"
                  onClick={() => setPreviewUrl(txn.screenshot_url)}
                  sx={{
                    width: 64, height: 64, objectFit: 'cover', borderRadius: 1.5,
                    cursor: 'pointer', border: '1px solid', borderColor: 'divider',
                    '&:hover': { opacity: 0.85 },
                  }}
                />
                <Typography variant="caption" color="text.secondary" display="block">Payment</Typography>
              </Box>
            )}
            {txn.refund_screenshot_url && (
              <Box textAlign="center">
                <Box
                  component="img"
                  src={txn.refund_screenshot_url}
                  alt="Refund transfer screenshot"
                  onClick={() => setPreviewUrl(txn.refund_screenshot_url)}
                  sx={{
                    width: 64, height: 64, objectFit: 'cover', borderRadius: 1.5,
                    cursor: 'pointer', border: '1px solid', borderColor: 'divider',
                    '&:hover': { opacity: 0.85 },
                  }}
                />
                <Typography variant="caption" color="text.secondary" display="block">Refund</Typography>
              </Box>
            )}
          </Stack>
        )}

        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography fontWeight={700} fontSize={14}>{txn.event_title}</Typography>
          <Typography variant="body2" color="text.secondary">
            {txn.user_name ?? 'Unknown'}{txn.user_email ? ` · ${txn.user_email}` : ''}
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, mt: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
            <Typography variant="caption" fontWeight={700} color="primary.main">
              ₹{Number(txn.amount).toLocaleString('en-IN')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              TXN: <CopyText value={txn.txn_ref} />
            </Typography>
            {txn.payer_upi && (
              <Typography variant="caption" color="text.secondary">
                Payer UPI: <strong>{txn.payer_upi}</strong>
              </Typography>
            )}
            {txn.payment_utr && (
              <Typography variant="caption" color="text.secondary">
                Ref: <strong>{txn.payment_utr}</strong>
              </Typography>
            )}
            {txn.refund_utr && (
              <Typography variant="caption" color="text.secondary">
                Refund UTR: <strong>{txn.refund_utr}</strong>
              </Typography>
            )}
          </Box>
          <Typography variant="caption" color="text.secondary">
            {txn.status === 'refunded' ? `Refunded ${fmtDate(txn.updated_at)}` : fmtDate(txn.created_at)}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
          <StatusChip status={txn.status} />
          {txn.status === 'pending' && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button size="small" variant="outlined" color="error" startIcon={<ThumbDownIcon />}
                onClick={() => onReject(txn)}>
                Reject
              </Button>
              <Button size="small" variant="contained" color="success" startIcon={<ThumbUpIcon />}
                onClick={() => onApprove(txn)}>
                Approve
              </Button>
            </Box>
          )}
        </Box>
      </Box>

      {previewUrl && (
        <Dialog open onClose={() => setPreviewUrl(null)} maxWidth="md" fullWidth>
          <DialogContent sx={{ p: 0, position: 'relative', bgcolor: 'common.black' }}>
            <IconButton
              onClick={() => setPreviewUrl(null)}
              sx={{ position: 'absolute', top: 8, right: 8, color: 'common.white', bgcolor: 'rgba(0,0,0,0.5)', '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' } }}
            >
              <CloseIcon />
            </IconButton>
            <Box component="img" src={previewUrl} alt="Screenshot full view" sx={{ width: '100%', display: 'block' }} />
          </DialogContent>
        </Dialog>
      )}
    </Paper>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function ReconciliationConsole({ token, role }: { token?: string | null; role?: string }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [txns, setTxns]           = useState<Transaction[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [tab, setTab]             = useState(0);
  const [approving, setApproving] = useState<Transaction | null>(null);
  const [rejecting, setRejecting] = useState<Transaction | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const all: Transaction[] = await apiFetch('/api/payments/payments', token);
      setTxns(all);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (!token) return <Box sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">Not authenticated.</Typography></Box>;

  const pending       = txns.filter(t => t.status === 'pending');
  const approved      = txns.filter(t => t.status === 'verified');
  const rejected      = txns.filter(t => t.status === 'cancelled');
  const refundPending = txns.filter(t => t.status === 'refund_requested');
  const refunded      = txns.filter(t => t.status === 'refunded');

  const tabs = [
    { label: `Pending Approval (${pending.length})`,       data: pending },
    { label: `Approved (${approved.length})`,               data: approved },
    { label: `Rejected (${rejected.length})`,               data: rejected },
    { label: `Refund Pending (${refundPending.length})`,    data: refundPending },
    { label: `Refunded (${refunded.length})`,               data: refunded },
  ];

  return (
    <Box sx={{ display: 'flex' }}>
      <AdminSidebar active="Payment Requests" mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} role={role} />
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h5" fontWeight={800} mb={0.5}>Payment Requests</Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Review payment notifications from residents. Approve to confirm their registration or reject if the payment is invalid.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* Summary bar */}
      {!loading && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 3 }}>
          <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', gap: 4 }}>
              <Box textAlign="center">
                <Typography fontWeight={800} fontSize={28} color="warning.main">{pending.length}</Typography>
                <Typography variant="caption" color="text.secondary">Awaiting Approval</Typography>
              </Box>
              <Divider orientation="vertical" flexItem />
              <Box textAlign="center">
                <Typography fontWeight={800} fontSize={28} color="success.main">{approved.length}</Typography>
                <Typography variant="caption" color="text.secondary">Approved</Typography>
              </Box>
              <Divider orientation="vertical" flexItem />
              <Box textAlign="center">
                <Typography fontWeight={800} fontSize={28} color="error.main">{rejected.length}</Typography>
                <Typography variant="caption" color="text.secondary">Rejected</Typography>
              </Box>
              <Divider orientation="vertical" flexItem />
              <Box textAlign="center">
                <Typography fontWeight={800} fontSize={28} color="warning.main">{refundPending.length}</Typography>
                <Typography variant="caption" color="text.secondary">Refund Pending</Typography>
              </Box>
              <Divider orientation="vertical" flexItem />
              <Box textAlign="center">
                <Typography fontWeight={800} fontSize={28} color="success.main">{refunded.length}</Typography>
                <Typography variant="caption" color="text.secondary">Refunded</Typography>
              </Box>
            </Box>
            <Button variant="outlined" size="small" onClick={load} disabled={loading}>
              Refresh
            </Button>
          </Box>
        </Paper>
      )}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        {tabs.map((t, i) => <Tab key={i} label={t.label} />)}
      </Tabs>

      {loading
        ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        : (
          <Stack spacing={1.5}>
            {tabs[tab].data.length === 0 && (
              <Box textAlign="center" py={6}>
                <InboxIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                <Typography color="text.secondary">No payment requests in this category.</Typography>
              </Box>
            )}
            {tabs[tab].data.map(txn => (
              <TxnRow
                key={txn.txn_ref}
                txn={txn}
                onApprove={setApproving}
                onReject={setRejecting}
              />
            ))}
          </Stack>
        )}

      {approving && (
        <ApproveDialog
          txn={approving} token={token}
          onClose={() => setApproving(null)}
          onDone={() => { setApproving(null); void load(); }}
        />
      )}
      {rejecting && (
        <RejectDialog
          txn={rejecting} token={token}
          onClose={() => setRejecting(null)}
          onDone={() => { setRejecting(null); void load(); }}
        />
      )}
    </Container>
    </Box>
  );
}
