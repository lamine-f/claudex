import { expect, test } from '@playwright/test'
import { attendreInvite, fermer, lancer, lireTerminaux, NOUVEAU_TERMINAL, simulerRedemarrage, SUR_WINDOWS, taper, type Contexte } from './fixtures'

/**
 * Ce qui arrive quand la session disparaît sous un terminal ouvert : il ne
 * restait qu'un « [server exited] » au milieu d'un écran mort, sans rien pour en
 * sortir.
 *
 * La façon de la faire disparaître dépend du pilote. tmux a un serveur qu'on peut
 * abattre par-dessous ; ConPTY n'en a pas, et le seul geste équivalent est de
 * faire sortir le shell lui-même. Dans les deux cas le pty se termine, ce qui est
 * exactement ce que ce test veut voir arriver à l'interface.
 *
 * Sur tmux le serveur est remis debout vide derrière, ce dont `simulerRedemarrage`
 * se charge. Le laisser absent ferait démarrer le serveur par l'application au
 * clic sur « Relancer », et celui-là hériterait de ses descripteurs de fichiers :
 * `app.close()` ne rendrait plus la main, et c'est le worker Playwright qui
 * tomberait en délai dépassé, loin du test qui a créé la session.
 */
async function faireDisparaitreLaSession(ctx: Contexte): Promise<void> {
  if (SUR_WINDOWS) {
    await taper(ctx.page, 0, 'exit', '')
    return
  }
  await simulerRedemarrage()
}

test.describe('terminal arrêté', () => {
  let ctx: Contexte

  test.beforeAll(async () => {
    ctx = await lancer()
  })

  test.afterAll(async () => {
    await fermer(ctx)
  })

  test("l'arrêt est signalé au lieu de laisser un écran mort", async () => {
    await ctx.page.getByTitle(NOUVEAU_TERMINAL).click()
    await attendreInvite(ctx.page, 0)

    await faireDisparaitreLaSession(ctx)

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
