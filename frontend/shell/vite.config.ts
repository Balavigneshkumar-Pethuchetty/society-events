import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    federation({
      name: 'shell',
      remotes: {
        mfe_admin: mode === 'development'
          ? 'http://localhost:4004/assets/remoteEntry.js'
          : '/mfe-admin/assets/remoteEntry.js',
        mfe_events: mode === 'development'
          ? 'http://localhost:4001/assets/remoteEntry.js'
          : '/mfe-events/assets/remoteEntry.js',
        mfe_booking: mode === 'development'
          ? 'http://localhost:4002/assets/remoteEntry.js'
          : '/mfe-booking/assets/remoteEntry.js',
        mfe_payment: mode === 'development'
          ? 'http://localhost:4003/assets/remoteEntry.js'
          : '/mfe-payment/assets/remoteEntry.js',
      },
      shared: {
        react:             { singleton: true, eager: true, requiredVersion: '^18.3.1' },
        'react-dom':       { singleton: true, eager: true, requiredVersion: '^18.3.1' },
        'react-router-dom':{ singleton: true, eager: true, requiredVersion: '^6.24.1' },
        '@mui/material':   { singleton: true, eager: true, requiredVersion: '^5.16.7' },
        '@emotion/react':  { singleton: true, eager: true, requiredVersion: '^11.13.0' },
        '@emotion/styled': { singleton: true, eager: true, requiredVersion: '^11.13.0' },
      },
    }),
  ],
  server: {
    port: 3000,
    host: true,
  },
  build: {
    target: 'esnext',
    modulePreload: false,
    minify: false,
    cssCodeSplit: false,
  },
}));
