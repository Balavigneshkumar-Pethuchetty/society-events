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
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import BlockIcon from '@mui/icons-material/Block';
import PeopleIcon from '@mui/icons-material/People';
import SaveIcon from '@mui/icons-material/Save';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DbUser {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

interface AdminBreakdown {
  admin_id: string | null;
  admin_name: string;
  approved: number;
  rejected: number;
  removed: number;
  revoked: number;
}

interface AdminAction {
  id: string;
  admin_name: string;
  target_user_name: string;
  target_user_email: string;
  action: string;
  role?: string;
  performed_at: string;
}

interface AdminStats {
  total_pending: number;
  total_approved: number;
  total_rejected: number;
  total_removed: number;
  total_revoked: number;
  by_admin: AdminBreakdown[];
  recent_actions: AdminAction[];
}

const ASSIGNABLE_ROLES = ['resident', 'committee_member', 'security_guard'];
const ALL_ROLES = ['admin', 'committee_member', 'resident', 'security_guard', 'sponsor'];

const ACTION_COLORS: Record<string, { bg: string; color: string }> = {
  approved:     { bg: '#dcfce7', color: '#166534' },
  rejected:     { bg: '#fee2e2', color: '#991b1b' },
  removed:      { bg: '#fce7f3', color: '#9d174d' },
  revoked:      { bg: '#fef3c7', color: '#92400e' },
  role_changed: { bg: '#e0f2fe', color: '#0369a1' },
};

// ── API helpers ───────────────────────────────────────────────────────────────

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
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const listPending     = (t: string) => apiFetch<{ total: number; items: DbUser[] }>('/users?active=false', t);
const listActive      = (t: string) => apiFetch<{ total: number; items: DbUser[] }>('/users?active=true', t);
const getAdminStats   = (t: string) => apiFetch<AdminStats>('/users/admin-stats', t);
const approveUser     = (t: string, id: string, role: string) =>
  apiFetch<DbUser>(`/users/${id}/approve`, t, { method: 'POST', body: JSON.stringify({ role }) });
const rejectUser      = (t: string, id: string) =>
  apiFetch<void>(`/users/${id}/reject`, t, { method: 'DELETE' });
const revokeUser      = (t: string, id: string) =>
  apiFetch<DbUser>(`/users/${id}/revoke`, t, { method: 'PATCH' });
const removeUser      = (t: string, id: string) =>
  apiFetch<void>(`/users/${id}`, t, { method: 'DELETE' });
const changeUserRole  = (t: string, id: string, role: string) =>
  apiFetch<DbUser>(`/users/${id}/role`, t, { method: 'PATCH', body: JSON.stringify({ role }) });

// ── Sidebar ───────────────────────────────────────────────────────────────────

const SIDEBAR = ['Dashboard', 'Users', 'Events', 'Sponsors', 'Categories', 'Payments & Refunds', 'Reports', 'Settings'];

function AdminSidebar({ active }: { active: string }) {
  return (
    <Box sx={{ width: 220, borderRight: '1px solid', borderColor: 'divider', bgcolor: '#f8fafc', flexShrink: 0, minHeight: 'calc(100vh - 64px)' }}>
      {SIDEBAR.map((item) => (
        <Box key={item} sx={{
          px: 2.5, py: 1.25, fontSize: 14, cursor: 'pointer',
          color: item === active ? '#6366f1' : '#475569',
          fontWeight: item === active ? 700 : 400,
          bgcolor: item === active ? '#ede9fe' : 'transparent',
          borderRight: item === active ? '3px solid #6366f1' : '3px solid transparent',
          transition: 'all .15s',
          '&:hover': { bgcolor: item === active ? '#ede9fe' : '#f1f5f9' },
        }}>
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
  const [tab,           setTab]           = useState(0);
  const [pending,       setPending]       = useState<DbUser[]>([]);
  const [activeUsers,   setActiveUsers]   = useState<DbUser[]>([]);
  const [stats,         setStats]         = useState<AdminStats | null>(null);
  const [roleMap,       setRoleMap]       = useState<Record<string, string>>({});
  const [roleChangeMap, setRoleChangeMap] = useState<Record<string, string>>({});
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [actionId,      setActionId]      = useState<string | null>(null);
  const [rejectTarget,  setRejectTarget]  = useState<DbUser | null>(null);
  const [revokeTarget,  setRevokeTarget]  = useState<DbUser | null>(null);
  const [removeTarget,  setRemoveTarget]  = useState<DbUser | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [pendingData, activeData, statsData] = await Promise.all([
        listPending(token),
        listActive(token),
        getAdminStats(token),
      ]);
      setPending(pendingData.items);
      setActiveUsers(activeData.items);
      setStats(statsData);
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
    setActionId(user.id); setError(null);
    try { await approveUser(token, user.id, role); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setActionId(null); }
  };

  const handleRejectConfirm = async () => {
    if (!rejectTarget || !token) return;
    const user = rejectTarget; setRejectTarget(null);
    setActionId(user.id); setError(null);
    try { await rejectUser(token, user.id); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setActionId(null); }
  };

  const handleRevokeConfirm = async () => {
    if (!revokeTarget || !token) return;
    const user = revokeTarget; setRevokeTarget(null);
    setActionId(user.id); setError(null);
    try { await revokeUser(token, user.id); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setActionId(null); }
  };

  const handleRoleChange = async (user: DbUser) => {
    const newRole = roleChangeMap[user.id];
    if (!newRole || newRole === user.role || !token) return;
    setActionId(user.id); setError(null);
    try {
      await changeUserRole(token, user.id, newRole);
      setRoleChangeMap(prev => { const n = { ...prev }; delete n[user.id]; return n; });
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setActionId(null); }
  };

  const handleRemoveConfirm = async () => {
    if (!removeTarget || !token) return;
    const user = removeTarget; setRemoveTarget(null);
    setActionId(user.id); setError(null);
    try { await removeUser(token, user.id); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setActionId(null); }
  };

  const initials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  if (!token) {
    return (
      <Container maxWidth="sm" sx={{ pt: 8, textAlign: 'center' }}>
        <Alert severity="warning" action={onLogin
          ? <Button color="inherit" size="small" onClick={onLogin}>Sign in</Button>
          : undefined}>
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
            <Typography variant="h5" fontWeight={700}>User Management</Typography>
            <Typography color="text.secondary" fontSize={14}>
              Approve, reject, revoke or remove society members.
            </Typography>
          </Box>
          {pending.length > 0 && (
            <Chip label={`${pending.length} pending`}
              sx={{ bgcolor: '#fef3c7', color: '#92400e', fontWeight: 600, border: '1px solid #fde68a' }} />
          )}
        </Box>

        {/* Stats — DB-backed, all-time totals */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2, mb: 3 }}>
          {[
            { label: 'Pending',  value: stats?.total_pending  ?? pending.length, color: '#f59e0b', icon: <HourglassTopIcon fontSize="small" /> },
            { label: 'Approved', value: stats?.total_approved ?? 0,              color: '#10b981', icon: <CheckCircleIcon fontSize="small" /> },
            { label: 'Rejected', value: stats?.total_rejected ?? 0,              color: '#ef4444', icon: <CancelIcon fontSize="small" /> },
            { label: 'Revoked',  value: stats?.total_revoked  ?? 0,              color: '#f59e0b', icon: <BlockIcon fontSize="small" /> },
            { label: 'Removed',  value: stats?.total_removed  ?? 0,              color: '#ec4899', icon: <DeleteForeverIcon fontSize="small" /> },
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

        {/* Tabs: Pending Queue | Active Users */}
        <Paper variant="outlined" sx={{ mb: 3, overflow: 'hidden' }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)}
            sx={{ borderBottom: '1px solid', borderColor: 'divider', bgcolor: '#f8fafc', px: 1 }}>
            <Tab label={`Pending Queue (${pending.length})`}
              sx={{ fontSize: 13, textTransform: 'none', fontWeight: 600 }} />
            <Tab label={`Active Users (${activeUsers.length})`}
              sx={{ fontSize: 13, textTransform: 'none', fontWeight: 600 }} />
          </Tabs>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : tab === 0 ? (
            /* ── Pending Queue ── */
            pending.length === 0 ? (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography fontSize={40} lineHeight={1} mb={1}>🎉</Typography>
                <Typography color="text.secondary">No pending registrations — all caught up!</Typography>
              </Box>
            ) : (
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#fffbeb' }}>
                    <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Name</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Email</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Registered</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: 12, width: 200 }}>Assign Role</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: 12, width: 220 }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pending.map((u) => {
                    const busy = actionId === u.id;
                    return (
                      <TableRow key={u.id} sx={{ bgcolor: '#fffbeb', '&:last-child td': { borderBottom: 0 } }}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Avatar sx={{ width: 30, height: 30, fontSize: 11, bgcolor: '#94a3b8' }}>{initials(u.name)}</Avatar>
                            <Typography fontWeight={600} fontSize={14}>{u.name}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell><Typography fontSize={13} color="text.secondary">{u.email}</Typography></TableCell>
                        <TableCell><Typography fontSize={13} color="text.secondary">{new Date(u.created_at).toLocaleString()}</Typography></TableCell>
                        <TableCell>
                          <Select size="small" displayEmpty value={roleMap[u.id] ?? ''}
                            onChange={(e) => setRoleMap(prev => ({ ...prev, [u.id]: e.target.value }))}
                            sx={{ fontSize: 13, minWidth: 160 }} disabled={busy}>
                            <MenuItem value="" disabled><em>— select role —</em></MenuItem>
                            {ASSIGNABLE_ROLES.map(r => <MenuItem key={r} value={r} sx={{ fontSize: 13 }}>{r}</MenuItem>)}
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button size="small" variant="contained" disabled={busy || !roleMap[u.id]}
                              onClick={() => handleApprove(u)}
                              startIcon={busy ? <CircularProgress size={12} color="inherit" /> : <CheckCircleIcon />}
                              sx={{ bgcolor: '#16a34a', '&:hover': { bgcolor: '#15803d' }, fontSize: 12, textTransform: 'none' }}>
                              Approve
                            </Button>
                            <Button size="small" variant="outlined" color="error" disabled={busy}
                              onClick={() => setRejectTarget(u)} startIcon={<CancelIcon />}
                              sx={{ fontSize: 12, textTransform: 'none' }}>
                              Reject
                            </Button>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )
          ) : (
            /* ── Active Users ── */
            activeUsers.length === 0 ? (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography color="text.secondary">No active users found.</Typography>
              </Box>
            ) : (
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Name</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Email</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: 12, width: 230 }}>Role</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Registered</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: 12, width: 200 }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {activeUsers.map((u) => {
                    const busy = actionId === u.id;
                    return (
                      <TableRow key={u.id} sx={{ '&:last-child td': { borderBottom: 0 }, '&:hover': { bgcolor: '#f8fafc' } }}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Avatar sx={{ width: 30, height: 30, fontSize: 11, bgcolor: '#6366f1' }}>{initials(u.name)}</Avatar>
                            <Typography fontWeight={600} fontSize={14}>{u.name}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell><Typography fontSize={13} color="text.secondary">{u.email}</Typography></TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Select
                              size="small"
                              value={roleChangeMap[u.id] ?? u.role}
                              onChange={(e) => setRoleChangeMap(prev => ({ ...prev, [u.id]: e.target.value }))}
                              sx={{ fontSize: 12, minWidth: 155 }}
                              disabled={busy}
                            >
                              {ALL_ROLES.map(r => (
                                <MenuItem key={r} value={r} sx={{ fontSize: 13 }}>{r}</MenuItem>
                              ))}
                            </Select>
                            {roleChangeMap[u.id] && roleChangeMap[u.id] !== u.role && (
                              <Tooltip title="Save role change">
                                <span>
                                  <Button size="small" variant="contained" disabled={busy}
                                    onClick={() => handleRoleChange(u)}
                                    startIcon={busy ? <CircularProgress size={12} color="inherit" /> : <SaveIcon />}
                                    sx={{ fontSize: 11, textTransform: 'none', bgcolor: '#6366f1',
                                      '&:hover': { bgcolor: '#4f46e5' }, minWidth: 0, px: 1.5 }}>
                                    Save
                                  </Button>
                                </span>
                              </Tooltip>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell><Typography fontSize={13} color="text.secondary">{new Date(u.created_at).toLocaleString()}</Typography></TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <Tooltip title="Revoke access — moves user back to pending">
                              <span>
                                <Button size="small" variant="outlined" disabled={busy}
                                  onClick={() => setRevokeTarget(u)} startIcon={<BlockIcon />}
                                  sx={{ fontSize: 11, textTransform: 'none', borderColor: '#f59e0b', color: '#b45309',
                                    '&:hover': { bgcolor: '#fef3c7', borderColor: '#d97706' } }}>
                                  Revoke
                                </Button>
                              </span>
                            </Tooltip>
                            <Tooltip title="Permanently delete user from the system">
                              <span>
                                <Button size="small" variant="outlined" color="error" disabled={busy}
                                  onClick={() => setRemoveTarget(u)} startIcon={<DeleteForeverIcon />}
                                  sx={{ fontSize: 11, textTransform: 'none' }}>
                                  Remove
                                </Button>
                              </span>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )
          )}
        </Paper>

        {/* Per-admin breakdown — from DB */}
        {stats && stats.by_admin.length > 0 && (
          <Paper variant="outlined" sx={{ mb: 3, overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1.25, bgcolor: '#f0f4ff', borderBottom: '1px solid', borderColor: '#c7d2fe',
              display: 'flex', alignItems: 'center', gap: 1 }}>
              <PeopleIcon sx={{ fontSize: 16, color: '#6366f1' }} />
              <Typography fontSize={13} fontWeight={600} color="#3730a3">Admin Activity Breakdown</Typography>
            </Box>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f8fafc' }}>
                  <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Admin</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 12, color: '#16a34a' }}>Approved</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 12, color: '#dc2626' }}>Rejected</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 12, color: '#d97706' }}>Revoked</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 12, color: '#db2777' }}>Removed</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {stats.by_admin.map((a, i) => (
                  <TableRow key={i} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                    <TableCell><Typography fontSize={13} fontWeight={600}>{a.admin_name}</Typography></TableCell>
                    <TableCell><Typography fontSize={13} color="#16a34a" fontWeight={600}>{a.approved}</Typography></TableCell>
                    <TableCell><Typography fontSize={13} color="#dc2626" fontWeight={600}>{a.rejected}</Typography></TableCell>
                    <TableCell><Typography fontSize={13} color="#d97706" fontWeight={600}>{a.revoked}</Typography></TableCell>
                    <TableCell><Typography fontSize={13} color="#db2777" fontWeight={600}>{a.removed}</Typography></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}

        {/* Recent activity — all admins, from DB */}
        {stats && stats.recent_actions.length > 0 && (
          <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1.25, bgcolor: '#f8fafc', borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography fontSize={13} fontWeight={600} color="text.secondary">
                Recent Activity — all admins, all actions (persistent)
              </Typography>
            </Box>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f8fafc' }}>
                  <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>User</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Email</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Action</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Role</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>By Admin</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Time</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {stats.recent_actions.map((a) => {
                  const c = ACTION_COLORS[a.action] ?? { bg: '#f1f5f9', color: '#475569' };
                  return (
                    <TableRow key={a.id} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                      <TableCell><Typography fontSize={13} fontWeight={600}>{a.target_user_name}</Typography></TableCell>
                      <TableCell><Typography fontSize={13} color="text.secondary">{a.target_user_email}</Typography></TableCell>
                      <TableCell>
                        <Chip size="small" label={a.action} sx={{ bgcolor: c.bg, color: c.color, fontWeight: 600 }} />
                      </TableCell>
                      <TableCell>
                        {a.role
                          ? <Chip size="small" label={a.role} sx={{ bgcolor: '#ede9fe', color: '#4c1d95', fontWeight: 600 }} />
                          : <Typography fontSize={12} color="text.secondary">—</Typography>}
                      </TableCell>
                      <TableCell><Typography fontSize={13}>{a.admin_name}</Typography></TableCell>
                      <TableCell>
                        <Typography fontSize={12} color="text.secondary">
                          {new Date(a.performed_at).toLocaleString()}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Paper>
        )}
      </Box>

      {/* ── Dialogs ── */}

      <Dialog open={!!rejectTarget} onClose={() => setRejectTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, color: '#991b1b' }}>Reject Registration</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Remove <strong>{rejectTarget?.name}</strong> ({rejectTarget?.email}) from the pending queue?
            They will need to re-register.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRejectTarget(null)} variant="outlined" size="small">Cancel</Button>
          <Button onClick={handleRejectConfirm} variant="contained" color="error" size="small">Confirm Reject</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!revokeTarget} onClose={() => setRevokeTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, color: '#b45309' }}>Revoke Access</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Revoking access for <strong>{revokeTarget?.name}</strong> ({revokeTarget?.email}) will
            deactivate their account and remove their Keycloak roles. They can be re-approved later.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRevokeTarget(null)} variant="outlined" size="small">Cancel</Button>
          <Button onClick={handleRevokeConfirm} variant="contained" size="small"
            sx={{ bgcolor: '#d97706', '&:hover': { bgcolor: '#b45309' } }}>
            Confirm Revoke
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!removeTarget} onClose={() => setRemoveTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, color: '#991b1b' }}>Remove User</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Permanently remove <strong>{removeTarget?.name}</strong> ({removeTarget?.email}) from the
            system and Keycloak? <strong>This cannot be undone.</strong>
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRemoveTarget(null)} variant="outlined" size="small">Cancel</Button>
          <Button onClick={handleRemoveConfirm} variant="contained" color="error" size="small">
            Confirm Remove
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}
