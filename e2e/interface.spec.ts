import { expect, test } from '@playwright/test'
import { fermer, lancer, type Contexte } from './fixtures'

/**
 * Replier les colonnes rend leur largeur au terminal, qui est ce qu'on regarde.
 */
test.describe('replier les colonnes', () => {
  let ctx: Contexte

  test.beforeAll(async () => {
    ctx = await lancer()
  })

  test.afterAll(async () => {
    await fermer(ctx)
  })

  test('la colonne des projets se masque et revient', async () => {
    const projets = ctx.page.getByLabel('Projets', { exact: true })
    await expect(projets).toBeVisible()

    await ctx.page.getByRole('button', { name: 'Masquer les projets' }).click()
    await expect(projets).toHaveCount(0)

    await ctx.page.getByRole('button', { name: 'Afficher les projets' }).click()
    await expect(projets).toBeVisible()
  })

  test('la colonne des conversations se masque et revient', async () => {
    const colonne = ctx.page.getByLabel('Sessions et fichiers')
    await expect(colonne).toBeVisible()

    await ctx.page.getByRole('button', { name: 'Masquer la colonne' }).click()
    await expect(colonne).toHaveCount(0)

    await ctx.page.getByRole('button', { name: 'Afficher la colonne' }).click()
    await expect(colonne).toBeVisible()
  })

  test('l’état des panneaux survit à un redémarrage', async () => {
    await ctx.page.getByRole('button', { name: 'Masquer les projets' }).click()
    await expect(ctx.page.getByLabel('Projets', { exact: true })).toHaveCount(0)

    await fermer(ctx, { nettoyer: false })
    ctx = await lancer({ donnees: ctx.donnees, projet: ctx.projet })

    // Ce qu'on a replié doit le rester : le redéplier à chaque ouverture
    // annulerait le geste.
    await expect(ctx.page.getByLabel('Projets', { exact: true })).toHaveCount(0)
    await ctx.page.getByRole('button', { name: 'Afficher les projets' }).click()
    await expect(ctx.page.getByLabel('Projets', { exact: true })).toBeVisible()
  })
})
