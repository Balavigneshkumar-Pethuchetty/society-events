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

// ── Types ─────────────────────────────────────────────────────────────────────

interface RefundTask {
  id: string; txn_ref: string; event_id: string; event_title: string;
  amount: number; currency: string;
  payer_upi: string | null; payee_upi: string | null;
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

// ── Complete Refund Dialog ────────────────────────────────────────────────────

function CompleteDialog({
  task, token, onClose, onDone,
}: {
  task: RefundTask; token: string; onClose: () => void; onDone: () => void;
}) {
  const [refundUtr, setRefundUtr] = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  async function submit() {
    if (!refundUtr.trim()) { setError('Refund UTR is required.'); return; }
    setLoading(true); setError(null);
    try {
      await apiFetch(`/api/payments/refunds/${task.txn_ref}/complete`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refund_utr: refundUtr.trim() }),
      });
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
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

          {task.payer_upi && (
            <Box sx={{ p: 2, bgcolor: 'warning.50', border: '1px solid', borderColor: 'warning.200', borderRadius: 1 }}>
              <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                Send refund to this UPI ID
              </Typography>
              <CopyText value={task.payer_upi} />
            </Box>
          )}

          <Alert severity="info" sx={{ fontSize: 12 }}>
            Transfer ₹{Number(task.amount).toLocaleString('en-IN')} to <strong>{task.payer_upi}</strong> using
            your banking app, then enter the UTR below to close this refund.
          </Alert>
        </Stack>

        <TextField
          label="Refund UTR / Transaction Reference"
          value={refundUtr} onChange={e => setRefundUtr(e.target.value)}
          fullWidth size="small" autoFocus
          placeholder="e.g. 123456789012"
          helperText="Enter the UTR from your bank after sending the refund"
        />
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant="contained" color="error" disabled={loading} onClick={submit}>
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

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

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
                    {task.payer_upi && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">Refund to:</Typography>
                        <CopyText value={task.payer_upi} />
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
          onDone={() => { setCompleting(null); load(); }}
        />
      )}
    </Container>
  );
}
