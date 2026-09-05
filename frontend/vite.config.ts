import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const firebaseValues: Record<string, string> = {
    REPLACE_WITH_VITE_FIREBASE_API_KEY: env.VITE_FIREBASE_API_KEY || '',
    REPLACE_WITH_VITE_FIREBASE_AUTH_DOMAIN: env.VITE_FIREBASE_AUTH_DOMAIN || '',
    REPLACE_WITH_VITE_FIREBASE_PROJECT_ID: env.VITE_FIREBASE_PROJECT_ID || '',
    REPLACE_WITH_VITE_FIREBASE_STORAGE_BUCKET: env.VITE_FIREBASE_STORAGE_BUCKET || '',
    REPLACE_WITH_VITE_FIREBASE_MESSAGING_SENDER_ID: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    REPLACE_WITH_VITE_FIREBASE_APP_ID: env.VITE_FIREBASE_APP_ID || '',
  }

  return {
  plugins: [react(), {
    name: 'inject-firebase-service-worker-config',
    closeBundle() {
      const workerPath = resolve(process.cwd(), 'public/firebase-messaging-sw.js')
      const outputPath = resolve(process.cwd(), 'dist/firebase-messaging-sw.js')
      let worker = readFileSync(workerPath, 'utf8')
      for (const [placeholder, value] of Object.entries(firebaseValues)) {
        worker = worker.replaceAll(placeholder, value.replaceAll("'", "\\'"))
      }
      writeFileSync(outputPath, worker)
    },
  }],
  define: {
    global: 'globalThis',
  },
  // Proxy API calls to backend during local development
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: env.VITE_API_URL || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  }
})
