import { execFile } from 'node:child_process'
import { access, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test'
import { raccourci } from '../src/shared/raccourcis'

const run = promisify(execFile)

/** Serveur tmux réservé aux tests, distinct de celui de l'application. */
export const SOCKET_TEST = 'claudex-test'

export const SUR_WINDOWS = process.platform === 'win32'

/**
 * Les titres par lesquels les tests désignent les boutons.
 *
 * Ils portent le raccourci du système : les écrire en dur revenait à faire passer
 * la suite sur macOS et échouer partout ailleurs, sur un bouton pourtant présent.
 */
export const NOUVEAU_TERMINAL = `Nouveau terminal (${raccourci(process.platform, 'T')})`
export const FERMER_ONGLET = "Fermer l'onglet et sa session"

/**
 * Session qui ne sert qu'à tenir le serveur tmux debout.
 *
 * tmux arrête son serveur dès qu'il n'a plus une seule session, et le démarrage
 * du serveur doit rester le fait des tests, jamais de l'application.
 *
 * Un serveur lancé depuis Electron hérite en effet de ses descripteurs de
 * fichiers, caches de Chromium et tuyaux de sortie compris, et les garde ouverts
 * bien après la fermeture de l'application, puisqu'il lui survit. Playwright
 * attend la fin de ces flux pour rendre la main sur `app.close()` : il l'attend
 * alors pour toujours. Le défaut vaut hors des tests et reste à corriger côté
 * application ; le reproduire ici ne mettrait à l'épreuve que lui.
 *
 * Sans objet sur Windows, où aucun serveur ne se tient derrière les terminaux.
 */
const SENTINELLE = 'claudex_sentinelle'

/** Démarre le serveur tmux des tests, s'il ne tourne pas déjà. */
export async function assurerServeurTmux(): Promise<void> {
  if (SUR_WINDOWS) return
  await run('tmux', ['-L', SOCKET_TEST, 'has-session', '-t', `=${SENTINELLE}`]).catch(() =>
    run('tmux', ['-L', SOCKET_TEST, 'new-session', '-d', '-s', SENTINELLE]).catch(() => undefined)
  )
}

/**
 * Rejoue la disparition du multiplexeur, comme après un redémarrage de machine.
 *
 * Le serveur est tué puis remis debout vide. Pour l'application les deux états
 * se valent : aucune de ses sessions ne subsiste, et elle les recrée toutes.
 *
 * Sur Windows il n'y a rien à faire. Les sessions sont mortes avec l'application
 * qu'on vient de fermer, et c'est justement ce que ce geste vaut de dire.
 */
export async function simulerRedemarrage(): Promise<void> {
  if (SUR_WINDOWS) return
  await run('tmux', ['-L', SOCKET_TEST, 'kill-server']).catch(() => undefined)
  await assurerServeurTmux()
}

/** Ouvre un terminal depuis l'en-tête, comme le ferait l'utilisateur. */
export async function nouveauTerminal(page: Page): Promise<void> {
  await page.getByTitle(NOUVEAU_TERMINAL).click()
}

/**
 * Ce qui a été joué au lancement de chaque session.
 *
 * L'amorce fait partie de la création de la session — elle n'est pas tapée dans le
 * terminal — et c'est donc le multiplexeur, non l'écran, qui en porte la trace :
 * tmux dans la propriété de son pane, ConPTY dans le script qu'il dépose.
 */
export async function commandesDeDepart(donnees: string): Promise<string[]> {
  if (SUR_WINDOWS) {
    const dossier = join(donnees, 'amorces')
    const fichiers = await readdir(dossier).catch(() => [])
    return Promise.all(
      fichiers
        .filter((f) => f.endsWith('.ps1'))
        .map((f) => readFile(join(dossier, f), 'utf8'))
    )
  }
  try {
    const { stdout } = await run('tmux', [
      '-L',
      SOCKET_TEST,
      'list-panes',
      '-a',
      '-F',
      '#{pane_start_command}'
    ])
    return stdout.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

export interface Contexte {
  app: ElectronApplication
  page: Page
  /** Dossier userData isolé : les tests n'écrivent jamais dans l'état réel. */
  donnees: string
  projet: string
}

/**
 * Lance Claudex sur un profil jetable, avec un workspace déjà déclaré.
 *
 * Le dialogue natif d'ajout de dossier n'étant pas pilotable, l'état initial est
 * écrit directement — c'est le seul raccourci pris, tout le reste passe par
 * l'interface réelle.
 */
export async function lancer(
  options: { donnees?: string; projet?: string; env?: Record<string, string> } = {}
): Promise<Contexte> {
  const donnees = options.donnees ?? (await mkdtemp(join(tmpdir(), 'claudex-e2e-')))
  const projet = options.projet ?? (await mkdtemp(join(tmpdir(), 'claudex-projet-')))

  // Un profil déjà peuplé est repris tel quel : c'est ce qui permet de vérifier
  // qu'une relance retrouve les onglets de la session précédente.
  const etat = join(donnees, 'state.json')
  const dejaInitialise = await access(etat).then(
    () => true,
    () => false
  )
  if (!dejaInitialise) {
    await writeFile(
      etat,
      JSON.stringify({
        workspaces: [
          {
            id: 'ws1',
            path: projet,
            name: 'Projet test',
            color: '#e8825a',
            order: 0,
            expanded: true
          }
        ],
        tabs: [],
        layout: { leftWidth: 260, middleWidth: 300 },
        activeWorkspaceId: 'ws1'
      })
    )
  }

  await assurerServeurTmux()

  const app = await electron.launch({
    args: [resolve('out/main/index.js'), `--user-data-dir=${donnees}`],
    // Socket tmux propre aux tests : sans lui, un `kill-server` de la suite
    // emporterait les sessions de l'application ouverte à côté.
    env: { ...process.env, NODE_ENV: 'test', CLAUDEX_TMUX_SOCKET: SOCKET_TEST, ...options.env }
  })

  const page = await app.firstWindow()
  await page.waitForSelector('[aria-label="Conversations"]')

  // L'écran d'état s'ouvre de lui-même devant une perte en cours, et la rétention
  // par défaut de Claude Code en est une. Il lit le vrai ~/.claude/settings.json,
  // que rien n'isole : la suite passait donc sur une machine dont la rétention
  // avait déjà été relevée, et échouait ailleurs sur un voile qui interceptait
  // chaque clic. On le referme comme le ferait l'utilisateur, plutôt que de
  // dépendre de la configuration personnelle de qui lance les tests.
  await fermerEcranEtat(page)

  return { app, page, donnees, projet }
}

/**
 * Referme l'écran d'état s'il s'est ouvert de lui-même.
 *
 * Il le fait devant une perte en cours, et la rétention par défaut de Claude Code
 * en est une. Il lit le vrai ~/.claude/settings.json, que rien n'isole : la suite
 * ne passait donc que sur une machine dont la rétention avait déjà été relevée, et
 * échouait ailleurs sur un voile qui interceptait chaque clic. On le referme comme
 * le ferait l'utilisateur, plutôt que de dépendre de la configuration personnelle
 * de qui lance les tests.
 */
export async function fermerEcranEtat(page: Page): Promise<void> {
  const ecran = page.getByRole('heading', { name: "État de l'environnement" })
  if (!(await ecran.isVisible().catch(() => false))) return
  await page.getByRole('button', { name: '✕' }).click()
  await expect(ecran).toHaveCount(0)
}

export async function fermer(contexte: Contexte, options = { nettoyer: true }): Promise<void> {
  await contexte.app.close()
  if (options.nettoyer) {
    await rm(contexte.donnees, { recursive: true, force: true })
    await rm(contexte.projet, { recursive: true, force: true })
    // Déplier un projet fait créer son dossier de transcrits : les tests ne
    // doivent rien laisser dans le vrai ~/.claude/projects.
    await rm(
      join(homedir(), '.claude', 'projects', contexte.projet.replace(/[^a-zA-Z0-9-]/g, '-')),
      { recursive: true, force: true }
    )
  }
}

/**
 * Lit le contenu réel d'un terminal. Le rendu WebGL peint sur canvas : le DOM ne
 * contient rien, seul le tampon de xterm fait foi.
 */
export async function lireTerminaux(
  page: Page
): Promise<Array<{ onglet: string; lignes: string[] }>> {
  return page.evaluate(() => {
    const registre = (window as unknown as { __claudex?: Record<string, unknown> }).__claudex ?? {}
    return Object.entries(registre).map(([onglet, terminal]) => {
      const tampon = (terminal as { buffer: { active: { length: number; getLine(i: number): { translateToString(t: boolean): string } | undefined } } }).buffer.active
      const lignes: string[] = []
      for (let i = 0; i < tampon.length; i++) {
        const ligne = tampon.getLine(i)?.translateToString(true)?.trim()
        if (ligne) lignes.push(ligne)
      }
      return { onglet, lignes }
    })
  })
}

/** Attend que le shell d'un terminal ait affiché son invite. */
export async function attendreInvite(page: Page, index = 0): Promise<string> {
  await expect
    .poll(async () => (await lireTerminaux(page))[index]?.lignes.length ?? 0, {
      message: `le terminal ${index} n'a jamais affiché son invite`
    })
    .toBeGreaterThan(0)
  return (await lireTerminaux(page))[index]!.onglet
}

/**
 * Tape une commande dans un terminal et attend d'en voir la sortie.
 *
 * La frappe est réémise si rien ne revient : un shell qui démarre affiche son
 * invite avant d'être prêt à lire son entrée, et avale alors ce qu'on lui envoie.
 * C'est le comportement normal d'un terminal, pas un défaut de l'application —
 * mais un test ne peut pas s'y fier.
 *
 * La ligne est validée par un retour chariot, ce qu'envoie un vrai terminal et
 * ce que xterm envoie déjà. Un saut de ligne passait sur un shell POSIX, où le
 * pty traduit l'un en l'autre, mais PSReadLine ne le prend pas pour une
 * validation : un `exit` envoyé ainsi n'arrêtait rien.
 */
export async function taper(
  page: Page,
  index: number,
  commande: string,
  attendu: string
): Promise<void> {
  const onglet = await attendreInvite(page, index)
  const contenu = async (): Promise<string> =>
    (await lireTerminaux(page))[index]?.lignes.join('\n') ?? ''

  // Sans attendu, on se contente d'envoyer la commande une fois.
  if (!attendu) {
    await page.evaluate(
      ([id, texte]) => window.claudex.term.input(id!, `${texte!}\r`),
      [onglet, commande] as const
    )
    return
  }

  for (let essai = 0; essai < 5; essai++) {
    await page.evaluate(
      ([id, texte]) => window.claudex.term.input(id!, `${texte!}\r`),
      [onglet, commande] as const
    )
    const limite = Date.now() + 3000
    while (Date.now() < limite) {
      if ((await contenu()).includes(attendu)) return
      await page.waitForTimeout(100)
    }
  }

  expect(await contenu(), `« ${attendu} » n'est jamais apparu dans le terminal ${index}`).toContain(
    attendu
  )
}
