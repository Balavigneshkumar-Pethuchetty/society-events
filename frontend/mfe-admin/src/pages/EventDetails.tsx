import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Container,
  Grid, Paper, Stack, Tab, Tabs, Table, TableBody, TableCell, TableHead,
  TableRow, Typography,
} from '@mui/material';
import ArrowBackIcon      from '@mui/icons-material/ArrowBack';
import CalendarTodayIcon  from '@mui/icons-material/CalendarToday';
import LocationOnIcon     from '@mui/icons-material/LocationOn';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import HowToRegIcon       from '@mui/icons-material/HowToReg';
import CardGiftcardIcon   from '@mui/icons-material/CardGiftcard';
import ReceiptIcon        from '@mui/icons-material/Receipt';
import StorefrontIcon     from '@mui/icons-material/Storefront';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import OpenInNewIcon      from '@mui/icons-material/OpenInNew';

// ── API helpers ───────────────────────────────────────────────────────────────

function apiBase(service: string): string {
  const { hostname, port, protocol, origin } = window.location;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  if (isLocal && ['4004', '4005'].includes(port)) return `${origin}/api/${service}`;
  if (isLocal && port !== '8080' && port !== '80')
    return `${protocol}//${hostname}:8080/api/${service}`;
  return `${origin}/api/${service}`;
}

