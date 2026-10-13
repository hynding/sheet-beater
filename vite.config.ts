import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Set VITE_BASE when the site is served from a sub-path (GitHub Pages serves
// project sites from /<repo>/). The native apps and local dev keep '/'.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered manually in main.tsx so the native (Capacitor) build can skip it.
      injectRegister: null,
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Sheet Beater',
        short_name: 'Sheet Beater',
        description: 'Learn to read sheet music by playing notes on a piano keyboard.',
        theme_color: '#121318',
        background_color: '#121318',
        display: 'standalone',
        orientation: 'landscape',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: { port: 5173 },
});
