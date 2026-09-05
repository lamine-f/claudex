/**
 * Enregistre la démonstration animée du README.
 *
 *   node scripts/demo.mjs [dossier de sortie]
 *
 * Le décor est monté de toutes pièces : trois projets dans des dossiers
 * temporaires, et des conversations écrites pour l'occasion. Aucun chemin de la
 * machine ni aucune conversation réelle ne peut donc se retrouver dans le
 * dépôt. Ce que l'on voit de Claudex, en revanche, est bien Claudex : la
 * colonne lit de vrais transcrits, le terminal est un vrai terminal.
 *
 * Le terminal tourne sous une invite neutre, posée par un ZDOTDIR jetable :
 * l'invite du shell porte le nom de l'utilisateur et celui de sa machine, et
 * une démonstration destinée à un dépôt public n'a pas à les emporter.
 *
 * La vidéo est prise par Playwright, puis réduite en GIF par ffmpeg. Une palette
 * est calculée sur l'ensemble des images plutôt que par image : sans elle, les
 * aplats sombres de l'interface se mettent à grouiller.
 */
import { execFile } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { _electron as electron } from '@playwright/test'

const run = promisify(execFile)
const sortie = resolve(process.argv[2] ?? 'docs')
await mkdir(sortie, { recursive: true })

const LARGEUR = 1200
const HAUTEUR = 780

/** Les projets du décor, avec leurs conversations. */
const DECOR = [
  {
    nom: 'boutique',
    couleur: '#e8825a',
    fichiers: {
      'README.md': '# boutique\n\nLe front de la boutique.\n',
      'src/panier.ts': 'export function total(lignes: Ligne[]): number {\n  return lignes.reduce((somme, l) => somme + l.prix * l.quantite, 0)\n}\n',
      'src/produit.ts': 'export interface Produit {\n  id: string\n  nom: string\n  prix: number\n}\n',
      'src/api/client.ts': 'export const client = { base: "/api" }\n'
    },
    // Le logo de Claudex sert d'image au projet : l'aperçu doit montrer une
    // vraie image, et celle-là appartient déjà au dépôt.
    images: { 'logo.png': 'docs/logo.png' },
    conversations: ['Refonte du panier', 'Migration des DTO', 'Erreur 500 au paiement', 'Cache des produits']
  },
  {
    nom: 'facturation',
    couleur: '#5aa9e8',
    fichiers: { 'README.md': '# facturation\n' },
    conversations: ['Relances automatiques', 'Export comptable']
  },
  {
    nom: 'infra',
    couleur: '#7ec96f',
    fichiers: { 'README.md': '# infra\n' },
    conversations: ['Bascule Postgres 17']
  }
]

/** Le dossier où Claude Code range les transcrits d'un projet. */
const dossierTranscrits = (chemin) =>
  join(process.env.HOME, '.claude', 'projects', chemin.replace(/[^a-zA-Z0-9-]/g, '-'))

const profil = await mkdtemp(join(tmpdir(), 'claudex-demo-'))
const videos = await mkdtemp(join(tmpdir(), 'claudex-demo-video-'))
// Les projets vivent sous un chemin fixe et court, et portent leur vrai nom :
// l'invite du terminal montre le dossier courant, et l'aperçu montre le chemin
// entier. Un dossier tiré au sort s'y étalerait sur une ligne illisible.
// `/tmp` plutôt que le dossier temporaire de l'utilisateur : sur macOS celui-ci
// est un chemin de quarante caractères qui s'étale dans l'en-tête de l'aperçu.
const atelier = process.platform === 'win32' ? join(tmpdir(), 'claudex-demo') : '/tmp/claudex-demo'
await rm(atelier, { recursive: true, force: true })
await mkdir(atelier, { recursive: true })
const zdotdir = join(atelier, '.shell')
await mkdir(zdotdir, { recursive: true })
await writeFile(join(zdotdir, '.zshrc'), "PROMPT='%F{6}%1~%f %F{242}❯%f '\nunset ZDOTDIR\n")

