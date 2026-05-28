import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Chip,
  Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, MenuItem, Paper, Stack, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import BlockIcon from '@mui/icons-material/Block';
import QrCodeIcon from '@mui/icons-material/QrCode';

interface TicketTypeMini {
  id: string;
  name: string;
  price: number;
}

interface FreeToken {
  id: string;
  tokenCode: string;
  ticketTypeName: string;
  issuedToName: string | null;
  issuedToEmail: string | null;
  issuedBy: string;
  isUsed: boolean;
  notes: string;
}

const TICKET_TYPES: TicketTypeMini[] = [
  { id: 'l1', name: 'General Entry (Free)',   price: 0   },
  { id: 'l2', name: 'Dinner Pass',            price: 150 },
  { id: 'l3', name: 'Games Bundle',           price: 50  },
];

const INITIAL_TOKENS: FreeToken[] = [
  { id: 'n1', tokenCode: 'DIWALI-DIN-001',        ticketTypeName: 'Dinner Pass',          issuedToName: 'Dr. Suresh Pillai',          issuedToEmail: 'suresh.pillai@gmail.com', issuedBy: 'Meera Krishnan', isUsed: false, notes: 'VIP guest — chief guest for cultural performance' },
  { id: 'n2', tokenCode: 'DIWALI-GAME-TECHCORP',  ticketTypeName: 'Games Bundle',         issuedToName: null,                         issuedToEmail: null,                      issuedBy: 'Meera Krishnan', isUsed: false, notes: 'TechCorp sponsor team — 4 games passes (anonymous)' },
  { id: 'n3', tokenCode: 'SPORTS-SPEC-PRESS-001', ticketTypeName: 'Spectator',            issuedToName: 'Kavitha Nambiar (The Hindu)', issuedToEmail: null,                      issuedBy: 'Rajesh Iyer',    isUsed: true,  notes: 'Press spectator — used at gate' },
];

