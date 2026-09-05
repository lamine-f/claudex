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
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rename,
  rm,
  writeFile
} from 'node:fs/promises'
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

/*
 * Le serveur tmux du socket de démonstration est abattu avant toute chose.
 *
 * Deux raisons. Un pane hérite de l'environnement du serveur et non de celui du
 * client : un serveur laissé par une prise précédente rendrait l'invite du
 * système malgré ZDOTDIR. Et surtout, les agents de la prise précédente y vivent
 * encore, l'application fermée ne les ayant que détachés. L'un d'eux réécrivait
 * son transcrit après le nettoyage, et la démonstration s'ouvrait sur une
 * conversation qui n'avait pas eu lieu.
 */
await run('tmux', ['-L', 'claudex-demo', 'kill-server']).catch(() => undefined)
// Un agent abattu écrit son transcrit en s'arrêtant : le nettoyage qui suit
// passerait avant, et le fichier reviendrait derrière lui.
await new Promise((suite) => setTimeout(suite, 2000))

const profil = await mkdtemp(join(tmpdir(), 'claudex-demo-'))
const videos = await mkdtemp(join(tmpdir(), 'claudex-demo-video-'))
// Les projets vivent sous un chemin fixe et court, et portent leur vrai nom :
// l'invite du terminal montre le dossier courant, et l'aperçu montre le chemin
// entier. Un dossier tiré au sort s'y étalerait sur une ligne illisible.
// `/tmp` plutôt que le dossier temporaire de l'utilisateur : sur macOS celui-ci
// est un chemin de quarante caractères qui s'étale dans l'en-tête de l'aperçu.
//
// Le chemin est résolu : sur macOS `/tmp` est un lien vers `/private/tmp`, et
// Claude Code range ses transcrits sous le chemin réel de son dossier de
// travail. Claudex, lui, encode le chemin déclaré du projet. Déclarer `/tmp`
// faisait donc chercher `-tmp-claudex-demo-boutique` là où Claude Code écrivait
// `-private-tmp-claudex-demo-boutique`, et la conversation créée n'arrivait
// jamais dans la colonne.
const racine = process.platform === 'win32' ? tmpdir() : await realpath('/tmp')
const atelier = join(racine, 'claudex-demo')
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
  // Le dossier est vidé avant d'être garni : une prise interrompue laisse ses
  // transcrits derrière elle, et la suivante s'ouvrait alors sur une
  // conversation qui n'avait pas eu lieu.
  const dossier = dossierTranscrits(chemin)
  await rm(dossier, { recursive: true, force: true })
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

/*
 * Le décor est vérifié avant la prise, non supposé.
 *
 * Un agent de la prise précédente peut avoir écrit son transcrit entre le
 * nettoyage et le semis : la démonstration s'ouvrait alors sur une conversation
 * qui n'avait pas eu lieu, et le premier écran du dépôt montrait un décor faux.
 */
for (const [rang, p] of DECOR.entries()) {
  const dossier = dossierTranscrits(projets[rang].path)
  const attendus = new Set(
    p.conversations.map((_, i) => `${rang}${i}${'abcdef01'.slice(0, 6)}-1111-1111-1111-111111111111.jsonl`)
  )
  for (const fichier of await readdir(dossier)) {
    if (!attendus.has(fichier)) {
      await rm(join(dossier, fichier), { recursive: true, force: true })
      console.log('décor : transcrit étranger écarté ·', fichier)
    }
  }
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

// L'enregistrement commence au lancement : tous les repères de temps se
// comptent à partir d'ici, pour savoir plus tard quel segment accélérer.
const tLancement = Date.now()
const marque = () => (Date.now() - tLancement) / 1000

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
  // Deux fois la taille du travail quotidien : dans un README, le GIF est
  // affiché à moins de mille pixels, et 12,5 px n'y sont plus lisibles.
  window.__claudexPolice = 20
})
await app.evaluate(({ BrowserWindow }, taille) => {
  BrowserWindow.getAllWindows()[0]?.setSize(taille.l, taille.h)
}, { l: LARGEUR, h: HAUTEUR })
await page.reload()
await page.waitForSelector('[aria-label="Conversations"]')

const pause = (ms) => page.waitForTimeout(ms)

/**
 * Les encadrés qui désignent ce que l'on va faire.
 *
 * Ils n'appartiennent pas à l'application : ils sont posés dans la page le temps
 * de la prise, et épousent la boîte réelle de l'élément visé. Ce qu'ils montrent
 * est donc ce qui se passe, non une reconstitution.
 *
 * Il y avait aussi un curseur dessiné. Il est retiré : une flèche animée par une
 * transition CSS n'arrive pas toujours avant le clic quand la page est occupée à
 * redessiner un terminal, et l'on voyait alors l'action se produire avant que la
 * flèche n'ait bougé. Un repère qui ment sur l'ordre des choses vaut moins que
 * pas de repère du tout.
 */
