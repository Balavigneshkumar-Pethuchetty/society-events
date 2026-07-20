import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Alert, Avatar, Box, Button, Card, CardContent,
  Chip, CircularProgress, Container, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControl, Grid,
  IconButton, InputAdornment, InputLabel, MenuItem, Select, Skeleton, TextField,
  Tooltip, Typography,
} from '@mui/material';
import ApartmentIcon from '@mui/icons-material/Apartment';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import ReplayIcon from '@mui/icons-material/Replay';
import SendIcon from '@mui/icons-material/Send';
import VerifiedIcon from '@mui/icons-material/Verified';
import { useAuth } from '../contexts/AuthContext';
import { useUserService } from '../contexts/UserServiceContext';
import { ROLE_COLORS, ROLE_LABELS } from '../theme';
import { PhoneInputField } from '../components/PhoneInputField';
import { OtpChannelSelector } from '../components/OtpChannelSelector';
import { OtpChannel } from '../api/userService';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { userService, StructureNode, UnitRequest, LeaveRequest } from '../api/userService';

// ── Email verification row ──────────────────────────────────────────────────
function EmailVerifyRow() {
  const { dbUser, sendEmailVerification, checkEmailVerification } = useUserService();
  const [sent,      setSent]      = useState(false);
  const [busy,       setBusy]      = useState(false);
  const [notYet,     setNotYet]    = useState(false);
  const [error,      setError]     = useState<string | null>(null);

  if (!dbUser || dbUser.email_verified) return null;

  const handleSend = async () => {
    setError(null);
    setNotYet(false);
    setBusy(true);
    try {
      await sendEmailVerification();
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send verification email');
    } finally {
      setBusy(false);
    }
  };

  const handleCheck = async () => {
    setError(null);
    setNotYet(false);
    setBusy(true);
    try {
      const verified = await checkEmailVerification();
      if (!verified) setNotYet(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not check status');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ mt: 0.75 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Chip label="Not verified" size="small" variant="outlined" sx={{ fontSize: 11, height: 22 }} />
        {!sent ? (
          <Button
            size="small"
            startIcon={busy ? <CircularProgress size={12} color="inherit" /> : <MarkEmailReadIcon sx={{ fontSize: '14px !important' }} />}
            onClick={handleSend}
            disabled={busy}
            sx={{ fontSize: 11, textTransform: 'none' }}
          >
            Send verification email
          </Button>
        ) : (
          <Button
            size="small"
            startIcon={busy ? <CircularProgress size={12} color="inherit" /> : <ReplayIcon sx={{ fontSize: '14px !important' }} />}
            onClick={handleCheck}
            disabled={busy}
            sx={{ fontSize: 11, textTransform: 'none' }}
          >
            I've verified — refresh status
          </Button>
        )}
      </Box>
      {sent && !error && (
        <Typography fontSize={11} color="text.secondary" sx={{ mt: 0.5 }}>
          Check your inbox for a link from Keycloak, then click refresh.
        </Typography>
      )}
      {notYet && (
        <Typography fontSize={11} color="warning.main" sx={{ mt: 0.5 }}>
          Not verified yet — click the link in the email first.
        </Typography>
      )}
      {error && (
        <Typography fontSize={11} color="error.main" sx={{ mt: 0.5 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}

// ── Phone verification row ──────────────────────────────────────────────────
function PhoneVerifyRow({ pendingChange }: { pendingChange: boolean }) {
  const { dbUser, requestPhoneVerification, confirmPhoneVerification } = useUserService();
  const [requestId, setRequestId] = useState<string | null>(null);
  const [code,       setCode]      = useState('');
  const [channel,    setChannel]   = useState<OtpChannel>('sms');
  const [busy,        setBusy]      = useState(false);
  const [cooldown,    setCooldown]  = useState(0);
  const [error,       setError]     = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  if (!dbUser?.phone || dbUser.phone_verified) return null;

  const handleRequest = async () => {
    setError(null);
    setAttemptsLeft(null);
    setBusy(true);
    try {
      const res = await requestPhoneVerification(channel);
      if (res.ok && res.request_id) {
        setRequestId(res.request_id);
        setCooldown(60);
      } else if (res.retry_after) {
        setCooldown(res.retry_after);
        setError('A code was already sent — wait before requesting another.');
      } else {
        setError(res.error ?? 'Could not send code');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send code');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!requestId || !code) return;
    setError(null);
    setBusy(true);
    try {
      const res = await confirmPhoneVerification(requestId, code);
      if (!res.verified) {
        setAttemptsLeft(res.attempts_remaining ?? null);
        setError(
          res.status === 'expired' ? 'Code expired — request a new one.'
          : res.status === 'locked' ? 'Too many attempts — request a new code.'
          : 'Incorrect code.',
        );
        if (res.status === 'expired' || res.status === 'locked') setRequestId(null);
      } else {
        setRequestId(null);
        setCode('');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not verify code');
    } finally {
      setBusy(false);
    }
  };

  if (pendingChange) {
    return (
      <Typography fontSize={11} color="text.secondary" sx={{ mt: 0.75 }}>
        Save your changes before verifying.
      </Typography>
    );
  }

  return (
    <Box sx={{ mt: 0.75 }}>
      {!requestId ? (
        <Box>
          <OtpChannelSelector phone={dbUser.phone} value={channel} onChange={setChannel} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip label="Not verified" size="small" variant="outlined" sx={{ fontSize: 11, height: 22 }} />
            <Button
              size="small"
              startIcon={busy ? <CircularProgress size={12} color="inherit" /> : <SendIcon sx={{ fontSize: '14px !important' }} />}
              onClick={handleRequest}
              disabled={busy || cooldown > 0}
              sx={{ fontSize: 11, textTransform: 'none' }}
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send code'}
            </Button>
          </Box>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TextField
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="6-digit code"
            size="small"
            sx={{ width: 140 }}
          />
          <Button
            size="small"
            variant="contained"
            onClick={handleConfirm}
            disabled={busy || !code}
            startIcon={busy ? <CircularProgress size={12} color="inherit" /> : null}
            sx={{ fontSize: 11 }}
          >
            Confirm
          </Button>
          <Button
            size="small"
            onClick={handleRequest}
            disabled={busy || cooldown > 0}
            sx={{ fontSize: 11, textTransform: 'none' }}
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend'}
          </Button>
        </Box>
      )}
      {requestId && !error && (
        <Typography fontSize={11} color="text.secondary" sx={{ mt: 0.5 }}>
          {channel === 'telegram'
            ? "Sent via Telegram — check your chat with the bot. It should arrive within seconds."
            : "SMS delivery can occasionally take a few minutes depending on your carrier. If you don't receive a code, use Resend once it's available."}
        </Typography>
      )}
      {error && (
        <Typography fontSize={11} color="error.main" sx={{ mt: 0.5 }}>
          {error}{attemptsLeft != null && attemptsLeft > 0 ? ` (${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left)` : ''}
        </Typography>
      )}
    </Box>
  );
}

// ── Small inline "Verified" chip, used as a field end-adornment ───────────────
function VerifiedChip() {
  return (
    <Chip
      icon={<VerifiedIcon sx={{ fontSize: '14px !important' }} />}
      label="Verified"
      size="small"
      color="success"
      variant="outlined"
      sx={{ fontSize: 11, height: 22, mr: -0.5 }}
    />
  );
}

// ── Personal Info card ────────────────────────────────────────────────────────
function PersonalInfoCard() {
  const { dbUser, updateProfile } = useUserService();
  const [name,    setName]    = useState('');
  const [phone,   setPhone]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (dbUser) {
      setName(dbUser.name);
      setPhone(dbUser.phone ?? '');
    }
  }, [dbUser]);

  const isDirty =
    dbUser != null &&
    (name.trim() !== dbUser.name || (phone.trim() || null) !== dbUser.phone);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await updateProfile({
        name:  name.trim() || undefined,
        // null (not undefined) so an intentionally-cleared field actually gets saved as
        // removed, rather than the key being dropped from the request and silently ignored.
        phone: phone.trim() || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
          <EditIcon color="primary" fontSize="small" />
          <Typography fontWeight={700} fontSize={16}>Personal information</Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {saved && (
          <Alert severity="success" icon={<CheckCircleIcon />} sx={{ mb: 2 }}>
            Profile updated successfully.
          </Alert>
        )}

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              size="small"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Email address"
              value={dbUser?.email ?? ''}
              fullWidth
              size="small"
              disabled
              helperText="Managed by Keycloak — change via account settings"
              InputProps={{
                endAdornment: dbUser?.email_verified ? (
                  <InputAdornment position="end"><VerifiedChip /></InputAdornment>
                ) : undefined,
              }}
            />
            <EmailVerifyRow />
          </Grid>
          <Grid item xs={12} sm={6}>
            <PhoneInputField
              value={phone}
              onChange={setPhone}
              size="small"
              endAdornment={dbUser?.phone_verified ? <VerifiedChip /> : undefined}
            />
            <PhoneVerifyRow pendingChange={dbUser != null && (phone.trim() || null) !== dbUser.phone} />
          </Grid>
        </Grid>

        <Box sx={{ mt: 2.5, display: 'flex', gap: 1.5 }}>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!isDirty || saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
            sx={{ fontWeight: 700, px: 3 }}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}

// ── Hero unit chips (one per flat) ────────────────────────────────────────────
function HeroUnitChips({ nodeIds }: { nodeIds: string[] }) {
  const { token } = useAuth();
  const [labels, setLabels] = useState<string[]>([]);

  useEffect(() => {
    if (!token || nodeIds.length === 0) return;
    userService.buildingNodes(token).then((nodes) => {
      const byId = new Map(nodes.map((n) => [n.id, n]));
      setLabels(nodeIds.map((nodeId) => {
        const parts: string[] = [];
        let cur = byId.get(nodeId);
        while (cur) { parts.unshift(cur.name); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }
        return parts.join(' › ');
      }));
    }).catch(() => {/* silent */});
  }, [token, nodeIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {labels.map((label, i) => (
        <Chip
          key={nodeIds[i]}
          icon={<ApartmentIcon sx={{ fontSize: '14px !important', color: '#c7d2fe !important' }} />}
          label={label}
          size="small"
          sx={{
            bgcolor: 'rgba(255,255,255,0.12)',
            color: '#e0e7ff',
            fontWeight: 600,
            fontSize: 11,
            height: 22,
            border: '1px solid rgba(255,255,255,0.18)',
          }}
        />
      ))}
    </>
  );
}

// ── Build full path from flat node list ───────────────────────────────────────
function buildNodePath(nodes: StructureNode[], nodeId: string): string {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const path: string[] = [];
  let cur = byId.get(nodeId);
  while (cur) {
    path.unshift(cur.name);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return path.join(' › ');
}

function getLeafNodes(nodes: StructureNode[]): StructureNode[] {
  const hasChildren = new Set(nodes.map((n) => n.parent_id).filter(Boolean));
  return nodes.filter((n) => !hasChildren.has(n.id));
}

// ── Add Flat Dialog (direct, for admin/committee) ─────────────────────────────

interface AddFlatDialogProps {
  open: boolean;
  nodes: StructureNode[];
  existingNodeIds: string[];
  onClose: () => void;
  onAdd: (nodeId: string) => Promise<void>;
}

function AddFlatDialog({ open, nodes, existingNodeIds, onClose, onAdd }: AddFlatDialogProps) {
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leaves = useMemo(
    () => getLeafNodes(nodes).filter((n) => !existingNodeIds.includes(n.id)),
    [nodes, existingNodeIds],
  );

  useEffect(() => {
    if (open) { setSelectedNodeId(''); setError(null); }
  }, [open]);

  const handleAdd = async () => {
    if (!selectedNodeId) { setError('Please select a flat.'); return; }
    setBusy(true);
    setError(null);
    try {
      await onAdd(selectedNodeId);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
        <ApartmentIcon color="primary" />
        Add Flat
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ pt: 2.5 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {leaves.length === 0 ? (
          <Typography fontSize={13} color="text.secondary">
            No available flats to add — all flats are already linked or no building structure is configured.
          </Typography>
        ) : (
          <FormControl fullWidth size="small">
            <InputLabel>Select flat</InputLabel>
            <Select
              label="Select flat"
              value={selectedNodeId}
              onChange={(e) => setSelectedNodeId(e.target.value)}
            >
              <MenuItem value=""><em>— choose —</em></MenuItem>
              {leaves.map((n) => (
                <MenuItem key={n.id} value={n.id}>
                  {buildNodePath(nodes, n.id)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        <Typography fontSize={12} color="text.secondary" sx={{ mt: 1.5 }}>
          Multiple members can share the same flat (e.g. co-owners, family).
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleAdd}
          disabled={busy || !selectedNodeId || leaves.length === 0}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {busy ? 'Adding…' : 'Add Flat'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Request Flat Dialog (for resident / security / sponsor) ───────────────────

interface RequestFlatDialogProps {
  open: boolean;
  nodes: StructureNode[];
  existingNodeIds: string[];
  pendingNodeIds: string[];
  onClose: () => void;
  onSubmit: (nodeId: string, notes: string) => Promise<void>;
}

function RequestFlatDialog({
  open, nodes, existingNodeIds, pendingNodeIds, onClose, onSubmit,
}: RequestFlatDialogProps) {
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leaves = useMemo(
    () => getLeafNodes(nodes).filter(
      (n) => !existingNodeIds.includes(n.id) && !pendingNodeIds.includes(n.id),
    ),
    [nodes, existingNodeIds, pendingNodeIds],
  );

  useEffect(() => {
    if (open) { setSelectedNodeId(''); setNotes(''); setError(null); }
  }, [open]);

  const handleSubmit = async () => {
    if (!selectedNodeId) { setError('Please select a flat.'); return; }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(selectedNodeId, notes.trim());
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to submit request');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
        <SendIcon color="primary" />
        Request Flat Assignment
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ pt: 2.5 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {leaves.length === 0 ? (
          <Typography fontSize={13} color="text.secondary">
            No available flats — all flats are already assigned or have pending requests.
          </Typography>
        ) : (
          <>
            <FormControl fullWidth size="small">
              <InputLabel>Select flat</InputLabel>
              <Select
                label="Select flat"
                value={selectedNodeId}
                onChange={(e) => setSelectedNodeId(e.target.value)}
              >
                <MenuItem value=""><em>— choose —</em></MenuItem>
                {leaves.map((n) => (
                  <MenuItem key={n.id} value={n.id}>
                    {buildNodePath(nodes, n.id)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              fullWidth
              size="small"
              multiline
              rows={2}
              placeholder="e.g. I am the owner of this flat"
              sx={{ mt: 2 }}
            />
          </>
        )}
        <Typography fontSize={12} color="text.secondary" sx={{ mt: 1.5 }}>
          An admin or committee member will review and approve your request.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={busy || !selectedNodeId || leaves.length === 0}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
        >
          {busy ? 'Submitting…' : 'Submit Request'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── My Flats card ─────────────────────────────────────────────────────────────
function MyFlatsCard() {
  const { token } = useAuth();
  const { dbUser, refreshProfile } = useUserService();
  const [nodes,          setNodes]          = useState<StructureNode[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [removing,       setRemoving]       = useState<string | null>(null);
  const [addOpen,        setAddOpen]        = useState(false);
  const [allReqs,        setAllReqs]        = useState<UnitRequest[]>([]);
  const [reqsLoading,    setReqsLoading]    = useState(false);

  const nodeIds: string[] = dbUser?.unit_node_ids ?? [];
  const assignedSet = new Set(nodeIds);
  // Nodes that have an approved add request — treat as assigned even if dbUser refresh is still pending
  const approvedAddNodeIds = new Set(
    allReqs.filter((r) => r.type === 'add' && r.status === 'approved').map((r) => r.node_id),
  );
  // Deduplicate by node_id: keep only the most recent pending/rejected add request per node
  const addReqsToShow = Object.values(
    allReqs
      .filter(
        (r) =>
          r.type === 'add' &&
          r.status !== 'approved' &&
          !assignedSet.has(r.node_id) &&
          !approvedAddNodeIds.has(r.node_id),
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .reduce<Record<string, UnitRequest>>((acc, r) => {
        if (!acc[r.node_id]) acc[r.node_id] = r;
        return acc;
      }, {}),
  );
  const pendingNodeIds = allReqs.filter((r) => r.status === 'pending' && r.type === 'add').map((r) => r.node_id);

  // Load building nodes
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    userService.buildingNodes(token)
      .then(setNodes)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  // Load all own unit requests + refresh dbUser (unit_node_ids) together on mount/token change
  useEffect(() => {
    if (!token) return;
    setReqsLoading(true);
    Promise.all([
      userService.unitRequests.list(token),
      refreshProfile(),
    ])
      .then(([reqs]) => setAllReqs(reqs))
      .catch(() => {})
      .finally(() => setReqsLoading(false));
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRemove = async (nodeId: string) => {
    setRemoving(nodeId);
    setError(null);
    try {
      await userService.unitRequests.create(token!, nodeId, undefined, 'remove');
      const [reqs] = await Promise.all([
        userService.unitRequests.list(token!),
        refreshProfile(),
      ]);
      setAllReqs(reqs);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to submit removal request');
    } finally {
      setRemoving(null);
    }
  };

  const handleRequest = async (nodeId: string, notes: string) => {
    await userService.unitRequests.create(token!, nodeId, notes || undefined, 'add');
    const [reqs] = await Promise.all([
      userService.unitRequests.list(token!),
      refreshProfile(),
    ]);
    setAllReqs(reqs);
  };

  return (
    <Card variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ApartmentIcon color="primary" fontSize="small" />
            <Typography fontWeight={700} fontSize={16}>My Flats</Typography>
            {nodeIds.length > 0 && (
              <Chip
                label={nodeIds.length}
                size="small"
                sx={{ bgcolor: '#ede9fe', color: '#6366f1', fontWeight: 700, fontSize: 11, height: 20 }}
              />
            )}
          </Box>
          <Button
            size="small"
            variant="outlined"
            startIcon={<SendIcon sx={{ fontSize: '14px !important' }} />}
            onClick={() => setAddOpen(true)}
            disabled={loading || nodes.length === 0}
            sx={{ fontSize: 12 }}
          >
            Request Flat
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>
        )}

        {/* Unified flat list: assigned flats + pending/rejected add requests */}
        {loading || reqsLoading ? (
          <Box>
            <Skeleton height={52} sx={{ borderRadius: 1.5, mb: 1 }} />
            <Skeleton height={52} sx={{ borderRadius: 1.5 }} />
          </Box>
        ) : nodeIds.length === 0 && addReqsToShow.length === 0 ? (
          <Box
            sx={{
              p: 2.5, borderRadius: 1.5,
              border: '1px dashed', borderColor: 'divider',
              textAlign: 'center', color: 'text.secondary', fontSize: 13,
            }}
          >
            No flats linked yet. Click &ldquo;Request Flat&rdquo; to submit a request.
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {/* Currently assigned flats */}
            {nodeIds.map((nodeId) => {
              const path = nodes.length ? buildNodePath(nodes, nodeId) : nodeId;
              const leaf = nodes.find((n) => n.id === nodeId);
              const hasPendingRemove = allReqs.some(
                (r) => r.node_id === nodeId && r.type === 'remove' && r.status === 'pending',
              );
              const hasRejectedRemove = !hasPendingRemove && allReqs.some(
                (r) => r.node_id === nodeId && r.type === 'remove' && r.status === 'rejected',
              );
              const bg = hasPendingRemove ? '#fff7ed' : hasRejectedRemove ? 'action.hover' : '#ede9fe';
              const border = hasPendingRemove ? '#fed7aa' : hasRejectedRemove ? '#cbd5e1' : '#c4b5fd';
              const iconColor = hasPendingRemove ? '#ea580c' : hasRejectedRemove ? 'text.secondary' : '#6366f1';
              const textColor = hasPendingRemove ? '#9a3412' : hasRejectedRemove ? 'text.secondary' : '#3730a3';
              const subColor = hasPendingRemove ? '#ea580c' : hasRejectedRemove ? '#64748b' : '#6366f1';
              const subPrefix = hasPendingRemove
                ? 'Removal pending approval · '
                : hasRejectedRemove
                ? 'Removal request declined · '
                : '';
              return (
                <Box
                  key={nodeId}
                  sx={{ p: 1.5, borderRadius: 1.5, bgcolor: bg, border: `1px solid ${border}`, display: 'flex', alignItems: 'center', gap: 1.5 }}
                >
                  <ApartmentIcon sx={{ color: iconColor, fontSize: 18, flexShrink: 0 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography fontWeight={700} fontSize={14} color={textColor} noWrap>
                      {leaf?.name ?? nodeId}
                    </Typography>
                    <Typography fontSize={12} color={subColor} noWrap>
                      {subPrefix}{path}
                    </Typography>
                  </Box>
                  {hasPendingRemove && (
                    <Chip label="Removal Pending" size="small" sx={{ bgcolor: '#ffedd5', color: '#9a3412', fontWeight: 700, fontSize: 10, height: 18 }} />
                  )}
                  {hasRejectedRemove && (
                    <Chip label="Declined" size="small" sx={{ bgcolor: 'action.hover', color: 'text.secondary', fontWeight: 700, fontSize: 10, height: 18 }} />
                  )}
                  <Tooltip title={hasPendingRemove ? 'Removal already pending' : hasRejectedRemove ? 'Re-request removal' : 'Request removal'}>
                    <span>
                      <IconButton
                        size="small"
                        onClick={() => handleRemove(nodeId)}
                        disabled={removing === nodeId || hasPendingRemove}
                        sx={{ color: '#dc2626', '&:hover': { bgcolor: '#fee2e2' } }}
                      >
                        {removing === nodeId
                          ? <CircularProgress size={14} />
                          : hasRejectedRemove
                          ? <ReplayIcon fontSize="small" />
                          : <CloseIcon fontSize="small" />}
                      </IconButton>
                    </span>
                  </Tooltip>
                </Box>
              );
            })}

            {/* Pending / rejected add requests not yet in user_units */}
            {addReqsToShow.map((req) => {
              const path = nodes.length ? buildNodePath(nodes, req.node_id) : req.node_id;
              const leaf = nodes.find((n) => n.id === req.node_id);
              const isPending = req.status === 'pending';
              const style = isPending
                ? { bg: '#fef9c3', border: '#fde68a', icon: '#d97706', text: '#92400e', sub: '#b45309', chipBg: '#fef3c7', chipColor: '#92400e', chipLabel: 'Pending', subText: 'Awaiting admin approval' }
                : { bg: 'action.hover', border: '#cbd5e1', icon: 'text.secondary', text: 'text.secondary', sub: '#64748b', chipBg: 'action.hover', chipColor: 'text.secondary', chipLabel: 'Not Approved', subText: 'Request not approved' };
              return (
                <Box
                  key={req.id}
                  sx={{ p: 1.5, borderRadius: 1.5, bgcolor: style.bg, border: `1px solid ${style.border}`, display: 'flex', alignItems: 'center', gap: 1.5 }}
                >
                  <ApartmentIcon sx={{ color: style.icon, fontSize: 18, flexShrink: 0 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography fontWeight={700} fontSize={14} color={style.text} noWrap>
                      {leaf?.name ?? req.node_id}
                    </Typography>
                    <Typography fontSize={12} color={style.sub} noWrap>
                      {style.subText} · {path}
                    </Typography>
                  </Box>
                  <Chip label={style.chipLabel} size="small" sx={{ bgcolor: style.chipBg, color: style.chipColor, fontWeight: 700, fontSize: 10, height: 18 }} />
                  {!isPending && (
                    <Tooltip title="Re-request flat">
                      <IconButton
                        size="small"
                        onClick={() => handleRequest(req.node_id, req.notes ?? '')}
                        sx={{ color: '#6366f1', '&:hover': { bgcolor: '#ede9fe' } }}
                      >
                        <ReplayIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              );
            })}
          </Box>
        )}

        <Typography fontSize={12} color="text.disabled" sx={{ mt: 1.5 }}>
          Multiple members can share the same flat. You can hold more than one flat.
        </Typography>
      </CardContent>

      {/* All users go through the request flow; privileged requests are auto-approved */}
      <RequestFlatDialog
        open={addOpen}
        nodes={nodes}
        existingNodeIds={nodeIds}
        pendingNodeIds={pendingNodeIds}
        onClose={() => setAddOpen(false)}
        onSubmit={handleRequest}
      />
    </Card>
  );
}

// ── Leave Society ────────────────────────────────────────────────────────────
function LeaveSocietyCard() {
  const { token, logout } = useAuth();
  const [request,    setRequest]    = useState<LeaveRequest | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason,     setReason]     = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [finalizing,  setFinalizing]  = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    userService.leaveRequests.mine(token)
      .then(setRequest)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const req = await userService.leaveRequests.create(token!, reason.trim() || undefined);
      setRequest(req);
      setReasonOpen(false);
      setReason('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to submit leave request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = async () => {
    if (!token || !request) return;
    setDownloading(true);
    setError(null);
    try {
      const data = await userService.leaveRequests.activityExport(token, request.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `activity-history-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to download activity history');
    } finally {
      setDownloading(false);
    }
  };

  const handleConfirm = async () => {
    if (!token || !request) return;
    setFinalizing(true);
    setError(null);
    try {
      await userService.leaveRequests.confirm(token, request.id);
      logout();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to finalize account deletion');
      setFinalizing(false);
    }
  };

  if (loading) {
    return (
      <Card variant="outlined" sx={{ borderRadius: 2 }}>
        <CardContent sx={{ p: 3 }}>
          <Skeleton width={180} height={28} />
        </CardContent>
      </Card>
    );
  }

  const status = request?.status;
  const blockers = request?.blockers ?? [];

  return (
    <Card variant="outlined" sx={{ borderRadius: 2, borderColor: '#fecaca' }}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <ExitToAppIcon color="error" fontSize="small" />
          <Typography fontWeight={700} fontSize={16} color="error.main">Leave Society</Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>
        )}

        {(!status || status === 'rejected' || status === 'revoked') && (
          <>
            {status === 'revoked' && request?.review_note && (
              <Alert severity="warning" sx={{ mb: 2 }}>{request.review_note}</Alert>
            )}
            {status === 'rejected' && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Your previous request was rejected{request?.review_note ? `: ${request.review_note}` : '.'}
              </Alert>
            )}
            <Typography fontSize={13} color="text.secondary" sx={{ mb: 2 }}>
              Leaving the society permanently deletes your account and all associated data, once
              approved and confirmed by you.
            </Typography>
            <Button variant="outlined" color="error" onClick={() => setReasonOpen(true)}>
              Leave Society
            </Button>
          </>
        )}

        {status === 'pending' && (
          <Alert severity="info">Your leave request is awaiting admin review.</Alert>
        )}

        {status === 'approved' && (
          <>
            <Alert severity="success" sx={{ mb: 2 }}>
              Your leave request has been approved. You can now finalize leaving the society.
            </Alert>
            <Button variant="contained" color="error" onClick={() => setConfirmOpen(true)}>
              Leave Society Now
            </Button>
          </>
        )}
      </CardContent>

      {/* Submit request dialog */}
      <Dialog open={reasonOpen} onClose={() => setReasonOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Request to Leave the Society</DialogTitle>
        <DialogContent>
          <Typography fontSize={13} color="text.secondary" sx={{ mb: 2 }}>
            Your request will be sent to an admin for approval. You'll get a chance to review and
            confirm before anything is deleted.
          </Typography>
          <TextField
            label="Reason (optional)"
            fullWidth
            multiline
            minRows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReasonOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" disabled={submitting} onClick={handleSubmit}>
            {submitting ? 'Submitting…' : 'Submit Request'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Final irreversible confirmation dialog */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Leave Society — Final Confirmation</DialogTitle>
        <DialogContent>
          {blockers.length > 0 ? (
            <>
              <Alert severity="warning" sx={{ mb: 2 }}>
                You can't leave yet — resolve the following first:
              </Alert>
              {blockers.map((b, i) => (
                <Typography key={i} fontSize={13} sx={{ mb: 1 }}>• {b}</Typography>
              ))}
            </>
          ) : (
            <>
              <Alert severity="error" sx={{ mb: 2 }}>
                This will permanently delete all your data — profile, registrations, tickets, and
                payment history. This cannot be undone.
              </Alert>
              <Button variant="outlined" fullWidth disabled={downloading} onClick={handleDownload} sx={{ mb: 1 }}>
                {downloading ? 'Preparing download…' : 'Download my activity history'}
              </Button>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          {blockers.length === 0 && (
            <Button variant="contained" color="error" disabled={finalizing} onClick={handleConfirm}>
              {finalizing ? 'Leaving…' : 'Confirm & Leave'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export function Profile() {
  const { user }                    = useAuth();
  const { dbUser, isSyncing, syncError } = useUserService();
  const location = useLocation();
  const leaveSectionRef = useRef<HTMLDivElement>(null);

  const role = user?.primaryRole ?? 'resident';

  // Lets the avatar menu's "Leave Society" shortcut jump straight to that card instead of
  // just landing on top of the profile page and making the user scroll to find it.
  useEffect(() => {
    if (location.hash === '#leave-society' && !isSyncing) {
      leaveSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.hash, isSyncing]);

  return (
    <Box component="main">

      {/* Hero */}
      <Box
        sx={{
          background: 'linear-gradient(135deg, #1e293b 0%, #312e81 100%)',
          color: '#fff',
          py: { xs: 5, md: 7 },
          px: 3,
        }}
      >
        <Container maxWidth="lg">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
            <ProfileAvatar dark />

            <Box>
              <Typography variant="h5" fontWeight={800} sx={{ mb: 0.5 }}>
                {isSyncing ? <Skeleton width={180} sx={{ bgcolor: 'rgba(255,255,255,0.12)' }} /> : (dbUser?.name ?? user?.name)}
              </Typography>
              <Typography sx={{ color: '#a5b4fc', fontSize: 14, mb: 1 }}>
                {user?.email}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                <Chip
                  label={ROLE_LABELS[role] ?? role}
                  size="small"
                  sx={{
                    bgcolor: ROLE_COLORS[role] ?? '#64748b',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 11,
                    height: 22,
                  }}
                />
                {dbUser?.unit_node_ids && dbUser.unit_node_ids.length > 0 && (
                  <HeroUnitChips nodeIds={dbUser.unit_node_ids} />
                )}
              </Box>
            </Box>
          </Box>
        </Container>
      </Box>

      {/* Content */}
      <Box sx={{ py: 5, px: 3 }}>
        <Container maxWidth="md">

          {syncError && (
            <Alert severity="warning" sx={{ mb: 3 }}>
              Could not reach User Service: {syncError}. Changes may not be saved.
            </Alert>
          )}

          <Grid container spacing={3}>
            <Grid item xs={12}>
              {isSyncing ? (
                <Card variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardContent sx={{ p: 3 }}>
                    <Skeleton width={200} height={28} sx={{ mb: 2 }} />
                    <Grid container spacing={2}>
                      {[1, 2, 3].map((n) => (
                        <Grid item xs={12} sm={6} key={n}>
                          <Skeleton height={40} />
                        </Grid>
                      ))}
                    </Grid>
                  </CardContent>
                </Card>
              ) : (
                <PersonalInfoCard />
              )}
            </Grid>

            <Grid item xs={12}>
              <Divider />
            </Grid>

            <Grid item xs={12}>
              {isSyncing ? (
                <Card variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardContent sx={{ p: 3 }}>
                    <Skeleton width={160} height={28} sx={{ mb: 2 }} />
                    <Skeleton height={56} sx={{ borderRadius: 1.5 }} />
                    <Skeleton height={56} sx={{ borderRadius: 1.5, mt: 1 }} />
                  </CardContent>
                </Card>
              ) : (
                <MyFlatsCard />
              )}
            </Grid>

            <Grid item xs={12}>
              <Divider />
            </Grid>

            <Grid item xs={12} ref={leaveSectionRef}>
              {isSyncing ? (
                <Card variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardContent sx={{ p: 3 }}>
                    <Skeleton width={160} height={28} />
                  </CardContent>
                </Card>
              ) : (
                <LeaveSocietyCard />
              )}
            </Grid>
          </Grid>
        </Container>
      </Box>
    </Box>
  );
}
