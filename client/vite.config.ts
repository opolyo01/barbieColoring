import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (id.includes('ag-grid-enterprise')) {
            return 'ag-grid-enterprise';
          }

          if (id.includes('ag-grid-react') || id.includes('ag-grid-community')) {
            return 'ag-grid-core';
          }

          if (id.includes('lightweight-charts')) {
            return 'charts';
          }

          if (id.includes('react-router-dom')) {
            return 'router';
          }

          if (id.includes('/react/') || id.includes('/react-dom/')) {
            return 'react-vendor';
          }
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
});
