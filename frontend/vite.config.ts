import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/kalshi-api': {
        target: 'https://api.elections.kalshi.com/trade-api/v2',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/kalshi-api/, ''),
      },
    },
  },
});
