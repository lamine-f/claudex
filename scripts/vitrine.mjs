/**
 * Produit la galerie de captures du README.
 *
 *   node scripts/vitrine.mjs [dossier de sortie]   (défaut : docs/)
 *
 * Tout est fabriqué pour l'occasion — un dépôt jetable, des conversations
 * inventées, un profil neuf — pour que les captures ne dépendent ni de la
 * machine ni du contenu réel de qui les regénère, et qu'aucun nom de projet
 * privé ne se retrouve dans le dépôt.
 */
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rename, rm, utimes, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from '@playwright/test'

const SUR_WINDOWS = process.platform === 'win32'

/**
 * Chaque plateforme écrit chez elle.
 *
 * Windows ne refait pas toute la galerie : l'application y est la même, et huit
 * captures jumelles doubleraient la page du dépôt sans rien apprendre. Seules
 * sont reprises celles où le système se voit — le cadre de la fenêtre, et
 * l'écran d'état qui porte l'avertissement propre à ce portage.
 */
const VOULUES = SUR_WINDOWS ? new Set(['claudex', 'etat']) : null

const sortie = resolve(process.argv[2] ?? (SUR_WINDOWS ? join('docs', 'windows') : 'docs'))
await mkdir(sortie, { recursive: true })

const profil = await mkdtemp(join(tmpdir(), 'claudex-vitrine-'))
const hooks = join(profil, 'hooks')
// Un chemin court et lisible plutôt qu'un dossier temporaire : il s'affiche
// dans l'aperçu de fichier et dans le terminal. Sur Windows, le dossier public
// tient le même rôle que /tmp : court, écrivable sans droits, et sans nom
// d'utilisateur à masquer ensuite.
const projet = SUR_WINDOWS ? join(process.env.PUBLIC ?? 'C:\\Users\\Public', 'atelier') : '/tmp/atelier'
await rm(projet, { recursive: true, force: true })

// ── Un dépôt qui a l'air d'un vrai projet ────────────────────────────────────
const sh = (cmd, args) => execFileSync(cmd, args, { cwd: projet, stdio: 'ignore' })
await mkdir(join(projet, 'src', 'facturation'), { recursive: true })
await mkdir(join(projet, 'public'), { recursive: true })
await writeFile(join(projet, 'src', 'index.ts'), "export const bonjour = () => 'salut'\n")
await writeFile(
  join(projet, 'src', 'facturation', 'facture.ts'),
  `export interface Facture {\n  id: string\n  montant: number\n  emiseLe: Date\n}\n\n/** Total d'une facture, taxes comprises. */\nexport function total(facture: Facture, taux = 0.18): number {\n  return Math.round(facture.montant * (1 + taux))\n}\n`
)
await writeFile(join(projet, 'src', 'facturation', 'facture.test.ts'), "import { total } from './facture'\n")
await writeFile(join(projet, 'public', 'style.css'), 'body { margin: 0 }\n')
await writeFile(join(projet, 'package.json'), '{\n  "name": "atelier",\n  "version": "1.0.0"\n}\n')
await writeFile(join(projet, 'README.md'), '# atelier\n')
// La branche est nommée explicitement : sans cela le décor prend le défaut de la
// machine, et la capture montrait `master` ici et `main` ailleurs.
sh('git', ['init', '-q', '-b', 'main'])
sh('git', ['add', '.'])
sh('git', ['-c', 'user.email=a@b.c', '-c', 'user.name=atelier', 'commit', '-qm', 'premier jet'])
await writeFile(join(projet, 'src', 'index.ts'), "export const bonjour = () => 'bonjour'\n")
await writeFile(join(projet, 'src', 'facturation', 'remise.ts'), 'export const remise = 0.1\n')

// ── Des conversations, d'âges différents ─────────────────────────────────────
const dossier = join(homedir(), '.claude', 'projects', projet.replace(/[^a-zA-Z0-9-]/g, '-'))
await mkdir(dossier, { recursive: true })
const TITRES = [
  'Refonte de la facturation',
  'Migration du schéma',
  'Taux de TVA par pays',
  'Erreur de capture réseau',
  'Profil d’autorisation',
  'Bonjour le monde'
]
const uuids = []
for (const [rang, titre] of TITRES.entries()) {
  const uuid = `${'0123456789abcdef'[rang].repeat(8)}-1111-1111-1111-111111111111`
  uuids.push(uuid)
  const fichier = join(dossier, `${uuid}.jsonl`)
  await writeFile(
    fichier,
    `${JSON.stringify({ type: 'ai-title', aiTitle: titre })}\n` +
      `${JSON.stringify({ type: 'assistant', gitBranch: rang % 3 === 0 ? 'main' : 'facturation' })}\n`
  )
  const date = new Date(Date.now() - rang * 2_700_000)
  await utimes(fichier, date, date)
}

