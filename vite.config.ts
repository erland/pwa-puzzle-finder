import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * GitHub Pages base path:
 *   https://<user>.github.io/pwa-puzzle-finder/
 *
 * IMPORTANT: Keep `base` in sync with the repo name.
 */
export default defineConfig({
  base: '/pwa-puzzle-finder/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt'],
      manifest: {
        name: 'Puzzle Finder',
        short_name: 'Puzzle Finder',
        description: 'Find corner and edge jigsaw puzzle pieces using your camera.',
        start_url: '/pwa-puzzle-finder/',
        scope: '/pwa-puzzle-finder/',
        display: 'standalone',
        background_color: '#0b0b0f',
        theme_color: '#0b0b0f',
        icons: [
          { src: '/pwa-puzzle-finder/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-puzzle-finder/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-puzzle-finder/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ]
});
