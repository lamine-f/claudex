import { expect, test } from '@playwright/test'
import { attendreInvite, boutonNouveauTerminal, fermer, lancer, lireTerminaux, type Contexte } from './fixtures'

/**
 * Le chemin qu'emprunte réellement l'utilisateur : cliquer dans le terminal, puis
 * taper au clavier. Les autres tests écrivent par l'IPC et court-circuitent donc
 * xterm — ils ne peuvent pas voir un défaut de focus.
 */
test.describe('frappe au clavier', () => {
  let ctx: Contexte

  test.beforeAll(async () => {
    ctx = await lancer()
    await boutonNouveauTerminal(ctx.page).click()
    await attendreInvite(ctx.page, 0)
  })

  test.afterAll(async () => {
    await fermer(ctx)
  })

  test('cliquer dans le terminal donne le focus au clavier', async () => {
    await ctx.page.locator('.xterm').click()
    const focus = await ctx.page.evaluate(() => document.activeElement?.className ?? '')
    expect(focus).toContain('xterm-helper-textarea')
  })

  test('ce qui est tapé arrive dans le shell', async () => {
    await ctx.page.locator('.xterm').click()

    // Un shell qui vient de démarrer affiche son invite avant d'être prêt à lire :
    // les toutes premières frappes sont avalées, comme dans n'importe quel
    // terminal. On réessaie plutôt que de figer un délai arbitraire.
    for (let essai = 0; essai < 6; essai++) {
      await ctx.page.keyboard.type('echo FRAPPE_REELLE')
      await ctx.page.keyboard.press('Enter')
      const limite = Date.now() + 2500
      while (Date.now() < limite) {
        const vu = (await lireTerminaux(ctx.page))[0]?.lignes.join('\n') ?? ''
        if (vu.includes('FRAPPE_REELLE\n') || /^FRAPPE_REELLE$/m.test(vu)) return
        await ctx.page.waitForTimeout(150)
      }
    }
    expect((await lireTerminaux(ctx.page))[0]?.lignes.join('\n')).toContain('FRAPPE_REELLE')
  })

  test("revenir sur un onglet lui rend le clavier", async () => {
    await boutonNouveauTerminal(ctx.page).click()
    await expect(ctx.page.locator('.xterm')).toHaveCount(2)

    // Basculer sur le premier onglet doit lui redonner le focus sans clic : sinon
    // on tape dans le vide en croyant l'application figée.
    await ctx.page.getByRole('button', { name: 'Terminal' }).first().click()
    await expect
      .poll(async () => ctx.page.evaluate(() => document.activeElement?.className ?? ''))
      .toContain('xterm-helper-textarea')
  })
})