await writeFile(
  join(profil, 'state.json'),
  JSON.stringify({
    workspaces: [
      { id: 'ws0', path: '/tmp/notes', name: 'notes', color: '#e8825a', order: 0, expanded: true },
      { id: 'ws1', path: projet, name: 'atelier', color: '#c98fe0', order: 1, expanded: true },
      { id: 'ws2', path: '/tmp/site', name: 'site-vitrine', color: '#7ec96f', order: 2, expanded: true }
    ],
    tabs: [],
    layout: { leftWidth: 260, middleWidth: 300 },
    activeWorkspaceId: 'ws1'
  })
)

// ── L'application ────────────────────────────────────────────────────────────
const app = await electron.launch({
  args: [resolve('out/main/index.js'), `--user-data-dir=${profil}`],
  env: { ...process.env, CLAUDEX_TMUX_SOCKET: 'claudex-vitrine', CLAUDEX_HOOKS_DIR: hooks }
})
const page = await app.firstWindow()
await page.addInitScript(() => {
  window.__claudexSansWebgl = true
})
await page.reload()
await page.setViewportSize({ width: 1280, height: 800 })
await page.waitForSelector('[aria-label="Conversations"]')

const pause = (ms) => page.waitForTimeout(ms)
const colonne = page.getByLabel('Sessions et fichiers')
const ligne = (titre) => colonne.locator('li', { hasText: titre }).last()
// Les colonnes seules : le terminal montre un vrai shell, dont l'invite et les
// chemins n'ont rien à faire dans une capture publiée.
const COLONNES = { x: 0, y: 0, width: 490, height: 470 }

async function capturer(nom, clip) {
  // Le scénario est joué en entier partout — il éprouve l'application au passage
  // — mais chaque plateforme ne garde que ce qu'elle a à montrer.
  if (VOULUES && !VOULUES.has(nom)) return
  await pause(250)
  await page.screenshot({ path: join(sortie, `${nom}.png`), ...(clip ? { clip } : {}) })
  console.log('  ', `${nom}.png`)
}

await pause(1200)
if (await page.getByText("État de l'environnement").isVisible().catch(() => false)) {
  await page.getByRole('button', { name: '✕' }).first().click().catch(() => undefined)
  await pause(300)
}

// ── 1. Vue principale ────────────────────────────────────────────────────────
// Un terminal ordinaire d'abord : reprendre une conversation lance un vrai
// `claude`, dont l'écran d'accueil dirait moins de l'application que la sienne.
// Le titre porte le raccourci, qui change avec le système : le début suffit à
// désigner le bouton, et ce script n'a pas à savoir lequel des deux il verra.
await page.getByTitle(/^Nouveau terminal/).click()
await page.waitForSelector('.xterm')
await pause(2500)
const shell = await page.evaluate(() => Object.keys(window.__claudex ?? {})[0])
const taper = async (commande, attente = 1200) => {
  // Un retour chariot, comme un vrai terminal : PSReadLine ne prend pas un saut
  // de ligne pour une validation.
  await page.evaluate(([id, c]) => window.claudex.term.input(id, `${c}\r`), [shell, commande])
  await pause(attente)
}
// L'invite du shell porte le nom de la machine : on la remplace avant de capturer.
await taper(
  SUR_WINDOWS ? "function prompt { 'atelier> ' }" : "PROMPT='%F{244}atelier%f %# '",
  800
)
await taper('clear', 600)
await taper('git -c color.ui=always status --short --branch')
// `Get-ChildItem -Name` plutôt que `ls` : la sortie tabulaire de PowerShell
// commence par le chemin complet du dossier, qui n'a rien à faire dans une
// capture publiée.
await taper(SUR_WINDOWS ? 'Get-ChildItem -Name src\\facturation' : 'ls src/facturation')
await capturer('claudex')
const ongletShell = page.getByRole('button', { name: 'Terminal', exact: true }).last()

