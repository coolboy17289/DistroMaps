import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

// Resolve the src directory for absolute imports
const SRC_ABS = fileURLToPath(new URL('./src', import.meta.url))

function apiServerPlugin() {
  return {
    name: 'distromap-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? ''
        // Only intercept /api/* — everything else falls through to
        // Vite's default static/HMR middleware.
        if (!url.startsWith('/api')) {
          next()
          return;
        }
        try {
          // Load through Vite's SSR graph so HMR + TS transpilation
          // work without a restart. The path is relative to project root.
          const mod = await server.ssrLoadModule('/src/api/index.ts')
          const handler = mod.default
          if (typeof handler !== 'function') {
            throw new Error('api/index.ts default export is not a function')
          }
          // The Vite dev server's req/res are standard Node.js
          // http.IncomingMessage / http.ServerResponse
          await handler(req, res)
        } catch (err) {
          // Surface the error in the dev console + as a 500 so a
          // syntax error in api/index.ts is obvious immediately.
          console.error('[distromap-api] handler error:', err)
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                detail: 'api handler error',
                error: err instanceof Error ? err.message : String(err),
              }),
            )
          }
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [vue(), apiServerPlugin()],
  resolve: {
    alias: {
      '@': SRC_ABS,
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5175,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
})