async function apiFetch<T>(service: string, path: string, token: string): Promise<T> {
  const res = await fetch(`${apiBase(service)}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface EventInfo {
  id: string; title: string; status: string; start_time: string; venue: string;
  category_name: string | null;
}

interface Registration {
  id: string; ticket_count: number; total_amount: number | string; display_currency: string;
  status: string; registered_at: string; user_name: string | null; user_email: string | null;
  payment: { status: string; payment_method: string | null } | null;
}

interface RosterTicket {
  ticket_id: string; user_name: string | null; user_email: string | null;
  user_phone: string | null; ticket_count: number; status: string;
  scanned_at: string | null; unit_label: string | null;
}

interface ComplimentaryEntry {
  id: string; inviter_type: string; invited_by_name: string | null;
  guest_name: string | null; guest_email: string | null; ticket_status: string | null;
  ticket_count: number; created_by_name: string | null; created_at: string;
  cancelled_at: string | null;
}

const STATUS_STYLE: Record<string, { label: string; color: 'default' | 'warning' | 'success' | 'error' | 'info' }> = {
  draft:      { label: 'Draft',     color: 'default' },
  published:  { label: 'Published', color: 'success' },
  cancelled:  { label: 'Cancelled', color: 'error' },
  completed:  { label: 'Completed', color: 'info' },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function fmtMoney(n: number | string, currency: string) {
  return `${currency === 'INR' ? '₹' : currency + ' '}${Number(n).toLocaleString('en-IN')}`;
}

// Money is only "collected" once a registration is confirmed (payment approved, or free)
// or attended (scanned at the gate). pending_payment hasn't been paid yet; cancelled was refunded.
const PAID_STATUSES = new Set(['confirmed', 'attended']);

// ── Purchases tab ────────────────────────────────────────────────────────────

function PurchasesTab({ registrations }: { registrations: Registration[] }) {
  const countByEmail = registrations.reduce<Record<string, number>>((acc, r) => {
    const key = r.user_email ?? r.user_name ?? '';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const paid = registrations.filter(r => PAID_STATUSES.has(r.status));
  const totalTickets = paid.reduce((s, r) => s + r.ticket_count, 0);
  const totalRevenue  = paid.reduce((s, r) => s + Number(r.total_amount), 0);

  return (
    <>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <StatCard label="Registrations" value={registrations.length} color="#6366f1" />
        <StatCard label="Tickets Purchased" value={totalTickets} color="#10b981" />
        <StatCard label="Revenue" value={fmtMoney(totalRevenue, registrations[0]?.display_currency ?? 'INR')} color="#0ea5e9" />
      </Grid>
      <Typography fontSize={12} color="text.secondary" sx={{ mb: 2 }}>
        Tickets Purchased and Revenue count only <strong>confirmed</strong> or <strong>attended</strong> registrations — money actually collected. Cancelled and still-unpaid (pending payment) registrations are excluded.
      </Typography>
      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: '#f8fafc' }}>
              {['Resident', 'Tickets', 'Amount', 'Payment', 'Status', 'Registered At'].map(h => (
                <TableCell key={h} sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'text.secondary' }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {registrations.length === 0 && (
              <TableRow><TableCell colSpan={6}>
                <Typography fontSize={13} color="text.secondary" textAlign="center" py={2}>No purchases yet.</Typography>
              </TableCell></TableRow>
            )}
            {registrations.map(r => {
              const key = r.user_email ?? r.user_name ?? '';
              const multi = countByEmail[key] > 1;
              return (
                <TableRow key={r.id} hover>
                  <TableCell>
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      <Box>
                        <Typography fontWeight={600} fontSize={13}>{r.user_name ?? '—'}</Typography>
                        <Typography fontSize={11} color="text.secondary">{r.user_email ?? '—'}</Typography>
                      </Box>
                      {multi && <Chip label={`×${countByEmail[key]} purchases`} size="small" color="warning" sx={{ fontWeight: 700, fontSize: 10 }} />}
                    </Stack>
                  </TableCell>
                  <TableCell><Typography fontWeight={700} fontSize={14}>{r.ticket_count}</Typography></TableCell>
                  <TableCell><Typography fontSize={13}>{fmtMoney(r.total_amount, r.display_currency)}</Typography></TableCell>
                  <TableCell>
                    {r.payment ? <Chip label={r.payment.status} size="small" /> : <Typography fontSize={12} color="text.secondary">Free</Typography>}
                  </TableCell>
                  <TableCell><Chip label={r.status} size="small" color={r.status === 'confirmed' || r.status === 'attended' ? 'success' : 'default'} /></TableCell>
                  <TableCell><Typography fontSize={12}>{fmtDate(r.registered_at)}</Typography></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Paper>
    </>
  );
}

// ── Attendance / roster tab ──────────────────────────────────────────────────

function AttendanceTab({ tickets }: { tickets: RosterTicket[] }) {
  const totalIssued = tickets.reduce((s, t) => s + t.ticket_count, 0);
  const used = tickets.filter(t => t.status === 'used').length;

  return (
    <>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <StatCard label="Tickets Issued" value={totalIssued} color="#6366f1" />
        <StatCard label="Checked In" value={used} color="#10b981" />
        <StatCard label="Not Yet Checked In" value={tickets.length - used} color="#f59e0b" />
      </Grid>
      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: '#f8fafc' }}>
              {['Resident', 'Unit', 'Tickets', 'Status', 'Scanned At'].map(h => (
                <TableCell key={h} sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'text.secondary' }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {tickets.length === 0 && (
              <TableRow><TableCell colSpan={5}>
                <Typography fontSize={13} color="text.secondary" textAlign="center" py={2}>No tickets issued yet.</Typography>
              </TableCell></TableRow>
            )}
            {tickets.map(t => (
              <TableRow key={t.ticket_id} hover>
                <TableCell>
                  <Typography fontWeight={600} fontSize={13}>{t.user_name ?? '—'}</Typography>
                  <Typography fontSize={11} color="text.secondary">{t.user_email ?? '—'}</Typography>
                </TableCell>
                <TableCell><Typography fontSize={12}>{t.unit_label ?? '—'}</Typography></TableCell>
                <TableCell><Typography fontWeight={700} fontSize={14}>{t.ticket_count}</Typography></TableCell>
                <TableCell><Chip label={t.status === 'used' ? 'Checked in' : 'Issued'} size="small" color={t.status === 'used' ? 'success' : 'default'} /></TableCell>
                <TableCell><Typography fontSize={12}>{t.scanned_at ? fmtDate(t.scanned_at) : '—'}</Typography></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </>
  );
}

// ── Complimentary tab (read-only summary; full CRUD lives on its own page) ───

function ComplimentaryTab({ entries, eventId }: { entries: ComplimentaryEntry[]; eventId: string }) {
  const live = entries.filter(e => !e.cancelled_at);
  const total = live.reduce((s, e) => s + e.ticket_count, 0);

  return (
    <>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography fontSize={13} color="text.secondary">{total} complimentary ticket{total === 1 ? '' : 's'} issued for this event.</Typography>
        <Button size="small" variant="outlined" endIcon={<OpenInNewIcon fontSize="small" />}
          onClick={() => { window.location.href = `/manage/complimentary/${eventId}`; }}>
          Manage Complimentary Tickets
        </Button>
      </Stack>
      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: '#f8fafc' }}>
              {['Guest / Invited By', 'Type', 'Tickets', 'Status', 'Issued By'].map(h => (
                <TableCell key={h} sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'text.secondary' }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.length === 0 && (
              <TableRow><TableCell colSpan={5}>
                <Typography fontSize={13} color="text.secondary" textAlign="center" py={2}>No complimentary tickets issued yet.</Typography>
              </TableCell></TableRow>
            )}
            {entries.map(e => (
              <TableRow key={e.id} hover sx={{ opacity: e.cancelled_at ? 0.5 : 1 }}>
                <TableCell>
                  {e.inviter_type === 'walk_in' && !e.guest_name
                    ? <Typography fontSize={13} color="text.secondary" sx={{ fontStyle: 'italic' }}>Walk-in counter</Typography>
                    : (
                      <>
                        <Typography fontWeight={600} fontSize={13}>{e.guest_name ?? '—'}</Typography>
                        <Typography fontSize={11} color="text.secondary">Invited by {e.invited_by_name ?? '—'}</Typography>
                      </>
                    )}
                </TableCell>
                <TableCell><Chip label={e.inviter_type.replace('_', ' ')} size="small" /></TableCell>
                <TableCell><Typography fontWeight={700} fontSize={14}>{e.ticket_count}</Typography></TableCell>
                <TableCell>
                  <Chip size="small"
                    label={e.cancelled_at ? 'Cancelled' : e.ticket_status === 'used' ? 'Used' : 'Issued'}
                    color={e.cancelled_at ? 'error' : e.ticket_status === 'used' ? 'default' : 'success'} />
                </TableCell>
                <TableCell><Typography fontSize={12}>{e.created_by_name ?? '—'}</Typography></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </>
  );
}

// ── Mock preview tabs (Finance / Vendors / Revenue — no backend yet) ────────

function MockPreviewTab({
  icon, title, description, columns, rows,
}: {
  icon: React.ReactNode; title: string; description: string;
  columns: string[]; rows: (string | number)[][];
}) {
  return (
    <>
      <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
        Preview only — {title} isn't wired to a backend yet. This is sample data to illustrate the layout.
      </Alert>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
        {icon}
        <Box>
          <Typography variant="h6" fontWeight={700}>{title}</Typography>
          <Typography fontSize={13} color="text.secondary">{description}</Typography>
        </Box>
      </Stack>
      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: '#f8fafc' }}>
              {columns.map(h => (
                <TableCell key={h} sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'text.secondary' }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i} hover>
                {row.map((cell, j) => (
                  <TableCell key={j}><Typography fontSize={13}>{cell}</Typography></TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </>
  );
}

// ── Small stat card ──────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <Grid item xs={6} md={4}>
      <Card variant="outlined" sx={{ borderRadius: 2 }}>
        <CardContent sx={{ textAlign: 'center', py: 2 }}>
          <Typography fontSize={24} fontWeight={800} sx={{ color }}>{value}</Typography>
          <Typography fontSize={11} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, mt: 0.5 }}>{label}</Typography>
        </CardContent>
      </Card>
    </Grid>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function EventDetails({ token, id: eventId }: { token?: string | null; id?: string }) {
  const [event, setEvent]               = useState<EventInfo | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [tickets, setTickets]           = useState<RosterTicket[]>([]);
  const [comps, setComps]               = useState<ComplimentaryEntry[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [tab, setTab]                   = useState(0);

  const load = useCallback(() => {
    if (!token || !eventId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    Promise.all([
      apiFetch<EventInfo>('events', `/events/${eventId}`, token),
      apiFetch<Registration[]>('registrations', `/registrations?event_id=${eventId}`, token),
      apiFetch<RosterTicket[]>('tickets', `/tickets/event/${eventId}`, token),
      apiFetch<ComplimentaryEntry[]>('registrations', `/complimentary/tickets?event_id=${eventId}`, token),
    ])
      .then(([ev, regs, tix, comp]) => {
        setEvent(ev);
        setRegistrations(regs);
        setTickets(tix);
        setComps(comp);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, eventId]);

  useEffect(() => { load(); }, [load]);

  if (!token) {
    return <Container maxWidth="md" sx={{ pt: 6 }}><Alert severity="warning">You must be logged in.</Alert></Container>;
  }

  if (!eventId) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="info" sx={{ mb: 2 }}>
          Navigate to this page from an event's row in Manage Events (View Details icon) to see its details.
        </Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => { window.location.href = '/manage'; }}>
          Back to Manage Events
        </Button>
      </Box>
    );
  }

  const ss = event ? (STATUS_STYLE[event.status] ?? { label: event.status, color: 'default' as const }) : null;

  return (
    <Box component="main">
      <Box sx={{ bgcolor: '#fff', borderBottom: '1px solid', borderColor: 'divider', px: 3, pt: 3 }}>
        <Container maxWidth="lg">
          <Button size="small" startIcon={<ArrowBackIcon />} sx={{ mb: 1 }}
            onClick={() => { window.location.href = '/manage'; }}>
            Manage Events
          </Button>
          {event && (
            <>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 1.5, flexWrap: 'wrap' }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="h5" fontWeight={800}>{event.title}</Typography>
                  <Stack direction="row" spacing={2} sx={{ mt: 0.5 }} flexWrap="wrap">
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <CalendarTodayIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                      <Typography fontSize={13} color="text.secondary">{fmtDate(event.start_time)}</Typography>
                    </Stack>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <LocationOnIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                      <Typography fontSize={13} color="text.secondary">{event.venue}</Typography>
                    </Stack>
                  </Stack>
                </Box>
                {ss && <Chip label={ss.label} color={ss.color} sx={{ fontWeight: 700 }} />}
              </Box>
              <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
                <Tab icon={<ConfirmationNumberIcon fontSize="small" />} iconPosition="start" label="Purchases" />
                <Tab icon={<HowToRegIcon fontSize="small" />} iconPosition="start" label="Attendance" />
                <Tab icon={<CardGiftcardIcon fontSize="small" />} iconPosition="start" label="Complimentary" />
                <Tab icon={<ReceiptIcon fontSize="small" />} iconPosition="start" label="Finance & Expenses" />
                <Tab icon={<StorefrontIcon fontSize="small" />} iconPosition="start" label="Vendors" />
                <Tab icon={<AccountBalanceIcon fontSize="small" />} iconPosition="start" label="Revenue" />
              </Tabs>
            </>
          )}
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>}
        {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>}

        {!loading && event && (
          <>
            {tab === 0 && <PurchasesTab registrations={registrations} />}
            {tab === 1 && <AttendanceTab tickets={tickets} />}
            {tab === 2 && <ComplimentaryTab entries={comps} eventId={eventId} />}
            {tab === 3 && (
              <MockPreviewTab
                icon={<ReceiptIcon sx={{ color: '#10b981', fontSize: 28 }} />}
                title="Finance & Expenses"
                description="Track expenses and sponsorship income for this event."
                columns={['Description', 'Category', 'Amount']}
                rows={[
                  ['Cricket set and badminton nets', 'equipment', '₹6,000'],
                  ['Medals and trophies for all categories', 'other', '₹4,500'],
                  ['Refreshments for participants', 'catering', '₹3,800'],
                ]}
              />
            )}
            {tab === 4 && (
              <MockPreviewTab
                icon={<StorefrontIcon sx={{ color: '#f59e0b', fontSize: 28 }} />}
                title="Vendor Management"
                description="Vendors and stalls invited to sell at this event."
                columns={['Vendor', 'Category', 'Stall', 'Status']}
                rows={[
                  ['Sunrise Snacks', 'food', 'A1', 'confirmed'],
                  ['Chai Point Kiosk', 'beverages', 'A2', 'invited'],
                ]}
              />
            )}
            {tab === 5 && (
              <MockPreviewTab
                icon={<AccountBalanceIcon sx={{ color: '#ec4899', fontSize: 28 }} />}
                title="Revenue Distribution"
                description="How this event's net revenue pool is split among sponsors, organizers, and the society."
                columns={['Recipient', 'Type', 'Share', 'Amount']}
                rows={[
                  ['Community Welfare Foundation', 'sponsor', '25%', '₹1,725'],
                  ['GM Global Techies Town', 'society', '75%', '₹5,175'],
                ]}
              />
            )}
          </>
        )}
      </Container>
    </Box>
  );
}
