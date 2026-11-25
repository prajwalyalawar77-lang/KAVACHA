import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Flask API runs on port 5000 during development. All /api calls are proxied
// so the browser never needs CORS credentials or a second origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
  preview: { port: 4173 },
});
