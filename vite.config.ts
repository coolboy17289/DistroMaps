import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mountApiRoutes } from './frontend/server/dev-api';

const __dirname = dirname(fileURLToPath(import.meta.url));

const apiPlugin = (): Plugin => ({
  name: 'distromap-api',
  configureServer(server) {
    mountApiRoutes(server.middlewares);
  },
  configurePreviewServer(server) {
    mountApiRoutes(server.middlewares);
  },
});

export default defineConfig({
  // `root`, `publicDir`, and `outDir` are all relative to the Vite project root.
  // Because root = 'frontend', the public dir is just 'public' (not 'frontend/public'),
  // and the build output is just 'dist' (not 'frontend/dist'). Earlier versions had
  // 'frontend/' prefixes which doubled up under root and made /data.json fall through
  // to the SPA's index.html fallback.
  root: 'frontend',
  publicDir: 'public',
  resolve: {
    alias: {
      // Trailing-slash on both sides matches Vite/@rollup-plugin-alias convention
      // for directory aliases so intent is explicit.
      '@/': resolve(__dirname, 'frontend/src') + '/',
      '@shared/': resolve(__dirname, 'shared') + '/',
    },
  },
  plugins: [react(), apiPlugin()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});
