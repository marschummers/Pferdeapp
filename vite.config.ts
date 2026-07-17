import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/stallplaner/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Stallplaner',
        short_name: 'Stallplaner',
        description: 'Betreuung, Fütterung und Vorräte fürs Pferd planen – komplett offline',
        theme_color: '#211d17',
        background_color: '#211d17',
        display: 'standalone',
        start_url: '/stallplaner/',
        scope: '/stallplaner/',
        icons: [
          {
            src: 'icon-192-v1.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512-v1.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ],
})
