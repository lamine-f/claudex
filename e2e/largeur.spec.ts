import { expect, test } from '@playwright/test'
import { fermer, lancer, NOUVEAU_TERMINAL, type Contexte } from './fixtures'

/**
 * Replier une colonne doit rendre sa largeur au terminal : sans cela le repli
 * ne fait que laisser un vide, et l'on y perd au lieu d'y gagner.
 */
test('replier la colonne élargit vraiment le terminal', async () => {
  const ctx: Contexte = await lancer()
  try {
    await ctx.page.getByTitle(NOUVEAU_TERMINAL).click()
    await expect(ctx.page.locator('.xterm')).toHaveCount(1)

    const largeur = async (): Promise<number> =>
      (await ctx.page.locator('.xterm').boundingBox())?.width ?? 0

    const avant = await largeur()
    await ctx.page.getByRole('button', { name: 'Masquer la colonne' }).click()

    await expect.poll(largeur).toBeGreaterThan(avant + 100)
  } finally {
    await fermer(ctx)
  }
})
