import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/viaje-europa/',
  define: { __APP_VERSION__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'icon-192.png'],
      manifest: {
        name: 'Europa 2027',
        short_name: 'Europa 27',
        description: 'Nuestro itinerario por Europa: rutas, mapas, audioguías y gastos.',
        lang: 'es',
        start_url: '/viaje-europa/',
        scope: '/viaje-europa/',
        display: 'standalone',
        background_color: '#111b31',
        theme_color: '#111b31',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: '/viaje-europa/index.html',
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname === 'server.arcgisonline.com',
            handler: 'CacheFirst',
            options: { cacheName: 'satelite', expiration: { maxEntries: 5000, maxAgeSeconds: 60 * 60 * 24 * 300 }, cacheableResponse: { statuses: [0, 200] } }
          },
          {
            urlPattern: ({ url }) => url.hostname === 'tile.openstreetmap.org',
            handler: 'CacheFirst',
            options: { cacheName: 'mapa-osm', expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 60 }, cacheableResponse: { statuses: [0, 200] } }
          },
          {
            urlPattern: ({ url }) => url.hostname === 'routing.openstreetmap.de',
            handler: 'CacheFirst',
            options: { cacheName: 'rutas', expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 300 }, cacheableResponse: { statuses: [200] } }
          },
          {
            urlPattern: ({ url }) => url.hostname === 'api.open-meteo.com',
            handler: 'NetworkFirst',
            options: { cacheName: 'clima', networkTimeoutSeconds: 6, expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 } }
          }
        ]
      }
    })
  ]
});
