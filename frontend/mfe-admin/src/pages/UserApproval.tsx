import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DbUser {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

interface ApprovedEntry {
  name: string;
  email: string;
  action: 'approved' | 'rejected';
  role?: string;
  time: string;
}

const ASSIGNABLE_ROLES = ['resident', 'committee_member', 'security_guard'];

// ── API helpers (inline — MFE cannot import from shell) ───────────────────────

function apiBase() {
  const isLocalDevHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const isStandaloneAdminDev = isLocalDevHost && ['4004', '4005'].includes(window.location.port);

  if (isStandaloneAdminDev) return `${window.location.origin}/api/users`;

  return isLocalDevHost && window.location.port !== '8080' && window.location.port !== '80'
    ? `${window.location.protocol}//${window.location.hostname}:8080/api/users`
    : `${window.location.origin}/api/users`;
}

async function apiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function listPending(token: string) {
  return apiFetch<{ total: number; items: DbUser[] }>('/users?active=false', token);
}

function approveUser(token: string, userId: string, role: string) {
  return apiFetch<DbUser>(`/users/${userId}/approve`, token, {
    method: 'POST',
    body: JSON.stringify({ role }),
  });
}

function rejectUser(token: string, userId: string) {
  return apiFetch<void>(`/users/${userId}/reject`, token, { method: 'DELETE' });
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

const SIDEBAR = ['Dashboard', 'Users', 'Events', 'Sponsors', 'Categories', 'Payments & Refunds', 'Reports', 'Settings'];

function AdminSidebar({ active }: { active: string }) {
  return (
    <Box sx={{ width: 220, borderRight: '1px solid', borderColor: 'divider', bgcolor: '#f8fafc', flexShrink: 0, minHeight: 'calc(100vh - 64px)' }}>
      {SIDEBAR.map((item) => (
        <Box
          key={item}
          sx={{
            px: 2.5, py: 1.25, fontSize: 14, cursor: 'pointer',
            color: item === active ? '#6366f1' : '#475569',
            fontWeight: item === active ? 700 : 400,
            bgcolor: item === active ? '#ede9fe' : 'transparent',
            borderRight: item === active ? '3px solid #6366f1' : '3px solid transparent',
            transition: 'all .15s',
            '&:hover': { bgcolor: item === active ? '#ede9fe' : '#f1f5f9' },
          }}
        >
          {item}
        </Box>
      ))}
    </Box>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface UserApprovalProps {
  token: string | null;
  onLogin?: () => void;
}

export function UserApproval({ token, onLogin }: UserApprovalProps) {
  console.log('[UserApproval] mounted — token present:', !!token, '| onLogin:', typeof onLogin);
  const [pending,    setPending]    = useState<DbUser[]>([]);
  const [roleMap,    setRoleMap]    = useState<Record<string, string>>({});
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [actionId,   setActionId]   = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<DbUser | null>(null);
  const [activity,   setActivity]   = useState<ApprovedEntry[]>([]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listPending(token);
      setPending(data.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (user: DbUser) => {
    const role = roleMap[user.id];
    if (!role) { setError('Select a role before approving.'); return; }
    if (!token) return;
    setActionId(user.id);
    setError(null);
    try {
      await approveUser(token, user.id, role);
      setActivity(prev => [{
        name: user.name, email: user.email, action: 'approved', role,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }, ...prev.slice(0, 9)]);
      setPending(prev => prev.filter(u => u.id !== user.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActionId(null);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectTarget || !token) return;
    const user = rejectTarget;
    setRejectTarget(null);
    setActionId(user.id);
    setError(null);
    try {
      await rejectUser(token, user.id);
      setActivity(prev => [{
        name: user.name, email: user.email, action: 'rejected',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }, ...prev.slice(0, 9)]);
      setPending(prev => prev.filter(u => u.id !== user.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActionId(null);
    }
  };

  if (!token) {
    return (
      <Container maxWidth="sm" sx={{ pt: 8, textAlign: 'center' }}>
        <Alert
          severity="warning"
          action={onLogin ? (
            <Button color="inherit" size="small" onClick={onLogin}>
              Sign in
            </Button>
          ) : undefined}
        >
          Not authenticated. Sign in with Keycloak to view this page.
        </Alert>
      </Container>
    );
  }

  return (
    <Box sx={{ display: 'flex', minHeight: 'calc(100vh - 64px)' }}>
      <AdminSidebar active="Users" />

      <Box sx={{ flex: 1, p: 3, bgcolor: '#f8fafc', overflow: 'auto' }}>

        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" fontWeight={700}>User Approval Queue</Typography>
            <Typography color="text.secondary" fontSize={14}>
              Review and activate new member registrations. Assign a role before approving.
            </Typography>
          </Box>
          {pending.length > 0 && (
            <Chip
              label={`${pending.length} pending`}
              sx={{ bgcolor: '#fef3c7', color: '#92400e', fontWeight: 600, border: '1px solid #fde68a' }}
            />
          )}
        </Box>

        {/* Stats */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, mb: 3 }}>
          {[
            { label: 'Awaiting Review', value: pending.length, color: '#f59e0b', icon: <HourglassTopIcon fontSize="small" /> },
            { label: 'Approved', value: activity.filter(a => a.action === 'approved').length, color: '#10b981', icon: <CheckCircleIcon fontSize="small" /> },
            { label: 'Rejected', value: activity.filter(a => a.action === 'rejected').length, color: '#ef4444', icon: <CancelIcon fontSize="small" /> },
          ].map(({ label, value, color, icon }) => (
            <Paper key={label} variant="outlined" sx={{ p: 2, borderLeft: `4px solid ${color}` }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, color }}>
                {icon}
                <Typography fontSize={13} color="text.secondary">{label}</Typography>
              </Box>
              <Typography variant="h4" fontWeight={700} sx={{ color }}>{value}</Typography>
            </Paper>
          ))}
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

        {/* Pending table */}
        <Paper variant="outlined" sx={{ mb: 3, overflow: 'hidden' }}>
          <Box sx={{ px: 2, py: 1.25, bgcolor: '#fffbeb', borderBottom: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: 1 }}>
            <HourglassTopIcon sx={{ fontSize: 16, color: '#92400e' }} />
            <Typography fontSize={13} fontWeight={600} color="#92400e">Pending Registrations</Typography>
          </Box>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : pending.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography fontSize={40} lineHeight={1} mb={1}>🎉</Typography>
              <Typography color="text.secondary">No pending registrations — all caught up!</Typography>
            </Box>
          ) : (
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: '#f8fafc' }}>
                  <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Email</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Registered</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 12, width: 200 }}>Assign Role</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 12, width: 200 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pending.map((u) => {
                  const busy = actionId === u.id;
                  const initials = u.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                  return (
                    <TableRow key={u.id} sx={{ bgcolor: '#fffbeb', '&:last-child td': { borderBottom: 0 } }}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Avatar sx={{ width: 30, height: 30, fontSize: 11, bgcolor: '#94a3b8' }}>{initials}</Avatar>
                          <Typography fontWeight={600} fontSize={14}>{u.name}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography fontSize={13} color="text.secondary">{u.email}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography fontSize={13} color="text.secondary">
                          {new Date(u.created_at).toLocaleString()}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Select
                          size="small"
                          displayEmpty
                          value={roleMap[u.id] ?? ''}
                          onChange={(e) => setRoleMap(prev => ({ ...prev, [u.id]: e.target.value }))}
                          sx={{ fontSize: 13, minWidth: 160 }}
                          disabled={busy}
                        >
                          <MenuItem value="" disabled><em>— select role —</em></MenuItem>
                          {ASSIGNABLE_ROLES.map(r => (
                            <MenuItem key={r} value={r} sx={{ fontSize: 13 }}>{r}</MenuItem>
                          ))}
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Button
                            size="small"
                            variant="contained"
                            disabled={busy || !roleMap[u.id]}
                            onClick={() => handleApprove(u)}
                            startIcon={busy ? <CircularProgress size={12} color="inherit" /> : <CheckCircleIcon />}
                            sx={{ bgcolor: '#16a34a', '&:hover': { bgcolor: '#15803d' }, fontSize: 12, textTransform: 'none' }}
                          >
                            Approve
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            disabled={busy}
                            onClick={() => setRejectTarget(u)}
                            startIcon={<CancelIcon />}
                            sx={{ fontSize: 12, textTransform: 'none' }}
                          >
                            Reject
                          </Button>
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Paper>

        {/* Recent activity */}
        {activity.length > 0 && (
          <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1.25, bgcolor: '#f8fafc', borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography fontSize={13} fontWeight={600} color="text.secondary">Recent Activity (this session)</Typography>
            </Box>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f8fafc' }}>
                  <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Email</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Action</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Role</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Time</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {activity.map((a, i) => (
                  <TableRow key={i} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                    <TableCell><Typography fontSize={13} fontWeight={600}>{a.name}</Typography></TableCell>
                    <TableCell><Typography fontSize={13} color="text.secondary">{a.email}</Typography></TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={a.action}
                        sx={a.action === 'approved'
                          ? { bgcolor: '#dcfce7', color: '#166534', fontWeight: 600 }
                          : { bgcolor: '#fee2e2', color: '#991b1b', fontWeight: 600 }}
                      />
                    </TableCell>
                    <TableCell>
                      {a.role
                        ? <Chip size="small" label={a.role} sx={{ bgcolor: '#ede9fe', color: '#4c1d95', fontWeight: 600 }} />
                        : <Typography fontSize={12} color="text.secondary">—</Typography>}
                    </TableCell>
                    <TableCell><Typography fontSize={12} color="text.secondary">{a.time}</Typography></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}
      </Box>

      {/* Reject confirmation dialog */}
      <Dialog open={!!rejectTarget} onClose={() => setRejectTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, color: '#991b1b' }}>Reject Registration</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will remove <strong>{rejectTarget?.name}</strong> ({rejectTarget?.email}) from the pending queue.
            They will need to re-register and contact the society office for access.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRejectTarget(null)} variant="outlined" size="small">Cancel</Button>
          <Button onClick={handleRejectConfirm} variant="contained" color="error" size="small">Confirm Reject</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
