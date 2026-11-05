import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const backend = process.env.NOIR_BACKEND ?? 'http://127.0.0.1:8787';

export default defineConfig({
  base: '/phone/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    host: true, // reachable from your phone on the LAN
    proxy: {
      '/api': { target: backend, xfwd: true },
      '/assets': { target: backend, xfwd: true },
      '/ws': { target: backend.replace('http', 'ws'), ws: true, xfwd: true },
    },
  },
  build: { target: 'es2020' },
});
