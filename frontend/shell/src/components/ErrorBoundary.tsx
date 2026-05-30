import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import { logError } from '../utils/splunk';

interface Props  { children: React.ReactNode }
interface State  { error: Error | null }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logError(error.message, {
      source: 'react-error-boundary',
      stack:  error.stack,
      extra:  { componentStack: info.componentStack ?? '' },
    });
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <Box sx={{ p: 4, textAlign: 'center', mt: 8 }}>
          <Typography fontSize={48} lineHeight={1} mb={2}>⚠️</Typography>
          <Typography variant="h5" fontWeight={700} mb={1}>Something went wrong</Typography>
          <Typography color="text.secondary" fontSize={14} mb={3} sx={{ maxWidth: 440, mx: 'auto' }}>
            {error.message}
          </Typography>
          <Button variant="outlined" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
        </Box>
      );
    }
    return this.props.children;
  }
}
