import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { fermer, lancer, type Contexte } from './fixtures'

/** Violet : franchement distinct du terracotta, donc impossible à confondre. */
const VIOLET = '#c98fe0'
const VIOLET_RGB = 'rgb(201, 143, 224)'

function dossierTranscrits(projet: string): string {
  return join(process.env.HOME!, '.claude', 'projects', projet.replace(/[^a-zA-Z0-9-]/g, '-'))
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

  test('le liseré de la conversation à l’écran prend la teinte du projet', async () => {
    const ligne = ctx.page
      .getByLabel('Sessions et fichiers')
      .locator('li', { hasText: 'Refonte facturation' })
      .locator('button')
      .first()
    await expect(ligne).toHaveCSS('border-left-color', VIOLET_RGB)
  })

  test('le mot « à l’écran » aussi', async () => {
    await expect(ctx.page.getByText('à l’écran')).toHaveCSS('color', VIOLET_RGB)
  })

  test("la pastille de l'onglet actif aussi", async () => {
    const pastille = ctx.page
      .getByRole('button', { name: 'Refonte facturation' })
      .last()
      .locator('xpath=../span[@aria-hidden]')
    await expect(pastille).toHaveCSS('background-color', VIOLET_RGB)
  })

  test('et le compteur du rail, qui appartient au même projet', async () => {
    const compteur = ctx.page
      .getByLabel('Projets')
      .locator('span.rounded-full')
      .filter({ hasText: '1' })
    await expect(compteur).toHaveCSS('background-color', VIOLET_RGB)
  })
})
