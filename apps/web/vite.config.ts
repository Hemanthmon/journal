import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Use the shared package's TypeScript source (ESM) directly.
    alias: { '@journal/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts') },
    // One copy of React for the whole bundle (the monorepo root also has an Expo-pinned react-dom).
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5173,
    // Same-origin API in development, so the session cookie works like in production.
    proxy: { '/api': 'http://localhost:4000' },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      // Charts are the bulk of the bundle; keep them in their own cacheable file.
      output: { manualChunks: { charts: ['recharts'], react: ['react', 'react-dom', 'react-router'] } },
    },
  },
});
