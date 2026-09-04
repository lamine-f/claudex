import { expect, test } from '@playwright/test'
import { attendreInvite, boutonNouveauTerminal, fermer, lancer, lireTerminaux, taper, type Contexte } from './fixtures'

test.describe('terminaux tmux', () => {
  let ctx: Contexte

  test.beforeAll(async () => {
    ctx = await lancer()
  })

  test.afterAll(async () => {
    await fermer(ctx)
  })

  test('le premier terminal ouvert affiche son invite', async () => {
    await boutonNouveauTerminal(ctx.page).click()
    await expect(ctx.page.locator('.xterm')).toHaveCount(1)

    // Régression : le premier onglet restait muet, car l'attachement du client —
    // seul déclencheur du redessin par tmux — était mutualisé avec la création.
    await attendreInvite(ctx.page, 0)
  })

  test('la frappe est exécutée et sa sortie revient à l’écran', async () => {
    await taper(ctx.page, 0, 'echo BONJOUR_CLAUDEX', 'BONJOUR_CLAUDEX')
  })

  test('un second onglet vit sans éteindre le premier', async () => {
    await boutonNouveauTerminal(ctx.page).click()
    await expect(ctx.page.locator('.xterm')).toHaveCount(2)

    await expect
      .poll(async () => {
        const terminaux = await lireTerminaux(ctx.page)
        return terminaux.length === 2 && terminaux.every((t) => t.lignes.length > 0)
      })
      .toBe(true)

    // Le premier n'a pas perdu son historique en passant au second plan.
    const terminaux = await lireTerminaux(ctx.page)
    expect(terminaux[0]!.lignes.join('\n')).toContain('BONJOUR_CLAUDEX')
  })

  test('fermer un onglet libère sa session sans toucher aux autres', async () => {
    await ctx.page.getByTitle("Fermer l'onglet et sa session tmux").last().click()
    await expect(ctx.page.locator('.xterm')).toHaveCount(1)

    const terminaux = await lireTerminaux(ctx.page)
    expect(terminaux).toHaveLength(1)
    expect(terminaux[0]!.lignes.join('\n')).toContain('BONJOUR_CLAUDEX')
  })
})