function generateCode(prefix: string): string {
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix.toUpperCase().replace(/\s+/g, '-')}-${suffix}`;
}

export function FreeTokens() {
  const { id: eventId } = useParams();
  const [tokens, setTokens]   = useState<FreeToken[]>(INITIAL_TOKENS);
  const [issueOpen, setIssueOpen] = useState(false);
  const [revokeId, setRevokeId]   = useState<string | null>(null);

  const [formType,  setFormType]  = useState(TICKET_TYPES[0].id);
  const [formCode,  setFormCode]  = useState('');
  const [formName,  setFormName]  = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const openIssue = () => {
    const type = TICKET_TYPES[0];
    setFormType(type.id);
    setFormCode(generateCode(type.name));
    setFormName(''); setFormEmail(''); setFormNotes('');
    setIssueOpen(true);
  };

  const handleTypeChange = (typeId: string) => {
    const t = TICKET_TYPES.find(x => x.id === typeId)!;
    setFormType(typeId);
    setFormCode(generateCode(t.name));
  };

  const handleIssue = () => {
    if (!formCode) return;
    const typeName = TICKET_TYPES.find(t => t.id === formType)?.name ?? '';
    setTokens(prev => [...prev, {
      id: `new-${Date.now()}`, tokenCode: formCode, ticketTypeName: typeName,
      issuedToName:  formName  || null,
      issuedToEmail: formEmail || null,
      issuedBy: 'Meera Krishnan',
      isUsed: false, notes: formNotes,
    }]);
    setIssueOpen(false);
  };

  const handleRevoke = () => {
    if (!revokeId) return;
    setTokens(prev => prev.filter(t => t.id !== revokeId));
    setRevokeId(null);
  };

  const used     = tokens.filter(t => t.isUsed).length;
  const unused   = tokens.filter(t => !t.isUsed).length;
  const typesUsed = new Set(tokens.map(t => t.ticketTypeName)).size;

  return (
    <Box component="main" sx={{ p: { xs: 2, md: 4 } }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        <Link to="/manage" style={{ color: 'inherit' }}>Manage</Link> → Diwali Mela 2025 → Free Tokens
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
        <QrCodeIcon sx={{ color: '#6366f1', fontSize: 28 }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={800}>Free Token Issuance</Typography>
          <Typography variant="body2" color="text.secondary">Issue complimentary codes. Recipient name and email are optional — tokens can be anonymous walk-in codes.</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openIssue}>Issue Token</Button>
      </Box>

      <Grid container spacing={2.5} sx={{ mb: 4 }}>
        {[
          { label: 'Tokens Issued',      value: tokens.length, color: '#6366f1' },
          { label: 'Used',               value: used,          color: '#10b981' },
          { label: 'Unused',             value: unused,        color: '#f59e0b' },
          { label: 'Ticket Types Used',  value: typesUsed,     color: '#0f172a' },
        ].map(s => (
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
              {['Token Code', 'Ticket Type', 'Issued To', 'Email', 'Issued By', 'Used?', 'Notes', 'Actions'].map(h => (
                <TableCell key={h} sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'text.secondary', letterSpacing: 0.4 }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {tokens.map((t) => (
              <TableRow key={t.id} hover>
                <TableCell>
                  <Box component="code" sx={{ bgcolor: '#f1f5f9', px: 1, py: 0.5, borderRadius: 1, fontSize: 12, fontFamily: "'Fira Code', monospace" }}>
                    {t.tokenCode}
                  </Box>
                </TableCell>
                <TableCell>
                  <Chip label={t.ticketTypeName} size="small" color="primary" variant="outlined" sx={{ fontSize: 11, fontWeight: 600 }} />
                </TableCell>
                <TableCell>
                  {t.issuedToName
                    ? <Typography fontWeight={600} fontSize={13}>{t.issuedToName}</Typography>
                    : <Typography fontSize={12} color="text.secondary" sx={{ fontStyle: 'italic' }}>— anonymous —</Typography>
                  }
                </TableCell>
                <TableCell>
                  <Typography fontSize={12} color="text.secondary">{t.issuedToEmail ?? '—'}</Typography>
                </TableCell>
                <TableCell><Typography fontSize={13}>{t.issuedBy}</Typography></TableCell>
                <TableCell>
                  <Chip label={t.isUsed ? 'Used' : 'Unused'} size="small" color={t.isUsed ? 'success' : 'default'} sx={{ fontWeight: 700 }} />
                </TableCell>
                <TableCell sx={{ maxWidth: 180 }}>
                  <Typography fontSize={12} color="text.secondary">{t.notes || '—'}</Typography>
                </TableCell>
                <TableCell>
                  {!t.isUsed && (
                    <Button size="small" variant="outlined" color="error" startIcon={<BlockIcon />} onClick={() => setRevokeId(t.id)}>
                      Revoke
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      {/* Issue dialog */}
      <Dialog open={issueOpen} onClose={() => setIssueOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle fontWeight={700}>Issue a Free Token</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ pt: 1 }}>
            <Grid item xs={6}>
              <TextField label="Ticket Type *" fullWidth size="small" select value={formType}
                onChange={e => handleTypeChange(e.target.value)}>
                {TICKET_TYPES.map(t => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={6}>
              <TextField label="Token Code" fullWidth size="small" value={formCode}
                onChange={e => setFormCode(e.target.value)} />
            </Grid>
            <Grid item xs={6}>
              <TextField label="Issued To (optional)" fullWidth size="small" value={formName}
                onChange={e => setFormName(e.target.value)} placeholder="Recipient name…" />
            </Grid>
            <Grid item xs={6}>
              <TextField label="Email (optional)" type="email" fullWidth size="small" value={formEmail}
                onChange={e => setFormEmail(e.target.value)} placeholder="recipient@example.com" />
            </Grid>
            <Grid item xs={12}>
              <TextField label="Notes" multiline rows={2} fullWidth size="small" value={formNotes}
                onChange={e => setFormNotes(e.target.value)} placeholder="Reason for issuing (e.g. sponsor guest, press, VIP)…" />
            </Grid>
          </Grid>
          <Alert severity="info" sx={{ mt: 2, borderRadius: 1.5 }}>
            Leaving name and email blank issues an <strong>anonymous walk-in token</strong> — anyone presenting this code at the gate will be admitted.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setIssueOpen(false)}>Cancel</Button>
          <Button variant="contained" startIcon={<AddIcon />} disabled={!formCode} onClick={handleIssue}>Issue Token</Button>
        </DialogActions>
      </Dialog>

      {/* Revoke confirm */}
      <Dialog open={!!revokeId} onClose={() => setRevokeId(null)} maxWidth="xs" fullWidth>
        <DialogTitle fontWeight={700}>Revoke Token</DialogTitle>
        <DialogContent dividers>
          <Alert severity="warning" sx={{ borderRadius: 1.5 }}>
            Revoking this token will remove it permanently. The recipient will no longer be able to use this code.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setRevokeId(null)}>Cancel</Button>
          <Button variant="contained" color="error" startIcon={<BlockIcon />} onClick={handleRevoke}>Revoke Token</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
