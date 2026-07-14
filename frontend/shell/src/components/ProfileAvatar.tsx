import React, { useRef, useState } from 'react';
import { Avatar, Box, Button, CircularProgress, IconButton, Tooltip, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import { useAuth } from '../contexts/AuthContext';
import { useUserService } from '../contexts/UserServiceContext';
import { avatarUrl } from '../api/userService';

const _AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const _AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface Props {
  size?: number;
  /** True when placed on a dark gradient background (Profile hero); false for a plain surface (PendingApproval). */
  dark?: boolean;
}

// ── Avatar with upload/remove controls — shared by Profile and PendingApproval ─
export function ProfileAvatar({ size = 72, dark = false }: Props) {
  const { user } = useAuth();
  const { dbUser, uploadAvatar, removeAvatar } = useUserService();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    setError(null);
    if (!_AVATAR_TYPES.includes(file.type)) {
      setError('Only JPEG, PNG, or WebP images are accepted');
      return;
    }
    if (file.size > _AVATAR_MAX_BYTES) {
      setError('File too large (max 5 MB)');
      return;
    }

    setBusy(true);
    try {
      await uploadAvatar(file);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setError(null);
    setBusy(true);
    try {
      await removeAvatar();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Remove failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box>
      <Box sx={{ position: 'relative', width: size, height: size }}>
        <Avatar
          src={avatarUrl(dbUser?.avatar_url)}
          sx={{
            width: size, height: size,
            bgcolor: 'primary.main',
            fontSize: size / 2.75, fontWeight: 800,
            boxShadow: '0 4px 20px rgba(99,102,241,0.45)',
          }}
        >
          {user?.initials}
        </Avatar>

        {busy && (
          <Box sx={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            bgcolor: 'rgba(0,0,0,0.5)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <CircularProgress size={24} sx={{ color: '#fff' }} />
          </Box>
        )}

        <Tooltip title="Change photo">
          <IconButton
            size="small"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            sx={{
              position: 'absolute', bottom: -2, right: -2,
              width: 26, height: 26,
              bgcolor: '#fff', color: '#3730a3',
              border: '2px solid', borderColor: 'background.paper',
              '&:hover': { bgcolor: '#e0e7ff' },
            }}
          >
            <PhotoCameraIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={handleFileChange}
        />
      </Box>

      {dbUser?.avatar_url && (
        <Button
          size="small"
          color="inherit"
          startIcon={<DeleteIcon sx={{ fontSize: '14px !important' }} />}
          onClick={handleRemove}
          disabled={busy}
          sx={{
            mt: 0.5, fontSize: 11, textTransform: 'none', minWidth: 0, px: 0.5,
            color: dark ? 'rgba(255,255,255,0.7)' : 'text.secondary',
          }}
        >
          Remove
        </Button>
      )}

      {error && (
        <Typography sx={{ fontSize: 11, mt: 0.5, maxWidth: 140, color: dark ? '#fca5a5' : 'error.main' }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
