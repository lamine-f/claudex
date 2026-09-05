import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { fermer, glisser, lancer, nouveauTerminal, type Contexte } from './fixtures'

/** Le dossier où Claude Code range les transcrits d'un projet. */
function dossierTranscrits(projet: string): string {
  return join(homedir(), '.claude', 'projects', projet.replace(/[^a-zA-Z0-9-]/g, '-'))
}

/**
 * Pose une conversation dans un projet, comme l'aurait fait Claude Code.
 *
 * Elle est écrite avant le lancement : le veilleur ignore ce qui est déjà là,
 * si bien que seule une lecture du dossier peut la faire apparaître.
 */
async function semer(projet: string, titre: string): Promise<void> {
  const dossier = dossierTranscrits(projet)
  await mkdir(dossier, { recursive: true })
  await writeFile(
    join(dossier, 'aaaaaaaa-1111-1111-1111-111111111111.jsonl'),
    `${JSON.stringify({ type: 'ai-title', aiTitle: titre })}\n`
  )
}

/** Les onglets de terminal, qui portent tous le même nom faute d'être nommés. */
const onglets = (page: Page): Locator => page.getByRole('button', { name: 'Terminal', exact: true })

/** Le rail des projets, et la ligne d'un projet donné. */
const rail = (page: Page): Locator => page.getByLabel('Projets')
const projet = (page: Page, nom: string): Locator => rail(page).locator('li', { hasText: nom })

/** L'ordre des projets tel qu'il est affiché, lu sur leur hauteur à l'écran. */
async function ordre(page: Page, ...noms: string[]): Promise<string[]> {
  const hauteurs = await Promise.all(
    noms.map(async (nom) => {
      const cadre = await projet(page, nom).boundingBox()
      if (!cadre) throw new Error(`« ${nom} » n'est pas à l'écran`)
      return [nom, cadre.y] as const
    })
  )
  return hauteurs.sort((a, b) => a[1] - b[1]).map(([nom]) => nom)
}

/**
 * Un profil déjà peuplé de deux projets.
 *
 * Le dialogue natif d'ajout de dossier n'est pas pilotable : c'est le seul
 * raccourci pris, comme dans `lancer`.
 */
async function profil(): Promise<{ donnees: string; alpha: string; beta: string }> {
  const donnees = await mkdtemp(join(tmpdir(), 'claudex-e2e-'))
  const alpha = await mkdtemp(join(tmpdir(), 'claudex-alpha-'))
  const beta = await mkdtemp(join(tmpdir(), 'claudex-beta-'))
  // Beta n'est pas le projet ouvert au démarrage : sa conversation ne peut
  // apparaître que si l'on va la chercher en arrivant dessus.
  await semer(beta, 'Facture Beta')
  await writeFile(
    join(donnees, 'state.json'),
    JSON.stringify({
      workspaces: [
        { id: 'ws1', path: alpha, name: 'Alpha', color: '#e8825a', order: 0, expanded: true },
        { id: 'ws2', path: beta, name: 'Beta', color: '#5aa9e8', order: 1, expanded: true }
      ],
      tabs: [],
      layout: { leftWidth: 260, middleWidth: 300 },
      activeWorkspaceId: 'ws1'
    })
  )
  return { donnees, alpha, beta }
}

