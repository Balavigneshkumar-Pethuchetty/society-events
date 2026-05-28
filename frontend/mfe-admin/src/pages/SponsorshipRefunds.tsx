import React, { useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip,
  Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, Paper, Stack, Tab, Tabs, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';

type RefundStatus = 'pending' | 'approved' | 'rejected' | 'processed';

interface RefundRequest {
  id: string;
  sponsor: string;
  sponsorContact: string;
  eventTitle: string;
  sponsorshipAmount: number;
  sponsorshipStatus: string;
  refundAmount: number;
  requestedDate: string;
  reason: string;
  status: RefundStatus;
}

const SIDEBAR = ['Dashboard', 'Users', 'Events', 'Sponsors', 'Categories', 'Payments & Refunds', 'Reports', 'Settings'];

function AdminSidebar({ active }: { active: string }) {
  return (
    <Box sx={{ width: 220, borderRight: '1px solid', borderColor: 'divider', bgcolor: '#f8fafc', flexShrink: 0 }}>
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
            '&:hover': { bgcolor: item === active ? '#ede9fe' : '#f1f5f9', color: item === active ? '#6366f1' : '#0f172a' },
          }}
        >
          {item}
        </Box>
      ))}
    </Box>
  );
}

const STATUS_MAP: Record<RefundStatus, { label: string; color: 'warning' | 'success' | 'error' | 'default' }> = {
  pending:   { label: 'Pending',   color: 'warning' },
  approved:  { label: 'Approved',  color: 'success' },
  rejected:  { label: 'Rejected',  color: 'error' },
  processed: { label: 'Processed', color: 'default' },
};