async function poserAnnotations() {
  await page.evaluate(() => {
    const style = document.createElement('style')
    style.textContent = `
      .demo-cadre {
        position: fixed; z-index: 2147483646; pointer-events: none;
        border: 2px solid #ff4d4d; border-radius: 8px;
        box-shadow: 0 0 0 3px rgba(255,77,77,.18);
      }
    `
    document.head.append(style)
    window.__demoCadre = (cadre) => {
      document.querySelectorAll('.demo-cadre').forEach((n) => n.remove())
      if (!cadre) return
      const boite = document.createElement('div')
      boite.className = 'demo-cadre'
      Object.assign(boite.style, {
        left: `${cadre.x - 3}px`,
        top: `${cadre.y - 3}px`,
        width: `${cadre.width + 6}px`,
        height: `${cadre.height + 6}px`
      })
      document.body.append(boite)
    }
  })
}

/** Encadre une cible, laisse le temps de la voir, puis clique dessus. */
async function cliquer(cible, options = {}) {
  const cadre = await cible.boundingBox()
  if (!cadre) throw new Error("la cible n'est pas à l'écran")
  const x = cadre.x + (options.dx ?? cadre.width / 2)
  const y = cadre.y + (options.dy ?? cadre.height / 2)

  await page.evaluate((c) => window.__demoCadre(c), options.sansCadre ? null : cadre)
  await pause(options.approche ?? 800)
  await page.mouse.click(x, y, { button: options.bouton ?? 'left' })
  await pause(options.apres ?? 420)
  await page.evaluate(() => window.__demoCadre(null))
}

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
await poserAnnotations()
await pause(1600)

const taper = async (rang, texte, retour = '\n') => {
  const id = (await page.evaluate(() => Object.keys(window.__claudex ?? {})))[rang]
  if (id) await page.evaluate(([i, t]) => window.claudex.term.input(i, t), [id, texte + retour])
}

// 2. Une conversation Claude Code, lancée depuis la colonne.
await cliquer(page.getByTitle('Nouvelle conversation'))
await page.waitForSelector('.xterm')

// Le rail et la colonne se replient : le terminal prend toute la largeur, et
// c'est là que tout se passe pendant que l'agent travaille.
await cliquer(page.getByTitle(/Masquer les projets/))
await cliquer(page.getByTitle(/Masquer la colonne/))

