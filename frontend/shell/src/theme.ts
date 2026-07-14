import { createTheme, ThemeOptions } from '@mui/material/styles';

export const NAV_BG = '#1e293b';

export const ROLE_COLORS: Record<string, string> = {
  admin:            '#6366f1',
  committee_member: '#0ea5e9',
  resident:         '#10b981',
  security_guard:   '#f59e0b',
  sponsor:          '#7c3aed',
};

export const ROLE_LABELS: Record<string, string> = {
  admin:            'Administrator',
  committee_member: 'Committee Member',
  resident:         'Resident',
  security_guard:   'Security Guard',
  sponsor:          'Sponsor',
};

const shared: ThemeOptions = {
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: 14,
  },
  components: {
    MuiButton:      { styleOverrides: { root: { textTransform: 'none', fontWeight: 500 } } },
    MuiMenuItem:    { styleOverrides: { root: { fontSize: 14 } } },
    MuiChip:        { styleOverrides: { root: { fontWeight: 600 } } },
    MuiAppBar:      { defaultProps: { elevation: 0 } },
    MuiCssBaseline: {
      styleOverrides: { a: { color: 'inherit', textDecoration: 'none' } },
    },
  },
};

export function getTheme(mode: 'light' | 'dark') {
  return createTheme({
    ...shared,
    palette: {
      mode,
      primary:    { main: '#6366f1' },
      secondary:  { main: '#10b981' },
      warning:    { main: '#f59e0b' },
      error:      { main: '#f43f5e' },
      info:       { main: '#0ea5e9' },
      ...(mode === 'light'
        ? {
            background: { default: '#e7ebf1', paper: '#f1f4f8' },
            text:       { primary: '#0f172a', secondary: '#64748b' },
          }
        : {
            background: { default: '#0b1220', paper: '#161f32' },
            text:       { primary: '#e2e8f0', secondary: '#94a3b8' },
          }),
    },
  });
}

// Light theme, kept as the default export for anything that still imports `theme` directly.
export const theme = getTheme('light');
