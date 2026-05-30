import React, { useMemo, useState } from 'react';
import {
  Box, Button, Card, CardContent, Chip, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider,
  Grid, IconButton, InputAdornment, MenuItem, Paper, Stack,
  Table, TableBody, TableCell, TableHead, TablePagination,
  TableRow, TableSortLabel, TextField, Typography,
} from '@mui/material';
import AddIcon    from '@mui/icons-material/Add';
import EditIcon   from '@mui/icons-material/Edit';
import LinkIcon   from '@mui/icons-material/Link';
import MenuIcon   from '@mui/icons-material/Menu';
import SearchIcon from '@mui/icons-material/Search';
import { AdminSidebar } from '../components/AdminSidebar';

interface Sponsor {
  id: string; org: string; type: string;
  contact: string; email: string;
  platformUser: string | null;
  events: number; totalPledged: number; active: boolean;
}

const INITIAL_SPONSORS: Sponsor[] = [
  { id: 'c1', org: 'TechCorp Solutions Pvt. Ltd.', type: 'private', contact: 'Kavya Reddy',  email: 'kavya.reddy@techcorp.com', platformUser: 'Kavya Reddy', events: 2, totalPledged: 35000, active: true },
  { id: 'c2', org: 'Community Welfare Foundation', type: 'ngo',     contact: 'Anand Kumar', email: 'anand.kumar@cwf.org',        platformUser: null,          events: 1, totalPledged: 15000, active: true },
];

const ORG_TYPES = ['private', 'public', 'ngo', 'individual'];
const EVENTS    = ['Diwali Mela 2025', 'Annual Sports Day 2026', "Children's Day Carnival", 'Sunday Morning Yoga'];

type SortDir = 'asc' | 'desc';
type SortKey = 'org' | 'type' | 'events' | 'totalPledged';

