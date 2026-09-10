import { expect, test } from '@playwright/test'
import { attendreInvite, fermer, FERMER_ONGLET, lancer, lireTerminaux, NOUVEAU_TERMINAL, nouveauTerminal, taper, type Contexte } from './fixtures'

test.describe('terminaux', () => {
  let ctx: Contexte

  test.beforeAll(async () => {
    ctx = await lancer()
  })

  test.afterAll(async () => {
    await fermer(ctx)
  })

  test('le premier terminal ouvert affiche son invite', async () => {
    await ctx.page.getByTitle(NOUVEAU_TERMINAL).click()
    await expect(ctx.page.locator('.xterm')).toHaveCount(1)

    // Régression : le premier onglet restait muet, car l'attachement du client —
    // seul déclencheur du redessin par tmux — était mutualisé avec la création.
    await attendreInvite(ctx.page, 0)
  })

  test('la frappe est exécutée et sa sortie revient à l’écran', async () => {
    await taper(ctx.page, 0, 'echo BONJOUR_CLAUDEX', 'BONJOUR_CLAUDEX')
  })

  test('un second onglet vit sans éteindre le premier', async () => {
    await ctx.page.getByTitle(NOUVEAU_TERMINAL).click()
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
    await ctx.page.getByTitle(FERMER_ONGLET).last().click()
    await expect(ctx.page.locator('.xterm')).toHaveCount(1)

    const terminaux = await lireTerminaux(ctx.page)
    expect(terminaux).toHaveLength(1)
    expect(terminaux[0]!.lignes.join('\n')).toContain('BONJOUR_CLAUDEX')
  })

  test('le clic droit sur un onglet propose de fermer les autres', async () => {
    // Trois terminaux, pour que « les autres » et « de gauche » aient un sens.
    while ((await ctx.page.locator('.xterm').count()) < 3) await nouveauTerminal(ctx.page)
    await expect(ctx.page.locator('.xterm')).toHaveCount(3)

    const premier = ctx.page.getByRole('button', { name: 'Terminal', exact: true }).first()
    await premier.click({ button: 'right' })

    // Les comptes sont dans les intitulés : fermer emporte des sessions, et le
    // geste n'a pas le même poids selon qu'il en emporte une ou sept.
    const menu = ctx.page.getByRole('menu')
    await expect(menu.getByRole('menuitem', { name: 'Fermer les 2 autres' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Fermer les 2 de droite' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: /de gauche/ })).toHaveCount(0)

    await menu.getByRole('menuitem', { name: 'Fermer les 2 autres' }).click()
    await expect(ctx.page.locator('.xterm')).toHaveCount(1, { timeout: 20_000 })
  })
})
