import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider, CssBaseline, Box, Typography } from '@mui/material';
import { createTheme } from '@mui/material/styles';
import { PaymentApp } from './PaymentApp';

const theme = createTheme({ palette: { primary: { main: '#f59e0b' } } });

function DevHome() {
  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>Payment MFE — Standalone Dev</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Try these routes to preview pages:
      </Typography>
      {['/checkout', '/payments'].map((r) => (
        <Box key={r} sx={{ mb: 0.5 }}>
          <Typography component="a" href={r} fontSize={13} sx={{ color: '#6366f1', fontFamily: 'monospace' }}>{r}</Typography>
        </Box>
      ))}
    </Box>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/checkout/*" element={<PaymentApp />} />
          <Route path="/payments/*" element={<PaymentApp />} />
          <Route path="*"           element={<DevHome />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
