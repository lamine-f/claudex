import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Locator } from '@playwright/test'
import { fermer, lancer, NOUVEAU_TERMINAL, type Contexte } from './fixtures'

const SESSION = 'aaaaaaaa-1111-1111-1111-111111111111'

function dossierTranscrits(projet: string): string {
  return join(homedir(), '.claude', 'projects', projet.replace(/[^a-zA-Z0-9-]/g, '-'))
}

/**
 * Dépose un événement comme le fait le script appelé par Claude Code : écrit à
 * côté puis renommé, pour ne jamais donner à lire un fichier à moitié écrit.
 */
async function deposer(dossierHooks: string, evenement: string, charge: unknown): Promise<void> {
  const evenements = join(dossierHooks, 'evenements')
  await mkdir(evenements, { recursive: true })
  const temporaire = join(dossierHooks, `evt-${Date.now()}`)
  await writeFile(temporaire, `${evenement}\n${JSON.stringify(charge)}\n`)
  await rename(temporaire, join(evenements, `evt-${Date.now()}.json`))
}

test.describe('un agent qui réclame son utilisateur', () => {
  let ctx: Contexte
  let hooks: string

  test.beforeAll(async () => {
    hooks = await mkdtemp(join(tmpdir(), 'claudex-hooks-'))
    const provisoire = await lancer({ env: { CLAUDEX_HOOKS_DIR: hooks } })
    const dossier = dossierTranscrits(provisoire.projet)
    await mkdir(dossier, { recursive: true })
    await writeFile(
      join(dossier, `${SESSION}.jsonl`),
      `${JSON.stringify({ type: 'ai-title', aiTitle: 'Migration DTO' })}\n`
    )
    await fermer(provisoire, { nettoyer: false })
    ctx = await lancer({
      donnees: provisoire.donnees,
      projet: provisoire.projet,
      env: { CLAUDEX_HOOKS_DIR: hooks }
    })

    // La conversation doit être ouverte dans un onglet : Claudex ne réagit
    // qu'aux agents qu'il a sous la main, pas à tous les `claude` de la machine.
    await ctx.page.getByLabel('Sessions et fichiers').getByText('Migration DTO').click()
    await expect(ctx.page.locator('.xterm')).toHaveCount(1)

    // Puis on la laisse derrière : la question n'est utile que pour ce qu'on
    // n'a pas sous les yeux.
    await ctx.page.getByTitle(NOUVEAU_TERMINAL).click()
    await expect(ctx.page.locator('.xterm')).toHaveCount(2)
  })

  test.afterAll(async () => {
    await rm(dossierTranscrits(ctx.projet), { recursive: true, force: true })
    await rm(hooks, { recursive: true, force: true })
    await fermer(ctx)
  })

  const conversation = (): Locator =>
    ctx.page.getByLabel('Sessions et fichiers').locator('li', { hasText: 'Migration DTO' }).last()

  test('la conversation le dit dans la colonne', async () => {
    await deposer(hooks, 'Notification', {
      session_id: SESSION,
      message: 'Claude needs your permission to use Bash'
    })
    await expect(conversation().getByText('vous attend')).toBeVisible()
    // Sur la ligne du titre : c'est là que l'œil passe en parcourant la liste.
    await expect(conversation().getByLabel('Vous attend')).toBeVisible()
  })

  test("l'onglet et le projet le disent aussi", async () => {
    // Trois endroits, parce qu'on ne regarde pas toujours la colonne : l'onglet
    // pour ce qui est ouvert, le rail pour les projets qu'on a quittés.
    const onglets = ctx.page.getByRole('button', { name: 'Migration DTO' }).last()
    await expect(onglets.locator('xpath=../span[@aria-label="Vous attend"]')).toBeVisible()
    await expect(ctx.page.getByLabel('Projets').getByLabel('Un agent vous attend')).toBeVisible()
  })

  test("revenir sur l'onglet éteint le voyant", async () => {
    const onglets = ctx.page.getByRole('button', { name: 'Migration DTO' })
    await onglets.last().click()
    await expect(conversation().getByText('à l’écran')).toBeVisible()

    // Reparti ailleurs, le voyant ne doit pas se rallumer : la demande a été
    // vue, elle ne se repose pas.
    await ctx.page.getByRole('button', { name: 'Terminal', exact: true }).last().click()
    await expect(conversation().getByText('vous attend')).toHaveCount(0)
  })

  test('une réponse donnée dans le terminal éteint aussi le voyant', async () => {
    await deposer(hooks, 'Notification', { session_id: SESSION, message: 'waiting for input' })
    await expect(conversation().getByText('vous attend')).toBeVisible()

    // `Stop` dit que l'agent a rendu la main : il n'attend plus rien.
    await deposer(hooks, 'Stop', { session_id: SESSION })
    await expect(conversation().getByText('vous attend')).toHaveCount(0)
  })

  test('ouvrir la conversation depuis la colonne éteint le voyant', async () => {
    // Le cas rencontré : on clique la conversation dans la colonne, l'onglet
    // s'ouvre, et le voyant restait allumé devant ce qu'on était en train de
    // lire. Il ne s'éteignait qu'en cliquant l'onglet en haut.
    await ctx.page.getByRole('button', { name: 'Terminal', exact: true }).last().click()
    await deposer(hooks, 'Notification', { session_id: SESSION, message: 'needs permission' })
    await expect(conversation().getByText('vous attend')).toBeVisible()

    await ctx.page
      .getByLabel('Sessions et fichiers')
      .getByText('Migration DTO')
      .click()
    await expect(conversation().getByText('à l’écran')).toBeVisible()

    await ctx.page.getByRole('button', { name: 'Terminal', exact: true }).last().click()
    await expect(conversation().getByText('vous attend')).toHaveCount(0)
  })

  test('une conversation inconnue de Claudex est ignorée', async () => {
    await deposer(hooks, 'Notification', { session_id: 'inconnue-9999', message: 'coucou' })
    // Rien ne doit apparaître : le hook est posé pour toute la machine, et
    // Claudex n'a pas à parler des terminaux dont il ne sait rien.
    await expect(ctx.page.getByText('vous attend')).toHaveCount(0)
  })

  test("l'attente survit à un redémarrage de Claudex", async () => {
    await deposer(hooks, 'Notification', { session_id: SESSION, message: 'needs permission' })
    await expect(conversation().getByText('vous attend')).toBeVisible()

    await fermer(ctx, { nettoyer: false })
    ctx = await lancer({
      donnees: ctx.donnees,
      projet: ctx.projet,
      env: { CLAUDEX_HOOKS_DIR: hooks }
    })
    // L'agent est toujours bloqué dans sa session tmux : le voyant doit se
    // retrouver allumé, sinon la demande se perd avec la fenêtre.
    await expect(conversation().getByText('vous attend')).toBeVisible()
  })

  test("une demande dont l'onglet a disparu est oubliée", async () => {
    // Le cas rencontré : l'onglet n'était plus là, mais le voyant restait
    // allumé au démarrage. Sans onglet, l'agent est parti avec sa session
    // tmux : plus personne ne peut répondre, et rien ne l'éteindrait jamais.
    await deposer(hooks, 'Notification', { session_id: SESSION, message: 'needs permission' })
    await expect(conversation().getByText('vous attend')).toBeVisible()

    await fermer(ctx, { nettoyer: false })
    const etat = join(ctx.donnees, 'state.json')
    const contenu = JSON.parse(await readFile(etat, 'utf8'))
    contenu.tabs = contenu.tabs.filter((t: { claudeSessionId?: string }) => t.claudeSessionId !== SESSION)
    await writeFile(etat, JSON.stringify(contenu))

    ctx = await lancer({
      donnees: ctx.donnees,
      projet: ctx.projet,
      env: { CLAUDEX_HOOKS_DIR: hooks }
    })
    await expect(conversation()).toBeVisible()
    await expect(ctx.page.getByText('vous attend')).toHaveCount(0)
  })
})
