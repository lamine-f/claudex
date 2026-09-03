import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from '@playwright/test'

// Capture l'écran sans terminal ouvert, pour juger de ce qui l'occupe.
const profil = await mkdtemp(join(tmpdir(), 'claudex-vide-'))
const projet = await mkdtemp(join(tmpdir(), 'claudex-projet-'))
await writeFile(
  join(profil, 'state.json'),
  JSON.stringify({
    workspaces: [
      { id: 'ws1', path: projet, name: 'boutique_front', color: '#d97757', order: 0, expanded: true }
    ],
    tabs: [],
    layout: { leftWidth: 260, middleWidth: 300 },
    activeWorkspaceId: 'ws1'
  })
)

const app = await electron.launch({
  args: [resolve('out/main/index.js'), `--user-data-dir=${profil}`],
  env: { ...process.env, CLAUDEX_TMUX_SOCKET: 'claudex-captures' }
})
const page = await app.firstWindow()
await page.setViewportSize({ width: 1440, height: 900 })
await page.waitForSelector('[aria-label="Conversations"]')
await page.waitForTimeout(1500)
await page.screenshot({ path: 'captures/6-sans-terminal.png' })
await app.close()
console.log('capture : captures/6-sans-terminal.png')