const aNettoyer = [profil, videos, atelier]

const projets = []
for (const [rang, p] of DECOR.entries()) {
  const chemin = join(atelier, p.nom)
  await mkdir(chemin, { recursive: true })
  aNettoyer.push(dossierTranscrits(chemin))

  for (const [nom, contenu] of Object.entries(p.fichiers)) {
    const cible = join(chemin, nom)
    await mkdir(join(cible, '..'), { recursive: true })
    await writeFile(cible, contenu)
  }
  for (const [nom, source] of Object.entries(p.images ?? {})) {
    await copyFile(resolve(source), join(chemin, nom))
  }

  // Les conversations, de la plus ancienne à la plus récente.
  const dossier = dossierTranscrits(chemin)
  await mkdir(dossier, { recursive: true })
  for (const [i, titre] of p.conversations.entries()) {
    const uuid = `${String(rang)}${String(i)}${'abcdef01'.slice(0, 6)}-1111-1111-1111-111111111111`
    await writeFile(
      join(dossier, `${uuid}.jsonl`),
      `${JSON.stringify({ type: 'ai-title', aiTitle: titre })}\n` +
        `${JSON.stringify({ type: 'user', timestamp: new Date().toISOString(), gitBranch: 'main' })}\n`
    )
  }

  projets.push({
    id: `ws-${rang}`,
    path: chemin,
    name: p.nom,
    color: p.couleur,
    order: rang,
    expanded: rang === 0
  })
}

await writeFile(
  join(profil, 'state.json'),
  JSON.stringify({
    workspaces: projets,
    tabs: [],
    layout: { leftWidth: 260, middleWidth: 320 },
    activeWorkspaceId: projets[0].id
  })
)

// Le serveur du socket de démonstration est abattu d'abord : un pane hérite de
// l'environnement du serveur, non de celui du client, et un serveur laissé par
// une prise précédente rendrait l'invite du système malgré ZDOTDIR.
await run('tmux', ['-L', 'claudex-demo', 'kill-server']).catch(() => undefined)

const app = await electron.launch({
  args: [resolve('out/main/index.js'), `--user-data-dir=${profil}`],
  // Serveur tmux distinct : la démonstration ne touche pas aux sessions ouvertes.
  env: { ...process.env, CLAUDEX_TMUX_SOCKET: 'claudex-demo', ZDOTDIR: zdotdir },
  recordVideo: { dir: videos, size: { width: LARGEUR, height: HAUTEUR } }
})

const page = await app.firstWindow()
// Un canvas WebGL ne s'enregistre pas : sans cela le terminal ressort vide.
await page.addInitScript(() => {
  window.__claudexSansWebgl = true
})
await app.evaluate(({ BrowserWindow }, taille) => {
  BrowserWindow.getAllWindows()[0]?.setSize(taille.l, taille.h)
}, { l: LARGEUR, h: HAUTEUR })
await page.reload()
await page.waitForSelector('[aria-label="Conversations"]')

const pause = (ms) => page.waitForTimeout(ms)

/** Ce qu'affiche un terminal. Le rendu WebGL est écarté, le tampon fait foi. */
const lireTerminal = (rang) =>
  page.evaluate((r) => {
    const terminal = Object.values(window.__claudex ?? {})[r]
    if (!terminal) return ''
    const tampon = terminal.buffer.active
    const lignes = []
    for (let i = 0; i < tampon.length; i++) {
      const ligne = tampon.getLine(i)?.translateToString(true)?.trimEnd()
      if (ligne) lignes.push(ligne)
    }
    return lignes.join('\n')
  }, rang)

/** Attend qu'un terminal affiche ce qu'on cherche, ou rend la main. */
const attendreTexte = async (rang, motif, limite = 30000) => {
  const fin = Date.now() + limite
  while (Date.now() < fin) {
    if (motif.test(await lireTerminal(rang))) return true
    await pause(300)
  }
  return false
}
const projet = (nom) => page.getByLabel('Projets').locator('li', { hasText: nom })

