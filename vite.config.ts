import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The Devices & Sessions API is a Vercel serverless function (api/sessions.ts)
  // that only exists on the deployed site — Vite has no server to serve it. Proxy
  // it to the deployment during local development so the feature (and the
  // test:revoke-browser check) works locally too. Override with DEV_API_TARGET.
  server: {
    proxy: {
      '/api': process.env.DEV_API_TARGET ?? 'https://rpiet.vercel.app',
    },
  },
})
