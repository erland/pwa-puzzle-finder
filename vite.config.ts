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
  optimizeDeps: {
    // OpenCV is large; keep it as a separate chunk and avoid pre-bundling.
    exclude: ['opencv-js-wasm']
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: false },
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
},
workbox: {
  // OpenCV bundles are huge. Do NOT precache them (Workbox default limit is 2 MiB).
  // They will be fetched on-demand and then cached at runtime.
  globIgnores: ['**/opencv-*.js', '**/*.wasm',
          '**/vendor/opencv/opencv.js'],
  runtimeCaching: [
    {
      urlPattern: /\/assets\/opencv-.*\.js$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'opencv-js',
        expiration: {
          maxEntries: 2,
          maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
        }
      }
    },
    {
      urlPattern: /\/assets\/.*\.wasm$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'opencv-wasm',
        expiration: {
          maxEntries: 4,
          maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
        }
      }
    }
  ]
      }
    })
  ]
});
