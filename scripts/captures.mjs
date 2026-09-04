/**
 * Produit des captures de Claudex dans un état représentatif.
 *
 *   node scripts/captures.mjs <dossier de sortie>
 *
 * L'application est lancée sur un profil dédié : la fenêtre de travail de
 * l'utilisateur n'est pas touchée.
 */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { _electron as electron } from '@playwright/test'

const sortie = resolve(process.argv[2] ?? 'captures')
await mkdir(sortie, { recursive: true })

const profil = await mkdtemp(join(tmpdir(), 'claudex-captures-'))

/*
 * Les projets à montrer, séparés par « : ». Par défaut le dossier courant : les
 * captures ont plus d'allure sur un projet qui a des conversations derrière lui,
 * mais aucun chemin de machine n'a sa place dans le dépôt.
 *
 *   CLAUDEX_CAPTURE_PROJETS=~/code/mon-app:~/code/autre node scripts/captures.mjs
 */
const ACCENTS = ['#e8825a', '#5aa9e8', '#7ec96f', '#c98fe0']
const PROJETS = (process.env.CLAUDEX_CAPTURE_PROJETS ?? process.cwd())
  .split(':')
  .filter(Boolean)
  .map((chemin, rang) => ({
    id: `ws-${rang}`,
    path: resolve(chemin),
    name: basename(resolve(chemin)),
    color: ACCENTS[rang % ACCENTS.length],
    order: rang,
    expanded: rang === 0
  }))

await writeFile(
  join(profil, 'state.json'),
  JSON.stringify({
    workspaces: PROJETS,
    tabs: [],
    layout: { leftWidth: 260, middleWidth: 300 },
    activeWorkspaceId: PROJETS[0].id
  })
)

const app = await electron.launch({
  args: [resolve('out/main/index.js'), `--user-data-dir=${profil}`],
  // Serveur tmux distinct : les captures ne doivent pas toucher aux sessions
  // ouvertes dans l'application.
  env: { ...process.env, CLAUDEX_TMUX_SOCKET: 'claudex-captures' }
})
const page = await app.firstWindow()
// Un canvas WebGL ne se capture pas : sans cela le terminal ressort vide.
await page.addInitScript(() => {
  window.__claudexSansWebgl = true
})
await page.reload()
await page.setViewportSize({ width: 1440, height: 900 })
await page.waitForSelector('[aria-label="Conversations"]')

const attendre = (ms) => page.waitForTimeout(ms)
const capturer = async (nom) => {
  await page.screenshot({ path: join(sortie, `${nom}.png`) })
  console.log('capture :', join(sortie, `${nom}.png`))
}

// Refermer le diagnostic s'il s'est ouvert de lui-même : il sera capturé plus tard.
await attendre(1200)
if (await page.getByText("État de l'environnement").isVisible().catch(() => false)) {
  await page.getByRole('button', { name: '✕' }).first().click().catch(() => undefined)
  await attendre(400)
}

// 2. Vue principale : sessions dépliées et un terminal actif
await page.getByTitle('Nouveau terminal (⌘T)').click()
await page.waitForSelector('.xterm')
await attendre(2500)

const onglet = await page.evaluate(() => Object.keys(window.__claudex ?? {})[0])
if (onglet) {
  await page.evaluate(
    ([id]) => window.claudex.term.input(id, 'git -c color.ui=always status --short --branch | head -14\n'),
    [onglet]
  )
}
await attendre(2500)
await capturer('1-vue-principale')

// 3. Arborescence dépliée
await page.getByRole('button', { name: 'Fichiers', exact: true }).click().catch(() => undefined)
await attendre(700)
for (const dossier of ['src', 'main', 'services']) {
  const cible = page.getByLabel('Sessions et fichiers').getByText(dossier, { exact: true }).first()
  if (await cible.isVisible().catch(() => false)) {
    await cible.click()
    await attendre(600)
  }
}
await capturer('2-arborescence')

// 4. Aperçu de fichier
const fichier = page.getByRole('button', { name: /package\.json$/ }).first()
if (await fichier.isVisible().catch(() => false)) {
  await fichier.click()
  await attendre(1200)
  await capturer('3-apercu-fichier')
  await page.keyboard.press('Escape')
  await attendre(400)
}

// 5. Une conversation reprise : l'onglet porte son titre, l'agent occupe la colonne
await page.getByRole('button', { name: 'Conversations', exact: true }).click().catch(() => undefined)
await attendre(500)
// La première conversation venue : le contenu dépend du projet qu'on capture.
const session = page.getByLabel('Sessions et fichiers').locator('li button').first()
if (await session.isVisible().catch(() => false)) {
  await session.click()
  await attendre(9000)
  await capturer('4-session-agent')
}

// 6. Diagnostic
await page.getByLabel("État de l'environnement").click()
await attendre(700)
await capturer('5-diagnostic')

await app.close()
console.log('terminé')
