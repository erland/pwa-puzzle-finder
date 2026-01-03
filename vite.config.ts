import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// NOTE: This app is hosted on GitHub Pages under /pwa-puzzle-finder/
const BASE = '/pwa-puzzle-finder/';

export default defineConfig(() => {
  return {
    base: BASE,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        // In dev, we keep SW disabled to avoid install loops while iterating locally.
        devOptions: { enabled: false },
        includeAssets: ['favicon.svg', 'icons/*.png'],
        manifest: {
          name: 'Puzzle Finder',
          short_name: 'Puzzle Finder',
          description: 'Camera-based puzzle piece extraction and analysis (OpenCV.js)',
          id: BASE,
          start_url: BASE,
          scope: BASE,
          display: 'standalone',
          background_color: '#0b0c12',
          theme_color: '#0b0c12',
          icons: [
            { src: `${BASE}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
            { src: `${BASE}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
            {
              src: `${BASE}icons/icon-512-maskable.png`,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        },
        workbox: {
          // We do NOT precache OpenCV (large). It will be fetched on-demand and runtime-cached.
          globIgnores: ['**/vendor/opencv/opencv.js', '**/vendor/opencv/*.wasm', '**/vendor/opencv/*.data'],
          // Safety net: if something still slips into precache, allow larger files.
          maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.includes('/vendor/opencv/'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'opencv-assets',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 }
              }
            }
          ]
        }
      })
    ]
  };
});
