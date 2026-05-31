import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig(({ mode }) => ({
  base: mode === 'development' ? '/' : '/mfe-booking/',
  plugins: [
    react(),
    federation({
      name: 'mfe_booking',
      filename: 'remoteEntry.js',
      exposes: {
        './BookingApp': './src/BookingApp',
      },
      shared: {
        react:             { singleton: true, requiredVersion: '^18.3.1' },
        'react-dom':       { singleton: true, requiredVersion: '^18.3.1' },
        'react-router-dom':{ singleton: true, requiredVersion: '^6.24.1' },
        '@mui/material':   { singleton: true, requiredVersion: '^5.16.7' },
        '@emotion/react':  { singleton: true, requiredVersion: '^11.13.0' },
        '@emotion/styled': { singleton: true, requiredVersion: '^11.13.0' },
      },
    }),
  ],
  server:  { port: 4002, cors: true },
  preview: { port: 4002, cors: true },
  build: {
    target: 'esnext',
    modulePreload: false,
    minify: mode === 'production',
    cssCodeSplit: false,
  },
}));
