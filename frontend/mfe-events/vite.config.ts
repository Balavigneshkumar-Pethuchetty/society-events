import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig(({ mode }) => ({
  base: mode === 'development' ? '/' : '/mfe-events/',
  plugins: [
    react(),
    federation({
      name: 'mfe_events',
      filename: 'remoteEntry.js',
      exposes: {
        './EventsApp': './src/EventsApp',
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
  server: {
    port: 4001,
    cors: true,
    proxy: {
      '/realms':     { target: 'http://localhost:8080' },
      '/resources':  { target: 'http://localhost:8080' },
      '/api/events': { target: 'http://localhost:8080' },
    },
  },
  preview: {
    port: 4001,
    cors: true,
    proxy: {
      '/realms':     { target: 'http://localhost:8080' },
      '/resources':  { target: 'http://localhost:8080' },
      '/api/events': { target: 'http://localhost:8080' },
    },
  },
  build: {
    target: 'esnext',
    modulePreload: false,
    minify: false,
    cssCodeSplit: false,
  },
}));
