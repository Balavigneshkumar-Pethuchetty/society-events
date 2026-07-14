/**
 * OtpChannelSelector
 *
 * Lets the user pick Telegram vs SMS for OTP delivery. Telegram only shows
 * as selectable once auth-service reports the phone number is linked to the
 * bot (GET /users/telegram/link-status, proxying auth-service's own
 * /api/telegram/link) — until then it shows a "connect the bot" deep link
 * instead. If the instance has no Telegram bot configured at all
 * (deep_link comes back null), this renders nothing, so the page looks
 * exactly like it did before this feature existed.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Link as MuiLink, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import TelegramIcon from '@mui/icons-material/Telegram';
import SmsIcon from '@mui/icons-material/Sms';
import type { SxProps, Theme } from '@mui/material/styles';
import { userService, OtpChannel } from '../api/userService';

interface Props {
  phone: string; // E.164, e.g. "+919876543210"
  value: OtpChannel;
  onChange: (channel: OtpChannel) => void;
  size?: 'small' | 'medium';
  /** Cascades to the ToggleButtonGroup, e.g. for a dark-card auth page (see PhoneLogin's darkFieldSx). */
  sx?: SxProps<Theme>;
  /** Caption text color override for pages not on the default MUI light theme. */
  captionColor?: string;
}

type Status = 'idle' | 'checking' | 'ready' | 'unavailable';

export function OtpChannelSelector({ phone, value, onChange, size = 'small', sx, captionColor }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [linked, setLinked] = useState(false);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const autoSelectedRef = useRef(false);

  const check = useCallback(async (p: string) => {
    try {
      const res = await userService.telegram.linkStatus(p);
      if (!res.deep_link) {
        setStatus('unavailable');
        return;
      }
      setDeepLink(res.deep_link);
      setLinked(res.linked);
      setStatus('ready');
      if (res.linked && !autoSelectedRef.current) {
        autoSelectedRef.current = true;
        onChange('telegram');
      }
    } catch {
      // Non-critical enhancement — fail closed (hide) rather than block the OTP flow.
      setStatus('unavailable');
    }
  }, [onChange]);

  useEffect(() => {
    autoSelectedRef.current = false;
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 8) {
      setStatus('idle');
      return;
    }
    const t = setTimeout(() => check(phone), 400);
    return () => clearTimeout(t);
  }, [phone, check]);

  // The user is expected to tap the deep link, connect in Telegram (another
  // tab/app), then come back — recheck automatically when they do.
  useEffect(() => {
    if (status !== 'ready' || linked) return;
    const onFocus = () => check(phone);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [status, linked, phone, check]);

  if (status === 'idle' || status === 'unavailable') return null;

  return (
    <Box sx={{ mt: 1, mb: 1.5 }}>
      <ToggleButtonGroup
        value={value}
        exclusive
        size={size}
        onChange={(_, next: OtpChannel | null) => next && onChange(next)}
        sx={sx}
      >
        <ToggleButton value="telegram" disabled={!linked} sx={{ gap: 0.5, textTransform: 'none', px: 1.5 }}>
          <TelegramIcon fontSize="small" />
          Telegram
        </ToggleButton>
        <ToggleButton value="sms" sx={{ gap: 0.5, textTransform: 'none', px: 1.5 }}>
          <SmsIcon fontSize="small" />
          SMS
        </ToggleButton>
      </ToggleButtonGroup>

      {status === 'ready' && !linked && (
        <Typography fontSize={11} sx={{ mt: 0.5, color: captionColor ?? 'text.secondary' }}>
          Faster delivery via Telegram —{' '}
          <MuiLink href={deepLink ?? undefined} target="_blank" rel="noopener noreferrer">
            connect the bot
          </MuiLink>
          , then{' '}
          <MuiLink component="button" type="button" onClick={() => check(phone)} sx={{ fontSize: 11 }}>
            check again
          </MuiLink>
          .
        </Typography>
      )}
    </Box>
  );
}