export function SponsorManagement() {
  const [sponsors, setSponsors] = useState<Sponsor[]>(INITIAL_SPONSORS);
  const [addOpen,  setAddOpen]  = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [search,     setSearch]     = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sortKey,    setSortKey]    = useState<SortKey>('org');
  const [sortDir,    setSortDir]    = useState<SortDir>('asc');
  const [page,       setPage]       = useState(0);
  const [rpp,        setRpp]        = useState(10);

  const [newOrg, setNewOrg] = useState(''); const [newType, setNewType] = useState('private');
  const [newContact, setNewContact] = useState(''); const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState(''); const [newUser, setNewUser] = useState('');

  const [linkSponsor, setLinkSponsor] = useState('c1'); const [linkEvent, setLinkEvent] = useState('');
  const [linkAmount, setLinkAmount] = useState(''); const [linkStatus, setLinkStatus] = useState('pledged');
  const [linkNotes, setLinkNotes] = useState('');

  const totalPledged = sponsors.reduce((a, s) => a + s.totalPledged, 0);
  const statsCards = [
    { label: 'Total Sponsors',  value: sponsors.length },
    { label: 'Total Pledged',   value: `₹${totalPledged.toLocaleString()}` },
    { label: 'Total Received',  value: '₹40,000' },
    { label: 'Pending Refunds', value: 1 },
  ];

  const handleSaveSponsor = () => {
    if (!newOrg) return;
    setSponsors(prev => [...prev, {
      id: `new-${Date.now()}`, org: newOrg, type: newType,
      contact: newContact, email: newEmail,
      platformUser: newUser || null, events: 0, totalPledged: 0, active: true,
    }]);
    setAddOpen(false);
    setNewOrg(''); setNewType('private'); setNewContact(''); setNewEmail(''); setNewPhone(''); setNewUser('');
  };

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(0);
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = sponsors.filter(s =>
      (s.org.toLowerCase().includes(q) || s.contact.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)) &&
      (typeFilter === '' || s.type === typeFilter)
    );
    return [...list].sort((a, b) => {
      const va = String(a[sortKey] ?? ''); const vb = String(b[sortKey] ?? '');
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }, [sponsors, search, typeFilter, sortKey, sortDir]);

  const paginated = filtered.slice(page * rpp, (page + 1) * rpp);

  return (
    <Box component="main" sx={{ display: 'flex', minHeight: 'calc(100vh - 60px)' }}>
      <AdminSidebar active="Sponsors" mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />

      <Box sx={{ flex: 1, p: { xs: 2, md: 4 }, minWidth: 0 }}>

        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 1.5, flexWrap: 'wrap' }}>
          <IconButton onClick={() => setSidebarOpen(true)}
            sx={{ display: { md: 'none' }, color: '#475569' }} aria-label="Open admin menu">
            <MenuIcon />
          </IconButton>
          <Typography variant="h5" fontWeight={800} sx={{ flex: 1, fontSize: { xs: 20, md: 24 } }}>Sponsors</Typography>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            <Button variant="outlined" startIcon={<LinkIcon />} onClick={() => setLinkOpen(true)}>Link to Event</Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>Add Sponsor</Button>
          </Stack>
        </Box>

        {/* Stats */}
        <Grid container spacing={2} sx={{ mb: 4 }}>
          {statsCards.map(s => (
            <Grid item xs={6} md={3} key={s.label}>
              <Card variant="outlined" sx={{ borderRadius: 2 }}>
                <CardContent sx={{ textAlign: 'center', py: 2 }}>
                  <Typography fontSize={{ xs: 22, md: 28 }} fontWeight={800}>{s.value}</Typography>
                  <Typography fontSize={11} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, mt: 0.5 }}>
                    {s.label}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          {/* Search + filter bar */}
          <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField
              size="small" placeholder="Search org, contact, email…" value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 16, color: 'text.secondary' }} /></InputAdornment> }}
              sx={{ minWidth: 200, flex: 1, maxWidth: 360, bgcolor: '#fff' }}
            />
            <TextField size="small" select label="Type" value={typeFilter}
              onChange={e => { setTypeFilter(e.target.value); setPage(0); }}
              sx={{ minWidth: 140, bgcolor: '#fff' }}>
              <MenuItem value=""><em>All types</em></MenuItem>
              {ORG_TYPES.map(t => <MenuItem key={t} value={t} sx={{ textTransform: 'capitalize' }}>{t}</MenuItem>)}
            </TextField>
            {(search || typeFilter) && (
              <Typography fontSize={13} color="text.secondary">{filtered.length} of {sponsors.length}</Typography>
            )}
          </Box>

          {paginated.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>No sponsors match your filter.</Box>
          ) : (
            <>
              {/* ── Mobile: card list ── */}
              <Stack spacing={1.5} sx={{ display: { xs: 'flex', md: 'none' }, p: 2 }}>
                {paginated.map(s => (
                  <Paper key={s.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1, gap: 1 }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography fontWeight={700} fontSize={15}>{s.org}</Typography>
                        <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                          <Chip label={s.type} size="small" variant="outlined" sx={{ textTransform: 'capitalize', fontSize: 11, fontWeight: 600 }} />
                          <Chip label={s.active ? 'Active' : 'Inactive'} color={s.active ? 'success' : 'default'} size="small" sx={{ fontWeight: 700 }} />
                        </Box>
                      </Box>
                      <Typography fontWeight={800} fontSize={15} color="primary.main" sx={{ flexShrink: 0 }}>
                        ₹{s.totalPledged.toLocaleString()}
                      </Typography>
                    </Box>
                    <Divider sx={{ my: 1 }} />
                    <Box sx={{ display: 'flex', gap: 2, mb: 1, flexWrap: 'wrap' }}>
                      <Box>
                        <Typography fontSize={11} color="text.secondary">Contact</Typography>
                        <Typography fontSize={13} fontWeight={600}>{s.contact}</Typography>
                        <Typography fontSize={11} color="text.secondary">{s.email}</Typography>
                      </Box>
                      <Box>
                        <Typography fontSize={11} color="text.secondary">Platform user</Typography>
                        <Typography fontSize={13} fontWeight={s.platformUser ? 600 : 400} color={s.platformUser ? 'text.primary' : 'text.secondary'} sx={{ fontStyle: s.platformUser ? 'normal' : 'italic' }}>
                          {s.platformUser ?? '— external —'}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography fontSize={11} color="text.secondary">Events</Typography>
                        <Typography fontSize={15} fontWeight={700}>{s.events}</Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button fullWidth size="small" variant="outlined" startIcon={<EditIcon />}>Edit</Button>
                      <Button fullWidth size="small" variant="outlined" startIcon={<LinkIcon />} onClick={() => setLinkOpen(true)}>Link</Button>
                    </Box>
                  </Paper>
                ))}
              </Stack>

              {/* ── Desktop: table ── */}
              <Box sx={{ display: { xs: 'none', md: 'block' }, overflowX: 'auto' }}>
                <Table sx={{ minWidth: 700 }}>
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f8fafc' }}>
                      {([['org', 'Organization'], ['type', 'Type']] as [SortKey, string][]).map(([k, l]) => (
                        <TableCell key={k} sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'text.secondary', letterSpacing: 0.4 }}>
                          <TableSortLabel active={sortKey === k} direction={sortKey === k ? sortDir : 'asc'} onClick={() => toggleSort(k)}>{l}</TableSortLabel>
                        </TableCell>
                      ))}
                      {['Contact', 'Platform User'].map(h => (
                        <TableCell key={h} sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'text.secondary', letterSpacing: 0.4 }}>{h}</TableCell>
                      ))}
                      {([['events', 'Events'], ['totalPledged', 'Total Pledged']] as [SortKey, string][]).map(([k, l]) => (
                        <TableCell key={k} sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'text.secondary', letterSpacing: 0.4 }}>
                          <TableSortLabel active={sortKey === k} direction={sortKey === k ? sortDir : 'asc'} onClick={() => toggleSort(k)}>{l}</TableSortLabel>
                        </TableCell>
                      ))}
                      {['Status', 'Actions'].map(h => (
                        <TableCell key={h} sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'text.secondary', letterSpacing: 0.4 }}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginated.map(s => (
                      <TableRow key={s.id} hover>
                        <TableCell><Typography fontWeight={700} fontSize={14}>{s.org}</Typography></TableCell>
                        <TableCell><Chip label={s.type} size="small" variant="outlined" sx={{ textTransform: 'capitalize', fontSize: 11, fontWeight: 600 }} /></TableCell>
                        <TableCell>
                          <Typography fontSize={13}>{s.contact}</Typography>
                          <Typography fontSize={11} color="text.secondary">{s.email}</Typography>
                        </TableCell>
                        <TableCell>
                          {s.platformUser
                            ? <Typography fontSize={13}>{s.platformUser}</Typography>
                            : <Typography fontSize={12} color="text.secondary" sx={{ fontStyle: 'italic' }}>— external —</Typography>}
                        </TableCell>
                        <TableCell><Typography fontWeight={700}>{s.events}</Typography></TableCell>
                        <TableCell><Typography fontWeight={700}>₹{s.totalPledged.toLocaleString()}</Typography></TableCell>
                        <TableCell><Chip label={s.active ? 'Active' : 'Inactive'} color={s.active ? 'success' : 'default'} size="small" sx={{ fontWeight: 700 }} /></TableCell>
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
              </Box>
            </>
          )}

          <TablePagination
            component="div" count={filtered.length} page={page}
            onPageChange={(_, p) => setPage(p)} rowsPerPage={rpp}
            onRowsPerPageChange={e => { setRpp(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={[5, 10, 25]}
            sx={{ borderTop: '1px solid', borderColor: 'divider' }}
          />
        </Paper>
      </Box>

      {/* Add Sponsor dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle fontWeight={700}>Add New Sponsor</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <Grid container spacing={2}>
              <Grid item xs={8}><TextField label="Organization Name *" fullWidth size="small" value={newOrg} onChange={e => setNewOrg(e.target.value)} /></Grid>
              <Grid item xs={4}>
                <TextField label="Type *" fullWidth size="small" select value={newType} onChange={e => setNewType(e.target.value)}>
                  {ORG_TYPES.map(t => <MenuItem key={t} value={t} sx={{ textTransform: 'capitalize' }}>{t}</MenuItem>)}
                </TextField>
              </Grid>
            </Grid>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}><TextField label="Contact Name" fullWidth size="small" value={newContact} onChange={e => setNewContact(e.target.value)} /></Grid>
              <Grid item xs={12} sm={6}><TextField label="Contact Email" type="email" fullWidth size="small" value={newEmail} onChange={e => setNewEmail(e.target.value)} /></Grid>
            </Grid>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}><TextField label="Contact Phone" fullWidth size="small" value={newPhone} onChange={e => setNewPhone(e.target.value)} /></Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Platform User (optional)" fullWidth size="small" select value={newUser} onChange={e => setNewUser(e.target.value)}>
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

      {/* Link to Event dialog */}
      <Dialog open={linkOpen} onClose={() => setLinkOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle fontWeight={700}>Link Sponsor to Event</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <TextField label="Sponsor" fullWidth size="small" select value={linkSponsor} onChange={e => setLinkSponsor(e.target.value)}>
              {sponsors.map(s => <MenuItem key={s.id} value={s.id}>{s.org}</MenuItem>)}
            </TextField>
            <TextField label="Event" fullWidth size="small" select value={linkEvent} onChange={e => setLinkEvent(e.target.value)}>
              <MenuItem value="">— select event —</MenuItem>
              {EVENTS.map(e => <MenuItem key={e} value={e}>{e}</MenuItem>)}
            </TextField>
            <Grid container spacing={2}>
              <Grid item xs={7}><TextField label="Amount (₹) *" type="number" fullWidth size="small" value={linkAmount} onChange={e => setLinkAmount(e.target.value)} /></Grid>
              <Grid item xs={5}>
                <TextField label="Status" fullWidth size="small" select value={linkStatus} onChange={e => setLinkStatus(e.target.value)}>
                  <MenuItem value="pledged">Pledged</MenuItem>
                  <MenuItem value="received">Received</MenuItem>
                </TextField>
              </Grid>
            </Grid>
            <TextField label="Notes" multiline rows={2} fullWidth size="small" value={linkNotes} onChange={e => setLinkNotes(e.target.value)} placeholder="What is this sponsorship covering?" />
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
