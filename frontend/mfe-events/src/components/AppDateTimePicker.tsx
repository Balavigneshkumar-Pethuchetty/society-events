import { useState } from 'react';
import { Stack, ToggleButton, ToggleButtonGroup } from '@mui/material';
import type { SxProps, Theme } from '@mui/material';
import dayjs from 'dayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';

interface AppDateTimePickerProps {
  label: string;
  value: string; // UTC ISO string, or '' when empty
  onChange: (iso: string) => void;
  disabled?: boolean;
  required?: boolean;
  error?: boolean;
  helperText?: string;
  size?: 'small' | 'medium';
  fullWidth?: boolean;
  sx?: SxProps<Theme>;
}

// Always edits/displays in the browser's LOCAL time (12-hour by default, with a
// 24-hour toggle) — the value/onChange contract stays UTC ISO either way, matching
// every other datetime field in this app, so nothing is ever sent to the backend
// in local time regardless of which clock format is showing. The 12h/24h choice is
// intentionally not persisted — it always starts back at 12h on the next page load.
export default function AppDateTimePicker({
  label, value, onChange, disabled, required, error, helperText,
  size = 'small', fullWidth = true, sx,
}: AppDateTimePickerProps) {
  const [ampm, setAmpm] = useState(true);

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Stack direction="row" spacing={1} alignItems="flex-start" sx={sx}>
        <DateTimePicker
          label={label}
          value={value ? dayjs(value) : null}
          onChange={next => onChange(next && next.isValid() ? next.toDate().toISOString() : '')}
          ampm={ampm}
          disabled={disabled}
          sx={{ flex: 1 }}
          slotProps={{ textField: { size, fullWidth, required, error, helperText } }}
        />
        <ToggleButtonGroup
          size="small" exclusive value={ampm ? '12' : '24'}
          onChange={(_, v) => v && setAmpm(v === '12')}
          disabled={disabled}
          sx={{ mt: 0.5 }}
        >
          <ToggleButton value="12" sx={{ fontSize: 11, px: 1 }}>12h</ToggleButton>
          <ToggleButton value="24" sx={{ fontSize: 11, px: 1 }}>24h</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
    </LocalizationProvider>
  );
}
