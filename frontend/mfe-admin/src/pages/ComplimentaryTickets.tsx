import React, { useState } from 'react';
import {
  Alert, Box, Button, Card, Container, FormControl,
  Grid, InputLabel, MenuItem, Paper, Select, Stack,
  Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Typography, Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

type InviterType = 'organizer' | 'committee_member' | 'sponsor' | 'walk_in';

interface Entry {
  id: string;
  inviterName: string;
  inviterType: InviterType;
  ticketCount: number;
  notes: string;
}

const INITIAL_ENTRIES: Entry[] = [
  { id: 'g2', inviterName: 'Rajesh Iyer',              inviterType: 'organizer',        ticketCount: 3,  notes: "Organizer's family and neighbours" },
  { id: 'g1', inviterName: 'Meera Krishnan',           inviterType: 'committee_member', ticketCount: 2,  notes: "Committee member's family guests" },
  { id: 'g3', inviterName: 'Kavya Reddy (TechCorp)',   inviterType: 'sponsor',          ticketCount: 4,  notes: 'Sponsor team members' },
  { id: 'g4', inviterName: '—',                        inviterType: 'walk_in',          ticketCount: 15, notes: 'Walk-in attendees at gate' },
];

const INVITER_USERS = [
  { id: 'u1', name: 'Rajesh Iyer',              role: 'admin' },
  { id: 'u2', name: 'Meera Krishnan',           role: 'committee_member' },
  { id: 'u7', name: 'Kavya Reddy (TechCorp)',   role: 'sponsor' },
];

const TYPE_CONFIG: Record<InviterType, { label: string; color: 'primary' | 'info' | 'success' | 'warning' }> = {
  organizer:        { label: 'Organizer',    color: 'primary' },
  committee_member: { label: 'Committee',    color: 'info' },
  sponsor:          { label: 'Sponsor',      color: 'success' },
  walk_in:          { label: 'Walk-in',      color: 'warning' },
};

const ELIGIBLE_ROLES: Record<string, string[]> = {
  organizer:        ['admin', 'committee_member'],
  committee_member: ['committee_member'],
  sponsor:          ['sponsor'],
  walk_in:          [],
};

export function ComplimentaryTickets() {
  const [entries, setEntries] = useState<Entry[]>(INITIAL_ENTRIES);
  const [inviterType, setInviterType] = useState<InviterType>('walk_in');
  const [inviterUserId, setInviterUserId] = useState('');
  const [ticketCount, setTicketCount] = useState('1');
  const [notes, setNotes] = useState('');

  const grandTotal = entries.reduce((s, e) => s + e.ticketCount, 0);
  const byType = entries.reduce((acc, e) => ({ ...acc, [e.inviterType]: (acc[e.inviterType] ?? 0) + e.ticketCount }), {} as Record<string, number>);

  const eligibleUsers = INVITER_USERS.filter((u) => ELIGIBLE_ROLES[inviterType]?.includes(u.role));

  const handleAdd = () => {
    const count = Number(ticketCount);
    if (!count || count < 1) return;
    const user = inviterType !== 'walk_in' ? INVITER_USERS.find((u) => u.id === inviterUserId) : null;
    setEntries((prev) => [...prev, {
      id: `new-${Date.now()}`,
      inviterName: user?.name ?? '—',
      inviterType,
      ticketCount: count,
      notes,
    }]);
    setTicketCount('1');
    setNotes('');
    setInviterUserId('');
  };

  return (
    <Box component="main">
      <Box sx={{ bgcolor: '#fff', borderBottom: '1px solid', borderColor: 'divider', px: 3, py: 3 }}>
        <Container maxWidth="lg">
          <Typography fontSize={13} color="text.secondary" sx={{ mb: 0.5 }}>
            Manage Events ›{' '}
            <Box component="span" fontWeight={700} color="text.primary">Diwali Mela 2025</Box>
            {' '}› Complimentary Tickets
          </Typography>
          <Typography variant="h5" fontWeight={800} sx={{ mt: 0.5 }}>Complimentary Tickets</Typography>
          <Typography fontSize={14} color="text.secondary" sx={{ mt: 0.5 }}>
            Free-entry allocations for organizer guests, committee acquaintances, sponsor guests, and walk-ins.
          </Typography>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Grid container spacing={2} sx={{ mb: 4 }}>
          <Grid item>
            <Card variant="outlined" sx={{ borderRadius: 2, textAlign: 'center', px: 3, py: 2, minWidth: 120 }}>
              <Typography fontSize={28} fontWeight={800} color="primary">{grandTotal}</Typography>
              <Typography fontSize={12} color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Free</Typography>
            </Card>
          </Grid>
          {(Object.entries(byType) as [InviterType, number][]).map(([type, count]) => (
            <Grid item key={type}>
              <Card variant="outlined" sx={{ borderRadius: 2, textAlign: 'center', px: 3, py: 2, minWidth: 110 }}>
                <Typography fontSize={28} fontWeight={800}>{count}</Typography>
                <Typography fontSize={12} color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {TYPE_CONFIG[type]?.label ?? type}
                </Typography>
              </Card>
            </Grid>
          ))}
        </Grid>

        <Grid container spacing={4}>
          <Grid item xs={12} md={7}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>Current Allocations</Typography>
            <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    {['Invited By', 'Type', 'Tickets', 'Notes', ''].map((h) => (
                      <TableCell key={h} sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'text.secondary', letterSpacing: 0.4 }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {entries.map((e) => (
                    <TableRow key={e.id} hover>
                      <TableCell>
                        {e.inviterType === 'walk_in'
                          ? <Typography fontSize={13} color="text.secondary" sx={{ fontStyle: 'italic' }}>Walk-in counter</Typography>
                          : <Typography fontWeight={600} fontSize={13}>{e.inviterName}</Typography>
                        }
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={TYPE_CONFIG[e.inviterType].label}
                          color={TYPE_CONFIG[e.inviterType].color}
                          size="small"
                          sx={{ fontWeight: 700 }}
                        />
                      </TableCell>
                      <TableCell><Typography fontWeight={700} fontSize={14}>{e.ticketCount}</Typography></TableCell>
                      <TableCell><Typography fontSize={12} color="text.secondary">{e.notes}</Typography></TableCell>
                      <TableCell padding="none">
                        <Button
                          size="small"
                          color="error"
                          sx={{ minWidth: 0, px: 1 }}
                          onClick={() => setEntries((prev) => prev.filter((x) => x.id !== e.id))}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          </Grid>

          <Grid item xs={12} md={5}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>Add New Entry</Typography>
            <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: '#f8fafc' }}>
              <Stack spacing={2.5}>
                <FormControl fullWidth size="small">
                  <InputLabel>Entry Type</InputLabel>
                  <Select label="Entry Type" value={inviterType} onChange={(e) => { setInviterType(e.target.value as InviterType); setInviterUserId(''); }}>
                    <MenuItem value="organizer">Organizer's Guest</MenuItem>
                    <MenuItem value="committee_member">Committee Member's Acquaintance</MenuItem>
                    <MenuItem value="sponsor">Sponsor's Acquaintance</MenuItem>
                    <MenuItem value="walk_in">Walk-in (no name needed)</MenuItem>
                  </Select>
                </FormControl>

                {inviterType !== 'walk_in' && (
                  <FormControl fullWidth size="small">
                    <InputLabel>Invited By</InputLabel>
                    <Select label="Invited By" value={inviterUserId} onChange={(e) => setInviterUserId(e.target.value)}>
                      {eligibleUsers.map((u) => (
                        <MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}

                <TextField
                  label="Number of Tickets"
                  type="number"
                  size="small"
                  fullWidth
                  value={ticketCount}
                  onChange={(e) => setTicketCount(e.target.value)}
                  inputProps={{ min: 1 }}
                />

                <TextField
                  label="Notes (optional)"
                  multiline
                  rows={2}
                  size="small"
                  fullWidth
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Gate batch 2"
                />

                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={handleAdd}
                  disabled={inviterType !== 'walk_in' && !inviterUserId}
                >
                  Add Entry
                </Button>
              </Stack>
            </Paper>

            {inviterType === 'walk_in' && (
              <Alert icon={<InfoOutlinedIcon />} severity="info" sx={{ mt: 2, borderRadius: 2 }}>
                Walk-in guests do not need to provide their name or any personal details — only the ticket count is recorded. Typically updated by security at the gate.
              </Alert>
            )}
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
