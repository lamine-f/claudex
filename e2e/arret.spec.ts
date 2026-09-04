import { expect, test } from '@playwright/test'
import { attendreInvite, boutonNouveauTerminal, fermer, lancer, lireTerminaux, simulerRedemarrage, type Contexte } from './fixtures'

/**
 * Ce qui arrive quand le serveur tmux disparaît sous un terminal ouvert : il ne
 * restait qu'un « [server exited] » au milieu d'un écran mort, sans rien pour en
 * sortir.
 */
test.describe('terminal arrêté', () => {
  let ctx: Contexte

  test.beforeAll(async () => {
    ctx = await lancer()
  })

  test.afterAll(async () => {
    await fermer(ctx)
  })

  test("l'arrêt est signalé au lieu de laisser un écran mort", async () => {
    await boutonNouveauTerminal(ctx.page).click()
    await attendreInvite(ctx.page, 0)

    await simulerRedemarrage()

    await expect(ctx.page.getByText("Ce terminal s'est arrêté.")).toBeVisible({ timeout: 15_000 })
    await expect(ctx.page.getByRole('button', { name: /Relancer/ })).toBeVisible()
  })

  test('relancer rend un terminal utilisable', async () => {
    await ctx.page.getByRole('button', { name: /Relancer/ }).click()

    // Le terminal repart d'un écran propre, sur une session neuve.
    await expect(ctx.page.getByText("Ce terminal s'est arrêté.")).toHaveCount(0)
    await expect
      .poll(async () => (await lireTerminaux(ctx.page))[0]?.lignes.length ?? 0, { timeout: 20_000 })
      .toBeGreaterThan(0)
  })
})
