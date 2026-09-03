import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test'

/** Serveur tmux réservé aux tests, distinct de celui de l'application. */
export const SOCKET_TEST = 'claudex-test'

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
export async function lancer(options: { donnees?: string; projet?: string } = {}): Promise<Contexte> {
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

  const app = await electron.launch({
    args: [resolve('out/main/index.js'), `--user-data-dir=${donnees}`],
    // Socket tmux propre aux tests : sans lui, un `kill-server` de la suite
    // emporterait les sessions de l'application ouverte à côté.
    env: { ...process.env, NODE_ENV: 'test', CLAUDEX_TMUX_SOCKET: SOCKET_TEST }
  })

  const page = await app.firstWindow()
  await page.waitForSelector('[aria-label="Conversations"]')
  return { app, page, donnees, projet }
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
      ([id, texte]) => window.claudex.term.input(id!, `${texte!}\n`),
      [onglet, commande] as const
    )
    return
  }

  for (let essai = 0; essai < 5; essai++) {
    await page.evaluate(
      ([id, texte]) => window.claudex.term.input(id!, `${texte!}\n`),
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