test.describe('les projets du rail', () => {
  let ctx: Contexte
  let beta: string

  test.beforeAll(async () => {
    const prepare = await profil()
    beta = prepare.beta
    ctx = await lancer({ donnees: prepare.donnees, projet: prepare.alpha })
  })

  test.afterAll(async () => {
    await fermer(ctx)
    await rm(beta, { recursive: true, force: true })
    await rm(dossierTranscrits(beta), { recursive: true, force: true })
  })

  test('arriver sur un projet en lit les conversations', async () => {
    const { page } = ctx
    await projet(page, 'Beta').click()
    // Sans un clic sur la synchronisation : la colonne doit être utile en
    // arrivant, pas après qu'on a pensé à la remplir.
    await expect(page.getByRole('button', { name: 'Facture Beta' })).toBeVisible()
    await projet(page, 'Alpha').click()
  })

  test('le compteur d’onglets vaut pour tous les projets, pas seulement l’ouvert', async () => {
    const { page } = ctx
    await nouveauTerminal(page)
    await nouveauTerminal(page)
    await expect(onglets(page)).toHaveCount(2)

    await projet(page, 'Beta').click()
    await nouveauTerminal(page)
    await expect(onglets(page)).toHaveCount(1)

    // Alpha n'est plus le projet ouvert, et ses deux terminaux doivent pourtant
    // se compter : c'est ce qui évite d'en rouvrir un là où trois attendent.
    await expect(projet(page, 'Alpha')).toContainText('2')
    await expect(projet(page, 'Beta')).toContainText('1')

    // La couleur pleine reste au projet qu'on regarde. Ailleurs le compteur se
    // tait : dix pastilles vives réclameraient l'œil toutes ensemble.
    const compteur = (nom: string, compte: string): Locator =>
      projet(page, nom).locator('span.rounded-full').filter({ hasText: compte })
    await expect(compteur('Beta', '1')).toHaveCSS('background-color', 'rgb(90, 169, 232)')
    await expect(compteur('Alpha', '2')).not.toHaveCSS('background-color', 'rgb(232, 130, 90)')
  })

  test('revenir sur un projet rouvre l’onglet qu’on y regardait', async () => {
    const { page } = ctx
    await projet(page, 'Alpha').click()
    await expect(onglets(page)).toHaveCount(2)

    // On se pose sur le premier des deux, qui n'est pas celui que la barre
    // rouvrirait d'elle-même.
    await onglets(page).first().click()
    await expect(onglets(page).first()).toHaveAttribute('aria-current', 'true')

    await projet(page, 'Beta').click()
    await expect(onglets(page)).toHaveCount(1)

    await projet(page, 'Alpha').click()
    await expect(onglets(page)).toHaveCount(2)
    // L'ordre de la barre ne bouge pas, et c'est bien le premier onglet qui
    // revient devant : le dernier de la barre était le piège.
    await expect(onglets(page).first()).toHaveAttribute('aria-current', 'true')
  })

  test('l’ordre des projets se change à la souris et se retient', async () => {
    const { page } = ctx
    expect(await ordre(page, 'Alpha', 'Beta')).toEqual(['Alpha', 'Beta'])

    await glisser(page, projet(page, 'Beta'), projet(page, 'Alpha'), { x: 60, y: 4 })
    await expect.poll(async () => ordre(page, 'Alpha', 'Beta')).toEqual(['Beta', 'Alpha'])

    // Un ordre qui ne survit pas à la fermeture ne sert à rien.
    await fermer(ctx, { nettoyer: false })
    ctx = await lancer({ donnees: ctx.donnees, projet: ctx.projet })
    expect(await ordre(ctx.page, 'Alpha', 'Beta')).toEqual(['Beta', 'Alpha'])
  })

  test('retirer un projet le fait sortir de la liste et ferme ses terminaux', async () => {
    const { page } = ctx
    await projet(page, 'Beta').click()
    await expect(onglets(page)).toHaveCount(1)

    await projet(page, 'Beta').click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Retirer le projet…' }).click()

    const dialogue = page.getByRole('dialog', { name: 'Retirer le projet' })
    await expect(dialogue).toContainText('Son terminal ouvert sera fermé')
    await dialogue.getByRole('button', { name: 'Retirer' }).click()

    await expect(projet(page, 'Beta')).toHaveCount(0)
    // Le projet retiré emportait l'écran : l'autre prend sa place avec ses
    // onglets, plutôt qu'une colonne vide.
    await expect(onglets(page)).toHaveCount(2)
    await expect(projet(page, 'Alpha')).toContainText('2')
  })
})