// Claude Code demande à qui ouvre un dossier neuf s'il lui fait confiance. Le
// choix mis en avant est « No, exit » : il faut descendre d'un cran avant de
// valider, sans quoi l'agent s'arrête aussitôt. La question n'est posée qu'une
// fois par dossier, on n'y répond donc que si elle apparaît.
if (await attendreTexte(0, /trust this folder/i, 10000)) {
  await pause(1200)
  await taper(0, '\x1b[B', '')
  await pause(600)
  await taper(0, '', '\r')
}
await attendreTexte(0, /Try "|\/help|bypass permissions/i, 30000)
await pause(1200)

// 3. Le plan de l'agent. C'est le cœur, et c'est aussi le plus long : ses
// bornes sont notées pour l'accélérer au montage.
const debutAgent = marque()
await taper(0, 'Ajoute un test du total du panier dans src/panier.test.ts', '\r')

// L'attente porte sur le fichier écrit, non sur ce que le terminal affiche : le
// nom du fichier figure dans la question, et le chercher à l'écran rendait la
// main avant même que l'agent n'ait commencé.
const attendu = join(projets[0].path, 'src', 'panier.test.ts')
const limite = Date.now() + 150000
while (Date.now() < limite) {
  if (await access(attendu).then(() => true, () => false)) break
  await pause(500)
}
await pause(3000)
const finAgent = marque()

// 4. On rouvre les colonnes, et l'on ferme l'onglet.
await cliquer(page.getByTitle(/Afficher la colonne/))
await cliquer(page.getByTitle(/Afficher les projets/))
await pause(600)

const croix = page.getByTitle("Fermer l'onglet et sa session")
await cliquer(croix)
await pause(1400)

// 5. La conversation est restée. On la reprend, avec son contexte.
//
// Elle se reconnaît à son titre, qui n'était pas là au départ : les
// conversations du décor, elles, ne sont que des transcrits inventés, et
// Claude Code refuserait de reprendre ce qui n'a jamais eu lieu.
const titreNeuf = await page.waitForFunction(
  (connus) => {
    const colonne = document.querySelector('[aria-label="Sessions et fichiers"]')
    const lignes = [...(colonne?.querySelectorAll('li button') ?? [])]
    const neuve = lignes.find((b) => {
      const titre = b.textContent?.split('\n')[0]?.trim()
      return titre && !connus.some((c) => titre.startsWith(c))
    })
    return neuve ? neuve.textContent.split('\n')[0].trim() : null
  },
  DECOR[0].conversations,
  { timeout: 30000 }
).then((r) => r.jsonValue())

const reprise = page
  .getByLabel('Sessions et fichiers')
  .locator('li button')
  .filter({ hasText: titreNeuf })
  .first()
await cliquer(reprise)
await page.waitForSelector('.xterm')
// Le contexte rejoué : c'est la promesse de l'application, et elle se voit.
await attendreTexte(0, /panier|test/i, 60000)
await pause(3000)

// 6. Le rail se range à la souris.
const glisser = async (source, cible) => {
  const d = await source.boundingBox()
  const a = await cible.boundingBox()
  const depart = [d.x + d.width / 2, d.y + d.height / 2]
  const arrivee = [a.x + a.width / 2, a.y + 4]

  // La ligne prise est encadrée : sans curseur, c'est elle qui dit qu'on la
  // tient. Le trait d'insertion de l'application dit ensuite où elle va.
  await page.evaluate((c) => window.__demoCadre(c), d)
  await pause(800)
  await page.mouse.move(depart[0], depart[1])
  await page.mouse.down()
  for (let pas = 1; pas <= 22; pas++) {
    await page.mouse.move(
      depart[0] + ((arrivee[0] - depart[0]) * pas) / 22,
      depart[1] + ((arrivee[1] - depart[1]) * pas) / 22
    )
    await pause(18)
  }
  await page.mouse.move(arrivee[0], arrivee[1])
  await pause(500)
  await page.mouse.up()
  await page.evaluate(() => window.__demoCadre(null))
}
await glisser(projet('infra'), projet('boutique'))
await pause(1500)

await app.close()
// Les sessions survivent à la fermeture, c'est la promesse de l'application.
// Une démonstration, elle, ne doit pas laisser d'agent derrière elle.
await run('tmux', ['-L', 'claudex-demo', 'kill-server']).catch(() => undefined)

const brut = (await readdir(videos)).find((f) => f.endsWith('.webm'))
const webm = join(videos, brut)
const gif = join(sortie, 'demo.gif')

// Palette commune à toutes les images : calculée par image, les aplats sombres
// de l'interface se mettent à grouiller d'une image à l'autre.
/*
 * Le plan de l'agent est joué à deux fois sa vitesse.
 *
 * Il dure en vrai plus d'une demi-minute, pendant laquelle les appels d'outils
 * défilent : au rythme réel, la démonstration s'étirait à cent secondes et
 * personne ne la regardait jusqu'au bout. Le reste garde sa vitesse, sans quoi
 * les gestes de souris deviennent illisibles. Rien n'est coupé, rien n'est
 * rejoué : seule l'horloge de ce segment est resserrée.
 *
 * Le facteur suit la durée réelle plutôt que d'être fixé une fois pour toutes :
 * l'agent met entre trente et cinquante secondes selon les jours, et un facteur
 * constant donnait une démonstration de quarante-cinq secondes un jour, de
 * cinquante-six le lendemain. On vise dix-huit secondes pour ce plan, sans
 * jamais descendre sous deux, où le mouvement se hache et où le fichier
 * s'alourdit, ni monter au-delà de quatre, où plus rien ne se lit.
 */
const a = Math.max(0, debutAgent - 0.8)
const b = finAgent + 0.8
const ACCELERATION = Math.min(4, Math.max(2, (b - a) / 18)).toFixed(2)
const montage =
  `[0:v]trim=0:${a.toFixed(2)},setpts=PTS-STARTPTS[avant];` +
  `[0:v]trim=${a.toFixed(2)}:${b.toFixed(2)},setpts=(PTS-STARTPTS)/${ACCELERATION}[agent];` +
  `[0:v]trim=${b.toFixed(2)},setpts=PTS-STARTPTS[apres];` +
  `[avant][agent][apres]concat=n=3:v=1:a=0[monte];` +
  // La source est enregistrée à 25 images par seconde : n'en rendre que 11
  // jetait plus de la moitié du mouvement, et le curseur avançait par bonds.
  `[monte]fps=25,scale=1000:-1:flags=lanczos,split[s0][s1];` +
  `[s0]palettegen=max_colors=128:stats_mode=diff[p];` +
  `[s1][p]paletteuse=dither=bayer:bayer_scale=4[sortie]`
await run('ffmpeg', [
  '-y', '-i', webm, '-filter_complex', montage, '-map', '[sortie]', '-loop', '0', gif
])
console.log(
  `plan de l'agent : ${(b - a).toFixed(1)} s de ${a.toFixed(1)} à ${b.toFixed(1)}, ` +
    `joué à ${ACCELERATION}×`
)

await rename(webm, join(sortie, 'demo.webm')).catch(() => undefined)
for (const dossier of aNettoyer) await rm(dossier, { recursive: true, force: true })

console.log('GIF :', gif)
