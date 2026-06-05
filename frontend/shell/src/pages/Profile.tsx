import React, { useEffect, useState } from 'react';
import {
  Alert, Avatar, Box, Button, Card, CardContent,
  Chip, CircularProgress, Container, Divider,
  FormControl, Grid, InputLabel, MenuItem,
  Select, Skeleton, TextField, Typography,
} from '@mui/material';
import ApartmentIcon from '@mui/icons-material/Apartment';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EditIcon from '@mui/icons-material/Edit';
import { useAuth } from '../contexts/AuthContext';
import { useUserService } from '../contexts/UserServiceContext';
import { ROLE_COLORS, ROLE_LABELS } from '../theme';
import { PhoneInputField } from '../components/PhoneInputField';

function aptLabel(apt: { block: string; unit_number: string; type: string }) {
  return `Block ${apt.block} — Flat ${apt.unit_number} (${apt.type})`;
}

// ── Personal Info card ────────────────────────────────────────────────────────
function PersonalInfoCard() {
  const { dbUser, updateProfile } = useUserService();
  const [name,    setName]    = useState('');
  const [phone,   setPhone]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (dbUser) {
      setName(dbUser.name);
      setPhone(dbUser.phone ?? '');
    }
  }, [dbUser]);

  const isDirty =
    dbUser != null &&
    (name.trim() !== dbUser.name || (phone.trim() || null) !== dbUser.phone);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await updateProfile({
        name:  name.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
          <EditIcon color="primary" fontSize="small" />
          <Typography fontWeight={700} fontSize={16}>Personal information</Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {saved && (
          <Alert severity="success" icon={<CheckCircleIcon />} sx={{ mb: 2 }}>
            Profile updated successfully.
          </Alert>
        )}

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              size="small"
            />
          </Grid>
          <Grid item xs={12}>
            <PhoneInputField
              value={phone}
              onChange={setPhone}
              size="small"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Email address"
              value={dbUser?.email ?? ''}
              fullWidth
              size="small"
              disabled
              helperText="Managed by Keycloak — change via account settings"
            />
          </Grid>
        </Grid>

        <Box sx={{ mt: 2.5, display: 'flex', gap: 1.5 }}>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!isDirty || saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
            sx={{ fontWeight: 700, px: 3 }}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}

// ── Apartment card ────────────────────────────────────────────────────────────
function ApartmentCard() {
  const { dbUser, apartments, assignApartment } = useUserService();
  const [selected, setSelected] = useState('');
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    if (dbUser) setSelected(dbUser.apartment_id ?? '');
  }, [dbUser]);

  const isDirty = selected !== (dbUser?.apartment_id ?? '');

  const handleAssign = async () => {
    if (!selected) return;
    setError(null);
    setSaving(true);
    try {
      await assignApartment(selected);
      setSaved(true);
      setTimeout(() => setSaved(false), 3500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to assign apartment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
          <ApartmentIcon color="primary" fontSize="small" />
          <Typography fontWeight={700} fontSize={16}>Apartment</Typography>
        </Box>

        {dbUser?.apartment && (
          <Box
            sx={{
              mb: 2, p: 1.5, borderRadius: 1.5,
              bgcolor: 'primary.main', color: '#fff',
              display: 'flex', alignItems: 'center', gap: 1,
            }}
          >
            <ApartmentIcon fontSize="small" />
            <Typography fontWeight={600} fontSize={14}>
              Currently: {aptLabel(dbUser.apartment)}
            </Typography>
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {saved && (
          <Alert severity="success" icon={<CheckCircleIcon />} sx={{ mb: 2 }}>
            Apartment assigned successfully.
          </Alert>
        )}

        <FormControl fullWidth size="small">
          <InputLabel>Select your apartment</InputLabel>
          <Select
            value={selected}
            label="Select your apartment"
            onChange={(e) => setSelected(e.target.value)}
          >
            <MenuItem value=""><em>None</em></MenuItem>
            {apartments.map((a) => (
              <MenuItem key={a.id} value={a.id}>
                Block {a.block} — Flat {a.unit_number} ({a.type})
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Box sx={{ mt: 2 }}>
          <Button
            variant="contained"
            onClick={handleAssign}
            disabled={!isDirty || !selected || saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
            sx={{ fontWeight: 700, px: 3 }}
          >
            {saving ? 'Saving…' : 'Assign apartment'}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export function Profile() {
  const { user }                    = useAuth();
  const { dbUser, isSyncing, syncError } = useUserService();

  const role = user?.primaryRole ?? 'resident';

  return (
    <Box component="main">

      {/* Hero */}
      <Box
        sx={{
          background: 'linear-gradient(135deg, #1e293b 0%, #312e81 100%)',
          color: '#fff',
          py: { xs: 5, md: 7 },
          px: 3,
        }}
      >
        <Container maxWidth="lg">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
            <Avatar
              sx={{
                width: 72, height: 72,
                bgcolor: 'primary.main',
                fontSize: 26, fontWeight: 800,
                boxShadow: '0 4px 20px rgba(99,102,241,0.45)',
              }}
            >
              {user?.initials}
            </Avatar>

            <Box>
              <Typography variant="h5" fontWeight={800} sx={{ mb: 0.5 }}>
                {isSyncing ? <Skeleton width={180} sx={{ bgcolor: 'rgba(255,255,255,0.12)' }} /> : (dbUser?.name ?? user?.name)}
              </Typography>
              <Typography sx={{ color: '#a5b4fc', fontSize: 14, mb: 1 }}>
                {user?.email}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                <Chip
                  label={ROLE_LABELS[role] ?? role}
                  size="small"
                  sx={{
                    bgcolor: ROLE_COLORS[role] ?? '#64748b',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 11,
                    height: 22,
                  }}
                />
                {dbUser?.apartment && (
                  <Chip
                    icon={<ApartmentIcon sx={{ fontSize: '14px !important', color: '#c7d2fe !important' }} />}
                    label={aptLabel(dbUser.apartment)}
                    size="small"
                    sx={{
                      bgcolor: 'rgba(255,255,255,0.12)',
                      color: '#e0e7ff',
                      fontWeight: 600,
                      fontSize: 11,
                      height: 22,
                      border: '1px solid rgba(255,255,255,0.18)',
                    }}
                  />
                )}
              </Box>
            </Box>
          </Box>
        </Container>
      </Box>

      {/* Content */}
      <Box sx={{ py: 5, px: 3 }}>
        <Container maxWidth="md">

          {syncError && (
            <Alert severity="warning" sx={{ mb: 3 }}>
              Could not reach User Service: {syncError}. Changes may not be saved.
            </Alert>
          )}

          <Grid container spacing={3}>
            <Grid item xs={12}>
              {isSyncing ? (
                <Card variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardContent sx={{ p: 3 }}>
                    <Skeleton width={200} height={28} sx={{ mb: 2 }} />
                    <Grid container spacing={2}>
                      {[1, 2, 3].map((n) => (
                        <Grid item xs={12} sm={6} key={n}>
                          <Skeleton height={40} />
                        </Grid>
                      ))}
                    </Grid>
                  </CardContent>
                </Card>
              ) : (
                <PersonalInfoCard />
              )}
            </Grid>

            <Grid item xs={12}>
              <Divider />
            </Grid>

            <Grid item xs={12}>
              {isSyncing ? (
                <Card variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardContent sx={{ p: 3 }}>
                    <Skeleton width={160} height={28} sx={{ mb: 2 }} />
                    <Skeleton height={40} />
                  </CardContent>
                </Card>
              ) : (
                <ApartmentCard />
              )}
            </Grid>
          </Grid>
        </Container>
      </Box>
    </Box>
  );
}
