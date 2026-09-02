import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer/src')
    }
  },
  test: {
    // Les tests de bout en bout pilotent une vraie application Electron :
    // ils relèvent de Playwright, pas de Vitest.
    include: ['test/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'out/**']
  }
})
