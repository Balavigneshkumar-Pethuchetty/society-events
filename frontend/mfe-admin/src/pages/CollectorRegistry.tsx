import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Collapse, Container,
  Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  FormControlLabel, IconButton, InputAdornment, MenuItem,
  Paper, Stack, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon          from '@mui/icons-material/Add';
import CheckCircleIcon  from '@mui/icons-material/CheckCircle';
import CloseIcon        from '@mui/icons-material/Close';
import EditIcon         from '@mui/icons-material/Edit';
import EmailIcon        from '@mui/icons-material/Email';
import ExpandMoreIcon   from '@mui/icons-material/ExpandMore';
import PsychologyIcon   from '@mui/icons-material/Psychology';
import RefreshIcon      from '@mui/icons-material/Refresh';
import SettingsIcon     from '@mui/icons-material/Settings';
import SyncIcon         from '@mui/icons-material/Sync';
import VisibilityIcon       from '@mui/icons-material/Visibility';
import VisibilityOffIcon    from '@mui/icons-material/VisibilityOff';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RegistryEntry {
  id: string; event_id: string; event_title: string;
  member_id: string; member_name: string; member_email: string | null;
  upi_id: string; assigned_at: string;
}

interface Member { id: string; name: string; email: string | null; role: string }

interface EventItem {
  id: string; title: string; ticket_price: number;
  price_currency: string; is_free: boolean; start_time: string;
  collector_upi: string | null; collector_name: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
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

// ── Assign Dialog ─────────────────────────────────────────────────────────────

function AssignDialog({
  token, entry, members, events, onClose, onDone,
}: {
  token: string;
  entry: RegistryEntry | null;
  members: Member[];
  events: EventItem[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [eventId, setEventId]   = useState(entry?.event_id ?? '');
  const [memberId, setMemberId] = useState(entry?.member_id ?? '');
  const [upiId, setUpiId]       = useState(entry?.upi_id ?? '');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const isEdit = Boolean(entry);

  async function save() {
    if (!eventId || !memberId || !upiId.trim()) {
      setError('All fields are required.'); return;
    }
    setLoading(true); setError(null);
    try {
      if (isEdit) {
        await apiFetch(`/api/payments/registry/${entry!.id}`, token, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ member_id: memberId, upi_id: upiId }),
        });
      } else {
        await apiFetch('/api/payments/registry', token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_id: eventId, member_id: memberId, upi_id: upiId }),
        });
      }
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {isEdit ? 'Reassign Collector' : 'Assign Collector'}
        <IconButton size="small" onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack spacing={2.5}>
          {!isEdit && (
            <TextField select label="Event" value={eventId} onChange={e => setEventId(e.target.value)} fullWidth>
              {events.filter(ev => !ev.is_free).map(ev => (
                <MenuItem key={ev.id} value={ev.id}>
                  {ev.title} ({fmtDate(ev.start_time)})
                </MenuItem>
              ))}
            </TextField>
          )}
          {isEdit && (
            <Box>
              <Typography variant="caption" color="text.secondary">Event</Typography>
              <Typography fontWeight={600}>{entry!.event_title}</Typography>
            </Box>
          )}
          <TextField select label="Collector (Committee Member)" value={memberId}
            onChange={e => setMemberId(e.target.value)} fullWidth>
            {members.map(m => (
              <MenuItem key={m.id} value={m.id}>{m.name} {m.email ? `· ${m.email}` : ''}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Collector's UPI ID"
            value={upiId} onChange={e => setUpiId(e.target.value)}
            fullWidth placeholder="name@bankname"
            helperText="The UPI ID where residents will pay for this event"
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant="contained" disabled={loading} onClick={save}>
          {loading ? <CircularProgress size={18} color="inherit" /> : isEdit ? 'Update' : 'Assign'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Reconciliation settings types ────────────────────────────────────────────

interface ReconSettings {
  imap_host: string;
  imap_port: number;
  imap_user: string;
  imap_password_set: boolean;
  imap_mailbox: string;
  poll_interval_s: number;
  use_ai_parser: boolean;
  ollama_host: string;
  ollama_model: string;
  updated_at: string | null;
}

// ── Reconciliation Settings Panel ─────────────────────────────────────────────

function ReconSettingsPanel({ token }: { token: string }) {
  const [open, setOpen]         = useState(false);
  const [cfg,  setCfg]          = useState<ReconSettings | null>(null);
  const [loading, setLoading]   = useState(false);
  const [saving,  setSaving]    = useState(false);
  const [scanning, setScanning] = useState(false);
  const [testing,  setTesting]  = useState<'imap' | 'ollama' | null>(null);
  const [showPw,   setShowPw]   = useState(false);
  const [password, setPassword] = useState('');   // local field; empty = keep existing
  const [msg, setMsg]           = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [scanResult, setScanResult] = useState<{ emails_processed: number; matched: number; unmatched: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/payments/recon-settings', token);
      setCfg(data);
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { if (open) load(); }, [open, load]);

  function patch<K extends keyof ReconSettings>(key: K, value: ReconSettings[K]) {
    setCfg((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  async function save() {
    if (!cfg) return;
    setSaving(true); setMsg(null);
    try {
      const body: Record<string, unknown> = {
        imap_host: cfg.imap_host, imap_port: cfg.imap_port,
        imap_user: cfg.imap_user, imap_password: password,
        imap_mailbox: cfg.imap_mailbox, poll_interval_s: cfg.poll_interval_s,
        use_ai_parser: cfg.use_ai_parser,
        ollama_host: cfg.ollama_host, ollama_model: cfg.ollama_model,
      };
      const updated = await apiFetch('/api/payments/recon-settings', token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setCfg(updated);
      setPassword('');
      setMsg({ type: 'success', text: 'Settings saved.' });
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  }

  async function testImap() {
    setTesting('imap'); setMsg(null);
    try {
      const r = await apiFetch('/api/payments/recon-settings/test-imap', token, { method: 'POST' });
      setMsg({ type: 'success', text: `Connected! Mailbox "${r.mailbox}" has ${r.message_count} messages.` });
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : 'IMAP test failed' });
    } finally {
      setTesting(null);
    }
  }

  async function testOllama() {
    setTesting('ollama'); setMsg(null);
    try {
      const r = await apiFetch('/api/payments/recon-settings/test-ollama', token, { method: 'POST' });
      const modelOk = r.model_available
        ? `Model "${r.configured_model}" is ready.`
        : `Model "${r.configured_model}" not found. Available: ${r.available_models.join(', ') || 'none'}.`;
      setMsg({ type: r.model_available ? 'success' : 'info', text: `Ollama connected. ${modelOk}` });
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : 'Ollama test failed' });
    } finally {
      setTesting(null);
    }
  }

  async function scanNow() {
    setScanning(true); setMsg(null); setScanResult(null);
    try {
      const r = await apiFetch('/api/payments/reconciliation/scan', token, { method: 'POST' });
      setScanResult(r);
      setMsg({ type: 'success', text: `Scan complete: ${r.matched} matched, ${r.unmatched} unmatched from ${r.emails_processed} emails.` });
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : 'Scan failed' });
    } finally {
      setScanning(false);
    }
  }

  return (
    <Box>
      <Button
        variant="outlined"
        startIcon={<SettingsIcon />}
        endIcon={<ExpandMoreIcon sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />}
        onClick={() => setOpen((v) => !v)}
        sx={{ mb: 1 }}
      >
        Reconciliation Settings
      </Button>

      <Collapse in={open}>
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, mt: 1 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
          ) : !cfg ? null : (
            <Stack spacing={3}>

              {/* Status message */}
              {msg && (
                <Alert severity={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert>
              )}

              {/* ── IMAP section ── */}
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <EmailIcon color="primary" />
                  <Typography fontWeight={700}>IMAP / Email Account</Typography>
                  <Typography variant="caption" color="text.secondary">
                    (the inbox that receives bank credit alerts)
                  </Typography>
                </Box>
                <Stack spacing={2}>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <TextField
                      label="IMAP Host"
                      value={cfg.imap_host}
                      onChange={(e) => patch('imap_host', e.target.value)}
                      size="small"
                      sx={{ flex: 3 }}
                      placeholder="imap.gmail.com"
                    />
                    <TextField
                      label="Port"
                      value={cfg.imap_port}
                      onChange={(e) => patch('imap_port', Number(e.target.value))}
                      size="small"
                      type="number"
                      sx={{ flex: 1 }}
                    />
                  </Box>
                  <TextField
                    label="Email address"
                    value={cfg.imap_user}
                    onChange={(e) => patch('imap_user', e.target.value)}
                    size="small"
                    fullWidth
                    placeholder="treasurer@pvh-blr.in"
                  />
                  <TextField
                    label={cfg.imap_password_set ? 'Password (leave blank to keep current)' : 'Password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    size="small"
                    fullWidth
                    type={showPw ? 'text' : 'password'}
                    placeholder={cfg.imap_password_set ? '••••••••' : 'App password or IMAP password'}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton size="small" onClick={() => setShowPw((v) => !v)}>
                            {showPw ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <TextField
                      label="Mailbox / Folder"
                      value={cfg.imap_mailbox}
                      onChange={(e) => patch('imap_mailbox', e.target.value)}
                      size="small"
                      sx={{ flex: 2 }}
                      placeholder="INBOX"
                    />
                    <TextField
                      label="Poll interval (seconds)"
                      value={cfg.poll_interval_s}
                      onChange={(e) => patch('poll_interval_s', Number(e.target.value))}
                      size="small"
                      type="number"
                      sx={{ flex: 2 }}
                      helperText="300 = every 5 min"
                    />
                  </Box>
                  <Box>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={testImap}
                      disabled={testing === 'imap' || !cfg.imap_host || !cfg.imap_user}
                      startIcon={testing === 'imap' ? <CircularProgress size={14} /> : <CheckCircleIcon />}
                    >
                      Test IMAP Connection
                    </Button>
                  </Box>
                </Stack>
              </Box>

              <Divider />

              {/* ── Ollama AI parser section ── */}
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <PsychologyIcon color="secondary" />
                  <Typography fontWeight={700}>AI Parser (Ollama)</Typography>
                  <Chip label="Optional" size="small" sx={{ fontSize: 11 }} />
                </Box>
                <Typography variant="caption" color="text.secondary" display="block" mb={2}>
                  When enabled, a local Ollama LLM reads the email and extracts UTR, amount, and sender VPA
                  for more accurate matching. Falls back to regex if Ollama is unreachable.
                </Typography>
                <Stack spacing={2}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={cfg.use_ai_parser}
                        onChange={(e) => patch('use_ai_parser', e.target.checked)}
                        color="secondary"
                      />
                    }
                    label="Use Ollama AI to parse bank emails"
                  />
                  <Collapse in={cfg.use_ai_parser}>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                      <TextField
                        label="Ollama Host URL"
                        value={cfg.ollama_host}
                        onChange={(e) => patch('ollama_host', e.target.value)}
                        size="small"
                        fullWidth
                        placeholder="http://localhost:11434"
                      />
                      <TextField
                        label="Model"
                        value={cfg.ollama_model}
                        onChange={(e) => patch('ollama_model', e.target.value)}
                        size="small"
                        fullWidth
                        placeholder="llama3"
                        helperText="Run: ollama pull llama3"
                      />
                      <Box>
                        <Button
                          variant="outlined"
                          color="secondary"
                          size="small"
                          onClick={testOllama}
                          disabled={testing === 'ollama' || !cfg.ollama_host}
                          startIcon={testing === 'ollama' ? <CircularProgress size={14} color="inherit" /> : <CheckCircleIcon />}
                        >
                          Test Ollama Connection
                        </Button>
                      </Box>
                    </Stack>
                  </Collapse>
                </Stack>
              </Box>

              <Divider />

              {/* ── Actions ── */}
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                <Button
                  variant="contained"
                  onClick={save}
                  disabled={saving}
                  startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
                >
                  {saving ? 'Saving…' : 'Save Settings'}
                </Button>

                <Tooltip title="Fetch unread bank emails now and match to pending payments">
                  <span>
                    <Button
                      variant="outlined"
                      color="success"
                      onClick={scanNow}
                      disabled={scanning || !cfg.imap_host || !cfg.imap_user}
                      startIcon={scanning ? <CircularProgress size={14} color="inherit" /> : <SyncIcon />}
                    >
                      {scanning ? 'Scanning…' : 'Scan Inbox Now'}
                    </Button>
                  </span>
                </Tooltip>

                <Button size="small" startIcon={<RefreshIcon />} onClick={load} disabled={loading}>
                  Reload
                </Button>

                {cfg.updated_at && (
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                    Last saved {new Date(cfg.updated_at).toLocaleString('en-IN')}
                  </Typography>
                )}
              </Box>

              {scanResult && (
                <Alert severity="info" icon={<SyncIcon />}>
                  Scan: <strong>{scanResult.emails_processed}</strong> emails read ·{' '}
                  <strong>{scanResult.matched}</strong> payments auto-matched ·{' '}
                  <strong>{scanResult.unmatched}</strong> unmatched
                </Alert>
              )}

            </Stack>
          )}
        </Paper>
      </Collapse>
    </Box>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function CollectorRegistry({ token }: { token?: string | null }) {
  const [registry, setRegistry] = useState<RegistryEntry[]>([]);
  const [members, setMembers]   = useState<Member[]>([]);
  const [events, setEvents]     = useState<EventItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [dialog, setDialog]     = useState<RegistryEntry | null | 'new'>(undefined as any);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [reg, mem, evs] = await Promise.all([
        apiFetch('/api/payments/registry', token),
        apiFetch('/api/payments/registry/members', token),
        apiFetch('/api/payments/registry/events', token),
      ]);
      setRegistry(reg); setMembers(mem); setEvents(evs);
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={800}>Collector Registry</Typography>
          <Typography variant="body2" color="text.secondary">
            Assign a committee member + UPI ID as payment collector for each event.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog('new')}>
          Assign Collector
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <ReconSettingsPanel token={token} />

      <Divider sx={{ my: 3 }} />

      {loading
        ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
        : (
          <Stack spacing={1.5}>
            {registry.length === 0 && (
              <Typography color="text.secondary" textAlign="center" py={6}>
                No collectors assigned yet. Click "Assign Collector" to get started.
              </Typography>
            )}
            {registry.map(entry => (
              <Paper key={entry.id} variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography fontWeight={700}>{entry.event_title}</Typography>
                    <Typography variant="body2" color="text.secondary" mt={0.5}>
                      Collector: <strong>{entry.member_name}</strong>
                      {entry.member_email && ` · ${entry.member_email}`}
                    </Typography>
                    <Typography variant="body2" fontFamily="monospace" mt={0.5}>
                      UPI: {entry.upi_id}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Assigned {fmtDate(entry.assigned_at)}
                    </Typography>
                  </Box>
                  <Button size="small" variant="outlined" startIcon={<EditIcon />}
                    onClick={() => setDialog(entry)}>
                    Change
                  </Button>
                </Box>
              </Paper>
            ))}
          </Stack>
        )}

      {dialog !== undefined && (
        <AssignDialog
          token={token}
          entry={dialog === 'new' ? null : dialog as RegistryEntry}
          members={members}
          events={events}
          onClose={() => setDialog(undefined as any)}
          onDone={() => { setDialog(undefined as any); load(); }}
        />
      )}
    </Container>
  );
}
