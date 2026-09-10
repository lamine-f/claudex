import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Locator } from '@playwright/test'
import { fermer, lancer, type Contexte } from './fixtures'

/** Violet : franchement distinct du terracotta, donc impossible à confondre. */
const VIOLET = '#c98fe0'
const VIOLET_RGB = 'rgb(201, 143, 224)'

function dossierTranscrits(projet: string): string {
  return join(homedir(), '.claude', 'projects', projet.replace(/[^a-zA-Z0-9-]/g, '-'))
}

/**
 * La couleur d'un projet ne vaut que si elle le suit partout.
 *
 * Le rail donnait sa teinte au projet, mais les conversations et les onglets
 * gardaient l'accent de l'application : sur un projet violet, la conversation
 * à l'écran restait orange, et rien ne rattachait plus l'onglet à son projet.
 */
test.describe("la couleur du projet traverse l'application", () => {
  let ctx: Contexte

  test.beforeAll(async () => {
    const donnees = await mkdtemp(join(tmpdir(), 'claudex-e2e-'))
    const projet = await mkdtemp(join(tmpdir(), 'claudex-projet-'))

    // Un projet violet, écrit avant le lancement : la palette d'accents est
    // attribuée en rotation, on ne peut pas la choisir depuis l'interface.
    await writeFile(
      join(donnees, 'state.json'),
      JSON.stringify({
        workspaces: [
          { id: 'ws1', path: projet, name: 'Projet violet', color: VIOLET, order: 0, expanded: true }
        ],
        tabs: [],
        layout: { leftWidth: 260, middleWidth: 300 },
        activeWorkspaceId: 'ws1'
      })
    )

    const dossier = dossierTranscrits(projet)
    await mkdir(dossier, { recursive: true })
    await writeFile(
      join(dossier, 'aaaaaaaa-1111-1111-1111-111111111111.jsonl'),
      `${JSON.stringify({ type: 'ai-title', aiTitle: 'Refonte facturation' })}\n`
    )

    ctx = await lancer({ donnees, projet })
    await ctx.page.getByLabel('Sessions et fichiers').getByText('Refonte facturation').click()
    await expect(ctx.page.locator('.xterm')).toHaveCount(1)
  })

  test.afterAll(async () => {
    await rm(dossierTranscrits(ctx.projet), { recursive: true, force: true })
    await fermer(ctx)
  })

  test('le liseré de la conversation ouverte la relie à son onglet', async () => {
    // Ce liseré portait la couleur du projet, qui ne distinguait rien : toutes
    // les conversations d'un projet la partagent. Il porte maintenant la teinte
    // de l'onglet qui tient cette conversation, et l'onglet porte la même. La
    // couleur du projet garde le rail et son compteur, où elle sépare vraiment.
    const ligne = ctx.page
      .getByLabel('Sessions et fichiers')
      .locator('li', { hasText: 'Refonte facturation' })
      .locator('button')
      .first()
    const pastille = ctx.page
      .getByRole('button', { name: 'Refonte facturation' })
      .last()
      .locator('xpath=../span[@aria-hidden]')

    // Les deux portent une transition : mesurées à la volée, elles se lisent
    // au milieu du fondu et diffèrent de quelques unités. On attend qu'elles
    // se rejoignent.
    await expect
      .poll(async () => {
        const [a, b] = await Promise.all([
          ligne.evaluate((el) => getComputedStyle(el).borderLeftColor),
          pastille.evaluate((el) => getComputedStyle(el).backgroundColor)
        ])
        return a === b ? a : null
      })
      .not.toBeNull()

    // Et ce n'est plus la couleur du projet, qui ne disait pas quel onglet.
    const liseré = await ligne.evaluate((el) => getComputedStyle(el).borderLeftColor)
    expect(liseré).not.toBe(VIOLET_RGB)
  })

  test('la conversation à l’écran se lève comme le projet regardé', async () => {
    // Creusée, elle s'enfonçait là où la ligne du rail ressort : deux marques
    // du même état se lisaient à l'envers l'une de l'autre.
    const conversation = ctx.page
      .getByLabel('Sessions et fichiers')
      .locator('li', { hasText: 'Refonte facturation' })
      .locator('button')
      .first()
    const projet = ctx.page.getByLabel('Projets').locator('li').first().locator('button')

    const fond = (cible: Locator): Promise<string> =>
      cible.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(await fond(conversation)).toBe(await fond(projet))
  })

  test('le mot « à l’écran » aussi', async () => {
    await expect(ctx.page.getByText('à l’écran')).toHaveCSS('color', VIOLET_RGB)
  })

  test('et le compteur du rail, qui appartient au même projet', async () => {
    const compteur = ctx.page
      .getByLabel('Projets')
      .locator('span.rounded-full')
      .filter({ hasText: '1' })
    await expect(compteur).toHaveCSS('background-color', VIOLET_RGB)
  })
})
