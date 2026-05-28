import React, { useState } from 'react';
import {
  Box, Button, Card, CardContent, Chip, Container, Divider,
  Grid, MenuItem, Paper, Stack, Tab, Tabs, Table, TableBody,
  TableCell, TableFooter, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ReceiptIcon from '@mui/icons-material/Receipt';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import SavingsIcon from '@mui/icons-material/Savings';

const EXPENSES = [
  { id: 'f4', description: 'Cricket set and badminton nets', amount: 6000, category: 'equipment' },
  { id: 'f5', description: 'Medals and trophies for all categories', amount: 4500, category: 'other' },
  { id: 'f6', description: 'Refreshments for participants', amount: 3800, category: 'catering' },
];

const SPONSORSHIPS = [
  { id: 'd2', org: 'Community Welfare Foundation', type: 'NGO', amount: 15000, status: 'received' as const, pendingRefunds: 0 },
  { id: 'd3', org: 'TechCorp Solutions', type: 'Private', amount: 10000, status: 'pledged' as const, pendingRefunds: 1 },
];

const EXPENSE_CATEGORIES = ['venue', 'catering', 'equipment', 'marketing', 'staff', 'other'];

export function EventFinance() {
  const [tab, setTab] = useState(1);
  const [expDesc, setExpDesc] = useState('');
  const [expAmt, setExpAmt] = useState('');
  const [expCat, setExpCat] = useState('other');
  const [expenses, setExpenses] = useState(EXPENSES);

  const ticketRevenue = 450;
  const sponsorshipIncome = SPONSORSHIPS.filter((s) => s.status === 'received').reduce((a, s) => a + s.amount, 0);
  const totalExpenses = expenses.reduce((a, e) => a + e.amount, 0);
  const netBalance = ticketRevenue + sponsorshipIncome - totalExpenses;

  const statCards = [
    { label: 'Ticket Revenue',     value: `₹${ticketRevenue}`,                      sub: '3 registrations', icon: <ReceiptIcon />,        color: '#10b981' },
    { label: 'Sponsorship Income', value: `₹${sponsorshipIncome.toLocaleString()}`,  sub: '1 received · 1 pledged', icon: <AccountBalanceIcon />, color: '#6366f1' },
    { label: 'Total Expenses',     value: `₹${totalExpenses.toLocaleString()}`,      sub: `${expenses.length} items logged`, icon: <TrendingDownIcon />, color: '#f59e0b' },
    { label: 'Net Balance',        value: `₹${netBalance.toLocaleString()}`,          sub: 'income − expenses', icon: <SavingsIcon />,       color: netBalance >= 0 ? '#10b981' : '#ef4444' },
  ];

  const addExpense = () => {
    if (!expDesc || !expAmt) return;
    setExpenses((prev) => [...prev, { id: `new-${Date.now()}`, description: expDesc, amount: Number(expAmt), category: expCat }]);
    setExpDesc('');
    setExpAmt('');
    setExpCat('other');
  };

  return (
    <Box component="main">
      <Box sx={{ bgcolor: '#fff', borderBottom: '1px solid', borderColor: 'divider', px: 3, pt: 3, pb: 0 }}>
        <Container maxWidth="lg">
          <Typography fontSize={13} color="text.secondary" sx={{ mb: 0.75 }}>
            Manage Events ›{' '}
            <Box component="span" fontWeight={700} color="text.primary">Annual Sports Day 2026</Box>
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 1.5 }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h5" fontWeight={800}>Annual Sports Day 2026</Typography>
              <Typography fontSize={13} color="text.secondary" sx={{ mt: 0.5 }}>
                🏆 Sports · 📅 2 Feb 2026 · 📍 Society Sports Ground
              </Typography>
            </Box>
            <Chip label="Published" color="success" sx={{ fontWeight: 700 }} />
          </Box>
          <Tabs value={tab} onChange={(_, v) => setTab(v)}>
            <Tab label="Overview" />
            <Tab label="Finance" />
            <Tab label="Registrations" />
            <Tab label="Announcements" />
          </Tabs>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Grid container spacing={2.5} sx={{ mb: 5 }}>
          {statCards.map((s) => (
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
                  <Typography fontSize={26} fontWeight={800} lineHeight={1} sx={{ color: s.color }}>{s.value}</Typography>
                  <Typography fontSize={12} color="text.secondary" sx={{ mt: 0.5 }}>{s.sub}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        <Grid container spacing={4}>
          <Grid item xs={12} md={6}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>Expenses</Typography>
            </Box>
            <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', mb: 3 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    {['Description', 'Category', 'Amount', ''].map((h) => (
                      <TableCell key={h} sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'text.secondary' }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {expenses.map((e) => (
                    <TableRow key={e.id} hover>
                      <TableCell><Typography fontSize={13}>{e.description}</Typography></TableCell>
                      <TableCell>
                        <Chip label={e.category} size="small" variant="outlined" sx={{ textTransform: 'capitalize', fontSize: 11 }} />
                      </TableCell>
                      <TableCell><Typography fontWeight={700} fontSize={13}>₹{e.amount.toLocaleString()}</Typography></TableCell>
                      <TableCell padding="none">
                        <Button
                          size="small"
                          color="error"
                          sx={{ minWidth: 0, px: 1 }}
                          onClick={() => setExpenses((prev) => prev.filter((x) => x.id !== e.id))}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2} sx={{ fontWeight: 700 }}>Total</TableCell>
                    <TableCell colSpan={2}><Typography fontWeight={800}>₹{totalExpenses.toLocaleString()}</Typography></TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, bgcolor: '#f8fafc' }}>
              <Typography fontWeight={700} fontSize={14} sx={{ mb: 2 }}>Add Expense</Typography>
              <Stack spacing={2}>
                <TextField label="Description" size="small" fullWidth value={expDesc} onChange={(e) => setExpDesc(e.target.value)} />
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <TextField label="Category" size="small" select fullWidth value={expCat} onChange={(e) => setExpCat(e.target.value)}>
                      {EXPENSE_CATEGORIES.map((c) => (
                        <MenuItem key={c} value={c} sx={{ textTransform: 'capitalize' }}>{c}</MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={6}>
                    <TextField label="Amount (₹)" type="number" size="small" fullWidth value={expAmt} onChange={(e) => setExpAmt(e.target.value)} />
                  </Grid>
                </Grid>
                <Button variant="contained" size="small" startIcon={<AddIcon />} sx={{ alignSelf: 'flex-start' }} onClick={addExpense}>
                  Save Expense
                </Button>
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>Sponsorships</Typography>
              <Button size="small" variant="outlined">+ Link Sponsor</Button>
            </Box>
            <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', mb: 3 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    {['Sponsor', 'Amount', 'Status', 'Refunds'].map((h) => (
                      <TableCell key={h} sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'text.secondary' }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {SPONSORSHIPS.map((s) => (
                    <TableRow key={s.id} hover>
                      <TableCell>
                        <Typography fontWeight={600} fontSize={13}>{s.org}</Typography>
                        <Typography fontSize={11} color="text.secondary">{s.type}</Typography>
                      </TableCell>
                      <TableCell><Typography fontWeight={700} fontSize={13}>₹{s.amount.toLocaleString()}</Typography></TableCell>
                      <TableCell>
                        <Chip
                          label={s.status === 'received' ? 'Received' : 'Pledged'}
                          color={s.status === 'received' ? 'success' : 'warning'}
                          size="small"
                          sx={{ fontWeight: 700 }}
                        />
                      </TableCell>
                      <TableCell>
                        {s.pendingRefunds > 0
                          ? <Chip label={`${s.pendingRefunds} pending`} color="error" size="small" sx={{ fontWeight: 700 }} />
                          : <Typography fontSize={12} color="text.secondary">—</Typography>
                        }
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>

            <Divider sx={{ mb: 2.5 }} />

            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1 }}>Complimentary Tickets</Typography>
              <Button size="small" variant="outlined" href="/manage/complimentary/sports-day-2026">Manage →</Button>
            </Box>
            <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
              <Grid container spacing={1}>
                <Grid item xs={6}>
                  <Box sx={{ textAlign: 'center', py: 1 }}>
                    <Typography fontWeight={800} fontSize={24}>8</Typography>
                    <Typography fontSize={12} color="text.secondary">Walk-in Tickets</Typography>
                  </Box>
                </Grid>
                <Grid item xs={6}>
                  <Box sx={{ textAlign: 'center', py: 1 }}>
                    <Typography fontWeight={800} fontSize={24}>8</Typography>
                    <Typography fontSize={12} color="text.secondary">Total Free Entries</Typography>
                  </Box>
                </Grid>
              </Grid>
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
