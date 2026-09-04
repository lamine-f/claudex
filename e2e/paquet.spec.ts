import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { expect, test } from '@playwright/test'
import { _electron as electron } from '@playwright/test'

const run = promisify(execFile)

/**
 * L'application empaquetée, lancée depuis son bundle.
 *
 * C'est le seul moyen de vérifier que le module natif du terminal survit à
 * l'empaquetage : sorti de l'archive asar, il ne se charge que si le chemin
 * décompressé est correct — et cela ne se voit qu'à l'exécution.
 */
const BINAIRE =
  process.platform === 'darwin'
    ? resolve('dist/mac-arm64/Claudex.app/Contents/MacOS/Claudex')
    : // electron-builder tire le nom de l'exécutable du `name` du package.json,
      // en minuscules : le paquet Linux s'appelle donc `claudex`, sans capitale.
      resolve('dist/linux-unpacked/claudex')

// Ce cas vise le bundle, pas les sources : lancé dans la suite courante il
// contrôlerait un paquet périmé, ce qui ne prouve rien. Il est réservé à
// `npm run dist`, qui l'enchaîne juste après avoir reconstruit.
test.skip(
  process.env.CLAUDEX_TEST_PAQUET !== '1' || !existsSync(BINAIRE),
  'réservé à npm run dist'
)

const SOCKET_PAQUET = 'claudex-paquet'

test('le paquet ouvre un vrai terminal', async () => {
  const binaire = BINAIRE
  const profil = await mkdtemp(join(tmpdir(), 'claudex-paquet-'))
  const projet = await mkdtemp(join(tmpdir(), 'claudex-projet-'))

  // Le serveur tmux est mis debout avant l'application, pour la même raison que
  // dans les fixtures : lancé par elle, il hériterait de ses descripteurs et les
  // garderait ouverts après sa fermeture, où Playwright attend leur fin.
  await run('tmux', ['-L', SOCKET_PAQUET, 'has-session', '-t', '=claudex_sentinelle']).catch(() =>
    run('tmux', [
      '-L',
      SOCKET_PAQUET,
      'new-session',
      '-d',
      '-s',
      'claudex_sentinelle'
    ]).catch(() => undefined)
  )

  await writeFile(
    join(profil, 'state.json'),
    JSON.stringify({
      workspaces: [
        { id: 'ws1', path: projet, name: 'Projet test', color: '#d97757', order: 0, expanded: true }
      ],
      tabs: [],
      layout: { leftWidth: 260, middleWidth: 300 },
      activeWorkspaceId: 'ws1'
    })
  )

  const app = await electron.launch({
    executablePath: binaire,
    args: [`--user-data-dir=${profil}`],
    env: { ...process.env, CLAUDEX_TMUX_SOCKET: SOCKET_PAQUET }
  })
  const page = await app.firstWindow()

  try {
    await page.waitForSelector('[aria-label="Conversations"]')
    await page.getByTitle(/^Nouveau terminal /).click()
    await expect(page.locator('.xterm')).toHaveCount(1)

    // Le terminal doit réellement parler : c'est la preuve que node-pty a été
    // chargé depuis l'archive décompressée.
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const reg = (window as never as Record<string, Record<string, { buffer: { active: { length: number; getLine(i: number): { translateToString(t: boolean): string } | undefined } } }>>).__claudex ?? {}
            const premier = Object.values(reg)[0]
            if (!premier) return 0
            const b = premier.buffer.active
            let vues = 0
            for (let i = 0; i < b.length; i++) if (b.getLine(i)?.translateToString(true).trim()) vues++
            return vues
          }),
        { timeout: 20_000 }
      )
      .toBeGreaterThan(0)
  } finally {
    await app.close()
  }
})
