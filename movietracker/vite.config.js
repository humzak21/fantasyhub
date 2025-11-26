import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000
  },
  build: {
    // Extremely conservative memory settings
    chunkSizeWarningLimit: 400, // Increased slightly as some chunks are naturally larger
    minify: 'esbuild', // Fastest and least memory-intensive
    target: 'es2015',
    rollupOptions: {
      output: {
        // Very simple chunking strategy to minimize memory usage
        manualChunks: {
          'react-core': ['react', 'react-dom'],
          'vendor': ['@supabase/supabase-js', 'react-router-dom'],
          'ui': ['framer-motion', 'lucide-react']
        },
        assetFileNames: 'assets/[name]-[hash][extname]'
      },
      // Disable caching to save memory
      cache: false
    },
    // Skip everything non-essential
    reportCompressedSize: false,
    sourcemap: false,
    cssCodeSplit: false, // Keep CSS together to reduce complexity
    assetsInlineLimit: 0 // Don't inline assets to reduce memory usage
  }
})