import React, { useState } from 'react';
import {
  Box, Button, Card, CardContent, Chip, Container,
  Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, MenuItem, Paper, Stack, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import LinkIcon from '@mui/icons-material/Link';

interface Sponsor {
  id: string;
  org: string;
  type: string;
  contact: string;
  email: string;
  platformUser: string | null;
  events: number;
  totalPledged: number;
  active: boolean;
}

const INITIAL_SPONSORS: Sponsor[] = [
  { id: 'c1', org: 'TechCorp Solutions Pvt. Ltd.', type: 'private', contact: 'Kavya Reddy',  email: 'kavya.reddy@techcorp.com', platformUser: 'Kavya Reddy', events: 2, totalPledged: 35000, active: true },
  { id: 'c2', org: 'Community Welfare Foundation', type: 'ngo',     contact: 'Anand Kumar', email: 'anand.kumar@cwf.org',        platformUser: null,          events: 1, totalPledged: 15000, active: true },
];

const ORG_TYPES = ['private', 'public', 'ngo', 'individual'];
const EVENTS    = ['Diwali Mela 2025', 'Annual Sports Day 2026', "Children's Day Carnival", 'Sunday Morning Yoga'];
const SIDEBAR   = ['Dashboard', 'Users', 'Events', 'Sponsors', 'Categories', 'Payments & Refunds', 'Reports', 'Settings'];

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

export function SponsorManagement() {
  const [sponsors, setSponsors] = useState<Sponsor[]>(INITIAL_SPONSORS);
  const [addOpen,  setAddOpen]  = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  const [newOrg,    setNewOrg]    = useState('');
  const [newType,   setNewType]   = useState('private');
  const [newContact,setNewContact]= useState('');
  const [newEmail,  setNewEmail]  = useState('');
  const [newPhone,  setNewPhone]  = useState('');
  const [newUser,   setNewUser]   = useState('');

  const [linkSponsor, setLinkSponsor] = useState('c1');
  const [linkEvent,   setLinkEvent]   = useState('');
  const [linkAmount,  setLinkAmount]  = useState('');
  const [linkStatus,  setLinkStatus]  = useState('pledged');
  const [linkNotes,   setLinkNotes]   = useState('');

  const totalPledged  = sponsors.reduce((a, s) => a + s.totalPledged, 0);
  const stats = [
    { label: 'Total Sponsors',  value: sponsors.length },
    { label: 'Total Pledged',   value: `₹${totalPledged.toLocaleString()}` },
    { label: 'Total Received',  value: '₹40,000' },
    { label: 'Pending Refunds', value: 1 },
  ];

  const handleSaveSponsor = () => {
    if (!newOrg) return;
    setSponsors((prev) => [...prev, {
      id: `new-${Date.now()}`, org: newOrg, type: newType,
      contact: newContact, email: newEmail,
      platformUser: newUser || null, events: 0, totalPledged: 0, active: true,
    }]);
    setAddOpen(false);
    setNewOrg(''); setNewType('private'); setNewContact(''); setNewEmail(''); setNewPhone(''); setNewUser('');
  };

  return (
    <Box component="main" sx={{ display: 'flex', minHeight: 'calc(100vh - 60px)' }}>
      <AdminSidebar active="Sponsors" />

      <Box sx={{ flex: 1, p: { xs: 2, md: 4 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <Typography variant="h5" fontWeight={800} sx={{ flex: 1 }}>Sponsors</Typography>
          <Stack direction="row" spacing={1.5}>
            <Button variant="outlined" startIcon={<LinkIcon />} onClick={() => setLinkOpen(true)}>Link to Event</Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>Add Sponsor</Button>
          </Stack>
        </Box>

        <Grid container spacing={2.5} sx={{ mb: 4 }}>
          {stats.map((s) => (
            <Grid item xs={6} md={3} key={s.label}>
              <Card variant="outlined" sx={{ borderRadius: 2 }}>
                <CardContent sx={{ textAlign: 'center', py: 2 }}>
                  <Typography fontSize={28} fontWeight={800}>{s.value}</Typography>
                  <Typography fontSize={11} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, mt: 0.5 }}>
                    {s.label}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                {['Organization', 'Type', 'Contact', 'Platform User', 'Events', 'Total Pledged', 'Status', 'Actions'].map((h) => (
                  <TableCell key={h} sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'text.secondary', letterSpacing: 0.4 }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {sponsors.map((s) => (
                <TableRow key={s.id} hover>
                  <TableCell><Typography fontWeight={700} fontSize={14}>{s.org}</Typography></TableCell>
                  <TableCell>
                    <Chip label={s.type} size="small" variant="outlined" sx={{ textTransform: 'capitalize', fontSize: 11, fontWeight: 600 }} />
                  </TableCell>
                  <TableCell>
                    <Typography fontSize={13}>{s.contact}</Typography>
                    <Typography fontSize={11} color="text.secondary">{s.email}</Typography>
                  </TableCell>
                  <TableCell>
                    {s.platformUser
                      ? <Typography fontSize={13}>{s.platformUser}</Typography>
                      : <Typography fontSize={12} color="text.secondary" sx={{ fontStyle: 'italic' }}>— external —</Typography>
                    }
                  </TableCell>
                  <TableCell><Typography fontWeight={700}>{s.events}</Typography></TableCell>
                  <TableCell><Typography fontWeight={700}>₹{s.totalPledged.toLocaleString()}</Typography></TableCell>
                  <TableCell>
                    <Chip label={s.active ? 'Active' : 'Inactive'} color={s.active ? 'success' : 'default'} size="small" sx={{ fontWeight: 700 }} />
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1}>
                      <Button size="small" variant="outlined" startIcon={<EditIcon />}>Edit</Button>
                      <Button size="small" variant="outlined" startIcon={<LinkIcon />} onClick={() => setLinkOpen(true)}>Link</Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      </Box>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle fontWeight={700}>Add New Sponsor</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <Grid container spacing={2}>
              <Grid item xs={8}>
                <TextField label="Organization Name *" fullWidth size="small" value={newOrg} onChange={(e) => setNewOrg(e.target.value)} />
              </Grid>
              <Grid item xs={4}>
                <TextField label="Type *" fullWidth size="small" select value={newType} onChange={(e) => setNewType(e.target.value)}>
                  {ORG_TYPES.map((t) => <MenuItem key={t} value={t} sx={{ textTransform: 'capitalize' }}>{t}</MenuItem>)}
                </TextField>
              </Grid>
            </Grid>
            <Grid container spacing={2}>
              <Grid item xs={6}><TextField label="Contact Name" fullWidth size="small" value={newContact} onChange={(e) => setNewContact(e.target.value)} /></Grid>
              <Grid item xs={6}><TextField label="Contact Email" type="email" fullWidth size="small" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /></Grid>
            </Grid>
            <Grid container spacing={2}>
              <Grid item xs={6}><TextField label="Contact Phone" fullWidth size="small" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} /></Grid>
              <Grid item xs={6}>
                <TextField label="Platform User (optional)" fullWidth size="small" select value={newUser} onChange={(e) => setNewUser(e.target.value)}>
                  <MenuItem value="">— none —</MenuItem>
                  <MenuItem value="kavya">Kavya Reddy (kavya.reddy@techcorp.com)</MenuItem>
                </TextField>
              </Grid>
            </Grid>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveSponsor} disabled={!newOrg}>Save Sponsor</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={linkOpen} onClose={() => setLinkOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle fontWeight={700}>Link Sponsor to Event</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <TextField label="Sponsor" fullWidth size="small" select value={linkSponsor} onChange={(e) => setLinkSponsor(e.target.value)}>
              {sponsors.map((s) => <MenuItem key={s.id} value={s.id}>{s.org}</MenuItem>)}
            </TextField>
            <TextField label="Event" fullWidth size="small" select value={linkEvent} onChange={(e) => setLinkEvent(e.target.value)}>
              <MenuItem value="">— select event —</MenuItem>
              {EVENTS.map((e) => <MenuItem key={e} value={e}>{e}</MenuItem>)}
            </TextField>
            <Grid container spacing={2}>
              <Grid item xs={7}>
                <TextField label="Amount (₹) *" type="number" fullWidth size="small" value={linkAmount} onChange={(e) => setLinkAmount(e.target.value)} />
              </Grid>
              <Grid item xs={5}>
                <TextField label="Status" fullWidth size="small" select value={linkStatus} onChange={(e) => setLinkStatus(e.target.value)}>
                  <MenuItem value="pledged">Pledged</MenuItem>
                  <MenuItem value="received">Received</MenuItem>
                </TextField>
              </Grid>
            </Grid>
            <TextField label="Notes" multiline rows={2} fullWidth size="small" value={linkNotes} onChange={(e) => setLinkNotes(e.target.value)} placeholder="What is this sponsorship covering?" />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setLinkOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!linkEvent || !linkAmount} onClick={() => setLinkOpen(false)}>Link Sponsor</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
