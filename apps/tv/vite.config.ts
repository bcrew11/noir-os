import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const backend = process.env.NOIR_BACKEND ?? 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      // xfwd lets the server tell proxied LAN clients apart from the local dashboard.
      '/api': { target: backend, xfwd: true },
      '/assets': { target: backend, xfwd: true },
      '/ws': { target: backend.replace('http', 'ws'), ws: true, xfwd: true },
    },
  },
  build: { target: 'es2020', cssTarget: 'chrome87', chunkSizeWarningLimit: 900 },
});
