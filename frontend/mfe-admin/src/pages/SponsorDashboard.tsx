import React, { useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, Container,
  Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, InputAdornment, Paper, Stack, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import UndoIcon from '@mui/icons-material/Undo';

const SPONSORSHIPS = [
  {
    id: 'd1', eventTitle: 'Diwali Mela 2025', eventDate: '25 Oct 2025',
    category: '🎆 Festival', amount: 25000, currency: 'INR',
    status: 'received' as const, notes: 'Decorations and prizes for rangoli competition',
  },
  {
    id: 'd3', eventTitle: 'Annual Sports Day 2026', eventDate: '2 Feb 2026',
    category: '🏆 Sports', amount: 10000, currency: 'INR',
    status: 'pledged' as const, notes: 'Refreshment counter',
  },
];

const REFUNDS = [
  {
    id: 'e1', eventTitle: 'Annual Sports Day 2026', amount: 5000,
    reason: 'Event capacity was reduced; requesting partial refund for the unsupported portion.',
    requestedDate: '12 May 2026', status: 'pending' as const,
  },
];

const STATUS_MAP = {
  received:         { label: 'Received',        color: 'success' as const },
  pledged:          { label: 'Pledged',          color: 'warning' as const },
  refund_requested: { label: 'Refund Requested', color: 'error'   as const },
  refunded:         { label: 'Refunded',         color: 'default' as const },
  pending:          { label: 'Pending Review',   color: 'warning' as const },
  approved:         { label: 'Approved',         color: 'success' as const },
  rejected:         { label: 'Rejected',         color: 'error'   as const },
};

interface Props { firstName?: string }

export function SponsorDashboard({ firstName = 'Sponsor' }: Props) {
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const stats = [
    { label: 'Total Sponsored',   value: '₹35,000', sub: '2 events',        icon: <MonetizationOnIcon />,     color: '#7c3aed' },
    { label: 'Received',          value: '₹25,000', sub: '1 confirmed',      icon: <CheckCircleOutlineIcon />, color: '#10b981' },
    { label: 'Pledged',           value: '₹10,000', sub: '1 pending receipt', icon: <HourglassEmptyIcon />,    color: '#f59e0b' },
    { label: 'Refund Requests',   value: '1',        sub: '1 under review',   icon: <UndoIcon />,               color: '#ef4444' },
  ];

  const handleSubmit = () => {
    setSubmitted(true);
    setRefundOpen(false);
    setRefundAmount('');
    setRefundReason('');
  };

  return (
    <Box component="main">
      <Box sx={{ background: 'linear-gradient(135deg,#1e293b 0%,#3b0764 100%)', color: '#fff', py: { xs: 5, md: 7 }, px: 3 }}>
        <Container maxWidth="lg">
          <Typography fontSize={13} sx={{ color: '#c4b5fd', fontWeight: 600, mb: 1, letterSpacing: 0.4 }}>
            Sponsor Portal
          </Typography>
          <Typography variant="h4" fontWeight={800} sx={{ mb: 0.75, fontSize: { xs: 24, md: 32 } }}>
            Welcome, {firstName} 👋
          </Typography>
          <Typography sx={{ color: '#ddd6fe', fontSize: 15 }}>TechCorp Solutions Pvt. Ltd.</Typography>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 5 }}>
        {submitted && (
          <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setSubmitted(false)}>
            Refund request submitted successfully. The organizer will review it shortly.
          </Alert>
        )}

        <Grid container spacing={2.5} sx={{ mb: 5 }}>
          {stats.map((s) => (
            <Grid item xs={12} sm={6} md={3} key={s.label}>
              <Card variant="outlined" sx={{ borderRadius: 2, transition: 'box-shadow .2s', '&:hover': { boxShadow: 3 } }}>
                <CardContent sx={{ p: 2.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                    <Box sx={{ width: 40, height: 40, borderRadius: 1.5, bgcolor: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                      {s.icon}
                    </Box>
                    <Typography fontSize={11} fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {s.label}
                    </Typography>
                  </Box>
                  <Typography fontSize={28} fontWeight={800} lineHeight={1} sx={{ color: s.color }}>{s.value}</Typography>
                  <Typography fontSize={12} color="text.secondary" sx={{ mt: 0.5 }}>{s.sub}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>Sponsored Events</Typography>
        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', mb: 5 }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                {['Event', 'Date', 'Amount', 'Purpose', 'Status', ''].map((h) => (
                  <TableCell key={h} sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'text.secondary', letterSpacing: 0.4 }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {SPONSORSHIPS.map((s) => (
                <TableRow key={s.id} hover>
                  <TableCell>
                    <Typography fontWeight={700} fontSize={14}>{s.eventTitle}</Typography>
                    <Typography fontSize={12} color="text.secondary">{s.category}</Typography>
                  </TableCell>
                  <TableCell><Typography fontSize={13}>{s.eventDate}</Typography></TableCell>
                  <TableCell><Typography fontWeight={700}>₹{s.amount.toLocaleString()}</Typography></TableCell>
                  <TableCell><Typography fontSize={12} color="text.secondary">{s.notes}</Typography></TableCell>
                  <TableCell>
                    <Chip label={STATUS_MAP[s.status].label} color={STATUS_MAP[s.status].color} size="small" sx={{ fontWeight: 700 }} />
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1}>
                      <Button size="small" variant="outlined">View Event</Button>
                      {s.status === 'pledged' && (
                        <Button size="small" variant="contained" color="error" onClick={() => setRefundOpen(true)}>
                          Request Refund
                        </Button>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>My Refund Requests</Typography>
        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                {['Event', 'Refund Amount', 'Reason', 'Requested On', 'Status'].map((h) => (
                  <TableCell key={h} sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'text.secondary', letterSpacing: 0.4 }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {REFUNDS.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell><Typography fontWeight={700} fontSize={14}>{r.eventTitle}</Typography></TableCell>
                  <TableCell><Typography fontWeight={700} color="error.main">₹{r.amount.toLocaleString()}</Typography></TableCell>
                  <TableCell sx={{ maxWidth: 280 }}><Typography fontSize={12} color="text.secondary">{r.reason}</Typography></TableCell>
                  <TableCell><Typography fontSize={13}>{r.requestedDate}</Typography></TableCell>
                  <TableCell>
                    <Chip label={STATUS_MAP[r.status].label} color={STATUS_MAP[r.status].color} size="small" sx={{ fontWeight: 700 }} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      </Container>

      <Dialog open={refundOpen} onClose={() => setRefundOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle fontWeight={700}>Request Sponsorship Refund</DialogTitle>
        <DialogContent dividers>
          <Typography fontSize={14} color="text.secondary" sx={{ mb: 2.5 }}>
            Annual Sports Day 2026 · ₹10,000 pledged
          </Typography>
          <Stack spacing={2.5}>
            <TextField
              label="Refund Amount (₹)"
              type="number"
              fullWidth
              size="small"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
            />
            <TextField
              label="Reason for Refund"
              multiline
              rows={3}
              fullWidth
              size="small"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="Explain why you are requesting a refund…"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setRefundOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleSubmit} disabled={!refundAmount || !refundReason}>
            Submit Request
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