// L'écran d'état s'ouvre de lui-même devant la rétention par défaut de Claude
// Code : il n'a rien à faire dans une démonstration.
await pause(1200)
if (await page.getByText("État de l'environnement").isVisible().catch(() => false)) {
  await page.getByRole('button', { name: '✕' }).first().click().catch(() => undefined)
}
await pause(1400)

// 1. Les conversations du projet, lues sur le disque.
await page.getByLabel('Sessions et fichiers').getByText('Migration des DTO').hover()
await pause(1200)

// 2. Changer de projet : la colonne se remplit sans qu'on demande rien.
await projet('facturation').click()
await pause(1400)
await projet('boutique').click()
await pause(1400)

const taper = async (rang, texte, retour = '\n') => {
  const id = (await page.evaluate(() => Object.keys(window.__claudex ?? {})))[rang]
  if (id) await page.evaluate(([i, t]) => window.claudex.term.input(i, t), [id, texte + retour])
}

// 3. Une vraie conversation Claude Code, lancée depuis la colonne.
await page.getByTitle('Nouvelle conversation').click()
await page.waitForSelector('.xterm')

// Claude Code demande à qui ouvre un dossier neuf s'il lui fait confiance. Le
// choix mis en avant est « No, exit » : il faut descendre d'un cran avant de
// valider, sans quoi l'agent s'arrête aussitôt. La question n'est posée qu'une
// fois par dossier, on n'y répond donc que si elle apparaît.
if (await attendreTexte(0, /trust this folder/i, 10000)) {
  await pause(1500)
  await taper(0, '\x1b[B', '')
  await pause(700)
  await taper(0, '', '\r')
}
await attendreTexte(0, /Try "|\/help|bypass permissions/i, 30000)
await pause(1800)

await taper(0, 'En une phrase, que calcule src/panier.ts ?', '\r')
// La réponse arrive en flux : on la laisse s'écrire, puis se poser.
await attendreTexte(0, /somme|total des|prix/i, 60000)
await pause(3000)

// 4. Un second terminal, et le compteur du rail qui les suit.
await page.getByTitle(/^Nouveau terminal/).click()
await pause(1800)
await taper(1, 'ls src && cat src/panier.ts')
await pause(2400)

// 4. Contrôle+Tab circule entre les onglets.
await page.keyboard.press('Control+Tab')
await pause(1800)
await page.keyboard.press('Control+Tab')
await pause(1200)

// 5. Le rail se range à la souris.
const glisser = async (source, cible) => {
  const d = await source.boundingBox()
  const a = await cible.boundingBox()
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + a.width / 2, a.y + 4, { steps: 22 })
  await page.mouse.move(a.x + a.width / 2, a.y + 4)
  await pause(500)
  await page.mouse.up()
}
await glisser(projet('infra'), projet('boutique'))
await pause(1500)

// 6. L'arborescence, son menu, et un aperçu.
await page.getByRole('button', { name: 'Fichiers', exact: true }).click()
await pause(1000)
await page.getByLabel('Arborescence').getByText('src', { exact: true }).click()
await pause(1200)
await page.getByLabel('Arborescence').getByText('logo.png').click()
await pause(2800)
await page.keyboard.press('Escape')
await pause(1000)

await app.close()

const brut = (await readdir(videos)).find((f) => f.endsWith('.webm'))
const webm = join(videos, brut)
const gif = join(sortie, 'demo.gif')

// Palette commune à toutes les images : calculée par image, les aplats sombres
// de l'interface se mettent à grouiller d'une image à l'autre.
const filtre =
  'fps=11,scale=900:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=160:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4'
await run('ffmpeg', ['-y', '-i', webm, '-vf', filtre, '-loop', '0', gif])

await rename(webm, join(sortie, 'demo.webm')).catch(() => undefined)
for (const dossier of aNettoyer) await rm(dossier, { recursive: true, force: true })

console.log('GIF :', gif)
