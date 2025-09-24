import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
      '@floating-ui/react',
      '@floating-ui/react-dom',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-dialog',
      '@radix-ui/react-tabs',
      '@radix-ui/react-slot',
      '@radix-ui/react-separator',
      '@radix-ui/react-progress',
      '@radix-ui/react-label',
      '@radix-ui/react-avatar'
    ],
    force: true,
    exclude: []
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/components': path.resolve(__dirname, './components'),
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
        manualChunks: (id) => {
          // Core vendor libraries - keep ALL React-related in same chunk
          if (id.includes('node_modules/react') ||
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/use-sync-external-store') ||
              id.includes('node_modules/use-callback-ref') ||
              id.includes('node_modules/scheduler')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/react-router-dom')) {
            return 'vendor-router';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
          if (id.includes('node_modules/@supabase')) {
            return 'vendor-supabase';
          }
          if (id.includes('node_modules/@radix-ui')) {
            return 'vendor-ui';
          }
          if (id.includes('node_modules/@floating-ui')) {
            return 'vendor-ui';
          }
          if (id.includes('node_modules/use-callback-ref')) {
            return 'vendor-ui';
          }

          // Mobile-specific bundles
          if (id.includes('MobileFantasyFootballApp') ||
              id.includes('MobileNavigation') ||
              id.includes('MobilePowerRankings') ||
              id.includes('MobileStatistics') ||
              id.includes('mobile.css') ||
              id.includes('mobileDetection')) {
            return 'mobile-bundle';
          }

          // Desktop-specific bundles
          if (id.includes('FantasyFootballApp') && !id.includes('Mobile')) {
            return 'desktop-bundle';
          }

          // Exclude Node.js utilities from browser bundle
          if (id.includes('utils/rExecutor')) {
            return undefined; // Don't include in any chunk
          }

          // Shared utilities and services
          if (id.includes('services/') || id.includes('hooks/') || id.includes('utils/')) {
            return 'shared-services';
          }

          // Other node_modules
          if (id.includes('node_modules')) {
            return 'vendor-misc';
          }
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