// ── 2. Les conversations, et leurs états ─────────────────────────────────────
await ligne('Migration du schéma').getByRole('button').first().click({ button: 'right' })
await page.getByRole('menuitem', { name: 'Mettre en favori' }).click()
await pause(300)
await ligne('Taux de TVA par pays').getByRole('button').first().click({ button: 'right' })
await page.getByRole('menuitem', { name: 'Étiqueter' }).click()
await page.getByLabel('Étiquette de la conversation').fill('urgent')
await page.getByLabel('Étiquette de la conversation').press('Enter')
await pause(400)
await colonne.getByText('Erreur de capture réseau').click()
await pause(1800)
await capturer('conversations', COLONNES)

// ── 3. Le menu d'une conversation ────────────────────────────────────────────
// Une ligne haute dans la liste : le menu s'ouvre sous le clic, il lui faut de
// la place en dessous pour tenir entier.
// Le clic est porté vers le bord gauche de la ligne : le menu s'ouvre sous le
// curseur, et de là il tient dans la colonne.
await ligne('Refonte de la facturation')
  .getByRole('button')
  .first()
  .click({ button: 'right', position: { x: 18, y: 16 } })
await pause(400)
await capturer('menu', { x: 0, y: 0, width: 490, height: 480 })
await page.keyboard.press('Escape')
await pause(300)

// ── 4. Bifurquer ─────────────────────────────────────────────────────────────
await ligne('Refonte de la facturation').hover()
await ligne('Refonte de la facturation').getByTitle(/Bifurquer/).click()
await page.getByLabel('Nom de la branche').fill('sans le cache')
await pause(400)
await capturer('bifurcation', { x: 0, y: 0, width: 1280, height: 560 })
await page.getByRole('button', { name: 'Annuler' }).click()
await pause(300)

// ── 5. Groupes et rangement ──────────────────────────────────────────────────
await colonne.getByLabel('Nouveau groupe').click()
const nom = page.getByLabel('Nom du groupe')
await nom.fill('Facturation')
await nom.press('Enter')
await pause(300)
for (const titre of ['Refonte de la facturation', 'Taux de TVA par pays']) {
  await ligne(titre).dragTo(page.getByRole('button', { name: 'Facturation', exact: true }))
  await pause(300)
}
await capturer('groupes', COLONNES)

// ── 6. Un agent qui réclame son utilisateur ──────────────────────────────────
// On repasse sur le terminal ordinaire : le voyant ne s'allume que pour une
// conversation qu'on n'a pas sous les yeux.
await ongletShell.click()
await pause(800)
const evenements = join(hooks, 'evenements')
await mkdir(evenements, { recursive: true })
const provisoire = join(hooks, 'evt')
await writeFile(
  provisoire,
  `Notification\n${JSON.stringify({
    session_id: uuids[3],
    message: 'Claude needs your permission to use Bash'
  })}\n`
)
await rename(provisoire, join(evenements, 'evt.json'))
await pause(1000)
await capturer('attente', { x: 0, y: 0, width: 780, height: 470 })

// ── 7. Les fichiers, et l'aperçu ─────────────────────────────────────────────
await page.getByLabel('Fichiers', { exact: true }).click()
await pause(700)
for (const dossierAOuvrir of ['src', 'facturation']) {
  const cible = colonne.getByText(dossierAOuvrir, { exact: true }).first()
  if (await cible.isVisible().catch(() => false)) {
    await cible.click()
    await pause(600)
  }
}
await capturer('fichiers', { x: 0, y: 0, width: 1280, height: 470 })
const fichier = colonne.getByText('facture.ts', { exact: true }).first()
if (await fichier.isVisible().catch(() => false)) {
  await fichier.click()
  await pause(1500)
  await capturer('apercu', { x: 0, y: 0, width: 1280, height: 430 })
  await page.keyboard.press('Escape')
  await pause(400)
}

// ── 8. L'écran d'état ────────────────────────────────────────────────────────
await page.getByLabel("État de l'environnement").click()
await pause(700)
await capturer('etat', { x: 0, y: 0, width: 1280, height: 640 })

await app.close()
await rm(dossier, { recursive: true, force: true })
await rm(profil, { recursive: true, force: true })
await rm(projet, { recursive: true, force: true })
// Le serveur tmux du décor n'existe que là où il y a un tmux : ailleurs, les
// sessions sont mortes avec l'application qu'on vient de fermer.
if (!SUR_WINDOWS) execFileSync('tmux', ['-L', 'claudex-vitrine', 'kill-server'], { stdio: 'ignore' })