export function SponsorshipRefunds() {
  const [tab, setTab] = useState(1);
  const [requests, setRequests] = useState<RefundRequest[]>([
    {
      id: 'e1',
      sponsor: 'TechCorp Solutions',
      sponsorContact: 'Kavya Reddy',
      eventTitle: 'Annual Sports Day 2026',
      sponsorshipAmount: 10000,
      sponsorshipStatus: 'pledged',
      refundAmount: 5000,
      requestedDate: '12 May 2026',
      reason: 'Event capacity was reduced; requesting partial refund for the unsupported portion.',
      status: 'pending',
    },
  ]);

  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen,  setRejectOpen]  = useState(false);
  const [activeId,    setActiveId]    = useState<string | null>(null);
  const [approvedAmt, setApprovedAmt] = useState('5000');
  const [orgNote,     setOrgNote]     = useState('');
  const [rejectNote,  setRejectNote]  = useState('');

  const activeReq = requests.find((r) => r.id === activeId);

  const handleApprove = () => {
    setRequests((prev) => prev.map((r) => r.id === activeId ? { ...r, status: 'approved' } : r));
    setApproveOpen(false);
    setOrgNote('');
  };

  const handleReject = () => {
    setRequests((prev) => prev.map((r) => r.id === activeId ? { ...r, status: 'rejected' } : r));
    setRejectOpen(false);
    setRejectNote('');
  };

  const pending   = requests.filter((r) => r.status === 'pending').length;
  const approved  = requests.filter((r) => r.status === 'approved').length;
  const totalAmt  = requests.reduce((a, r) => a + r.refundAmount, 0);

  const stats = [
    { label: 'Total Requests',    value: requests.length, color: '#6366f1' },
    { label: 'Pending Review',    value: pending,          color: '#f59e0b' },
    { label: 'Approved',          value: approved,         color: '#10b981' },
    { label: 'Total Refund Amt',  value: `₹${totalAmt.toLocaleString()}`, color: '#0f172a' },
  ];

  return (
    <Box component="main" sx={{ display: 'flex', minHeight: 'calc(100vh - 60px)' }}>
      <AdminSidebar active="Payments & Refunds" />

      <Box sx={{ flex: 1, p: { xs: 2, md: 4 } }}>
        <Typography variant="h5" fontWeight={800} sx={{ mb: 3 }}>Payments &amp; Refunds</Typography>

        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 4, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Tab label="Resident Payment Refunds" />
          <Tab label="Sponsorship Refunds" />
        </Tabs>

        <Grid container spacing={2.5} sx={{ mb: 4 }}>
          {stats.map((s) => (
            <Grid item xs={6} md={3} key={s.label}>
              <Card variant="outlined" sx={{ borderRadius: 2 }}>
                <CardContent sx={{ textAlign: 'center', py: 2 }}>
                  <Typography fontSize={28} fontWeight={800} sx={{ color: s.color }}>{s.value}</Typography>
                  <Typography fontSize={11} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, mt: 0.5 }}>{s.label}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                {['Sponsor', 'Event', 'Sponsorship', 'Refund Req.', 'Requested', 'Reason', 'Status', 'Actions'].map((h) => (
                  <TableCell key={h} sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'text.secondary', letterSpacing: 0.4 }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {requests.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>
                    <Typography fontWeight={700} fontSize={14}>{r.sponsor}</Typography>
                    <Typography fontSize={12} color="text.secondary">{r.sponsorContact}</Typography>
                  </TableCell>
                  <TableCell><Typography fontWeight={600} fontSize={13}>{r.eventTitle}</Typography></TableCell>
                  <TableCell>
                    <Typography fontSize={13}>₹{r.sponsorshipAmount.toLocaleString()}</Typography>
                    <Chip label={r.sponsorshipStatus} size="small" color="warning" sx={{ fontSize: 10, fontWeight: 700, mt: 0.5 }} />
                  </TableCell>
                  <TableCell><Typography fontWeight={700} color="error.main">₹{r.refundAmount.toLocaleString()}</Typography></TableCell>
                  <TableCell><Typography fontSize={13}>{r.requestedDate}</Typography></TableCell>
                  <TableCell sx={{ maxWidth: 200 }}>
                    <Typography fontSize={12} color="text.secondary">{r.reason}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={STATUS_MAP[r.status].label} color={STATUS_MAP[r.status].color} size="small" sx={{ fontWeight: 700 }} />
                  </TableCell>
                  <TableCell>
                    {r.status === 'pending' && (
                      <Stack direction="row" spacing={1}>
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          startIcon={<CheckIcon />}
                          onClick={() => { setActiveId(r.id); setApprovedAmt(String(r.refundAmount)); setApproveOpen(true); }}
                        >
                          Approve
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          startIcon={<CloseIcon />}
                          onClick={() => { setActiveId(r.id); setRejectOpen(true); }}
                        >
                          Reject
                        </Button>
                      </Stack>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      </Box>

      <Dialog open={approveOpen} onClose={() => setApproveOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle fontWeight={700}>Approve Sponsorship Refund</DialogTitle>
        <DialogContent dividers>
          {activeReq && (
            <>
              <Typography fontSize={14} color="text.secondary" sx={{ mb: 2.5 }}>
                {activeReq.sponsor} · {activeReq.eventTitle}
              </Typography>
              <Grid container spacing={2} sx={{ mb: 2.5 }}>
                <Grid item xs={6}>
                  <Typography fontSize={11} fontWeight={700} color="text.secondary" sx={{ mb: 0.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>Sponsorship Amount</Typography>
                  <Typography fontWeight={700}>₹{activeReq.sponsorshipAmount.toLocaleString()}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography fontSize={11} fontWeight={700} color="text.secondary" sx={{ mb: 0.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>Requested Refund</Typography>
                  <Typography fontWeight={700} color="error.main">₹{activeReq.refundAmount.toLocaleString()}</Typography>
                </Grid>
              </Grid>
            </>
          )}
          <Stack spacing={2.5}>
            <TextField
              label="Approved Refund Amount (₹)"
              type="number"
              fullWidth
              size="small"
              value={approvedAmt}
              onChange={(e) => setApprovedAmt(e.target.value)}
            />
            <TextField
              label="Organizer Note (optional)"
              multiline
              rows={2}
              fullWidth
              size="small"
              value={orgNote}
              onChange={(e) => setOrgNote(e.target.value)}
              placeholder="Add a note for the sponsor…"
            />
            <Alert severity="info" sx={{ borderRadius: 1.5 }}>
              Approving will update the sponsorship status to <strong>Refund Requested</strong> and notify the sponsor.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setApproveOpen(false)}>Cancel</Button>
          <Button variant="contained" color="success" startIcon={<CheckIcon />} onClick={handleApprove}>
            Confirm Approval
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle fontWeight={700}>Reject Refund Request</DialogTitle>
        <DialogContent dividers>
          {activeReq && (
            <Typography fontSize={14} color="text.secondary" sx={{ mb: 2 }}>
              {activeReq.sponsor} · ₹{activeReq.refundAmount.toLocaleString()} refund request
            </Typography>
          )}
          <TextField
            label="Rejection Reason *"
            multiline
            rows={3}
            fullWidth
            size="small"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="Explain why the refund is being rejected…"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setRejectOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" startIcon={<CloseIcon />} disabled={!rejectNote} onClick={handleReject}>
            Confirm Rejection
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
