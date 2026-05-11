import { createTheme } from '@mui/material/styles';

export const NAV_BG = '#1e293b';

export const ROLE_COLORS: Record<string, string> = {
  admin:            '#6366f1',
  committee_member: '#0ea5e9',
  resident:         '#10b981',
  security_guard:   '#f59e0b',
};

export const ROLE_LABELS: Record<string, string> = {
  admin:            'Administrator',
  committee_member: 'Committee Member',
  resident:         'Resident',
  security_guard:   'Security Guard',
};

export const theme = createTheme({
  palette: {
    primary:    { main: '#6366f1' },
    secondary:  { main: '#10b981' },
    warning:    { main: '#f59e0b' },
    error:      { main: '#f43f5e' },
    info:       { main: '#0ea5e9' },
    background: { default: '#f8fafc', paper: '#ffffff' },
    text:       { primary: '#0f172a', secondary: '#64748b' },
  },
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
});
