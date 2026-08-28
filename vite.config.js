import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react-dom/client',
      'scheduler',
      'use-sync-external-store',
      'use-sync-external-store/shim',
      'use-callback-ref',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-dialog',
      '@radix-ui/react-tabs',
      '@radix-ui/react-slot',
      '@radix-ui/react-separator',
      '@radix-ui/react-progress',
      '@radix-ui/react-label',
      '@radix-ui/react-avatar',
      'recharts'
    ],
    force: true,
    exclude: []
  },
  resolve: {
    alias: {
      // '@/components' used to point at a second, root-level shadcn tree.
      // That tree is deleted; '@' -> ./src now covers @/components/ui/*.
      '@': path.resolve(__dirname, './src'),
      '@/lib': path.resolve(__dirname, './lib'),
      '@/utils': path.resolve(__dirname, './utils'),
      '@/types': path.resolve(__dirname, './types'),
      '@/services': path.resolve(__dirname, './services'),
      '@/hooks': path.resolve(__dirname, './hooks'),
      '@/styles': path.resolve(__dirname, './styles'),
      // Force React singleton
      'react': path.resolve(__dirname, './node_modules/react'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
      'use-sync-external-store': path.resolve(__dirname, './node_modules/use-sync-external-store'),
      'use-callback-ref': path.resolve(__dirname, './node_modules/use-callback-ref')
    },
    dedupe: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react-dom/client',
      'use-sync-external-store',
      'use-callback-ref',
      'scheduler'
    ]
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: 'esbuild',
    target: 'esnext',
    rollupOptions: {
      external: [
        'child_process',
        'fs',
        'path'
      ],
      output: {
        // Chunking rule: a manual chunk must never import another manual chunk
        // that imports it back. A circular edge between two eagerly-loaded
        // chunks means one evaluates while the other's exports are still
        // uninitialised, and the app dies before it renders.
        //
        // That is exactly what the previous version did. It grouped React with
        // `id.includes('node_modules/react')`, a prefix match that also
        // swallowed react-day-picker, react-hook-form, react-resizable-panels
        // and react-router-dom. Dragging those *consumers* into the React core
        // chunk gave it outbound imports — react-day-picker pulls in date-fns,
        // which sat in vendor-misc alongside @tanstack/react-query, which
        // imports React straight back. The result was
        //
        //   Uncaught TypeError: Cannot read properties of undefined
        //   (reading 'createContext')   at QueryClientProvider
        //
        // and a white screen in production only — dev serves modules
        // unbundled, so nothing about it reproduces locally with `npm run dev`.
        //
        // It also hand-split app code into desktop-bundle / mobile-bundle /
        // shared-services, which mutually import each other and cycled too.
        // App-level splitting is now left to Rollup, which follows the real
        // import graph; the per-tab chunks come from `React.lazy` in
        // FantasyFootballApp.jsx and still work exactly as before.
        manualChunks: (id) => {
          // App code: Rollup decides, using the actual dependency graph.
          if (!id.includes('node_modules')) return;

          const pkg = /node_modules\/(?:\.pnpm\/)?((?:@[^/]+\/)?[^/]+)/.exec(id)?.[1];

          // recharts is reachable only from lazily-loaded chart widgets. Left
          // unassigned it rides along with them instead of being pulled into
          // the eager vendor chunk, which is what §6.5 wanted anyway. Nothing
          // inside `vendor` imports recharts, so this adds no edge back.
          if (pkg === 'recharts') return;

          // Everything else — React included — in one chunk. A single chunk
          // cannot cycle with itself, which is the whole point.
          //
          // React core was briefly given its own `vendor-react` chunk with an
          // exact package-name match, and that still cycled: Vite's CommonJS
          // interop helpers are a *virtual* module, so they are not under
          // node_modules, fell through to Rollup, and landed in `vendor`.
          // React's CJS builds import those helpers, so vendor-react gained an
          // outbound edge to vendor while vendor still imported React back.
          //
          // Splitting React out is what creates the hazard in the first place,
          // and it buys only cache granularity on a chunk that is eager
          // regardless. Correctness wins.
          return 'vendor';
        },
      },
    },
    // Optimize chunk size warnings
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 3000,
    host: true,
    open: true,
    proxy: {
      '/api/movies': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/analytics': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    port: process.env.PORT || 4173,
    host: '0.0.0.0',
    allowedHosts: ['healthcheck.railway.app', 'www.squaredstudios.net', 'squaredstudios.net', 'fantasyhub-production.up.railway.app'],
  },
  define: {
    // Environment variables for client-side
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    // Ensure Supabase env vars are available at build time for Railway
    __SUPABASE_URL__: JSON.stringify(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL),
    __SUPABASE_ANON_KEY__: JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY),
    // Define global process for browser environment
    global: 'globalThis',
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
  // Ensure proper handling of environment variables
  envPrefix: ['VITE_', 'REACT_APP_'],
})