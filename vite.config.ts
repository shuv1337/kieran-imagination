import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Vitest picks up the `test` field; cast keeps vite/vitest type mismatch quiet.
export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: ['kier.shuv.app'],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'pwa-icon.png'],
      manifest: {
        name: "Kieran's Imagination",
        short_name: "Kieran's App",
        description: 'AI Image Generator for Kids',
        theme_color: '#011627',
        background_color: '#011627',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-icon.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-icon.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  // @ts-expect-error vitest extends vite config
  test: {
    environment: 'jsdom',
    setupFiles: './vitest.setup.ts',
  },
});
