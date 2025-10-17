import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
    extensions: ['.mjs', '.js', '.jsx', '.ts', '.tsx', '.json'],
  },
  optimizeDeps: {
    esbuildOptions: { loader: { '.js': 'jsx' } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: ['node_modules', 'dist', 'tests/e2e/**', 'tests/storybook/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: {
        global: {
          lines: 80,
          functions: 80,
          statements: 80,
          branches: 80,
        },
      },
    },
  },
})
