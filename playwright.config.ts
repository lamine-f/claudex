import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // Les tests pilotent une vraie application Electron avec de vraies sessions
  // tmux : les exécuter en parallèle les ferait se marcher dessus.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']]
})
