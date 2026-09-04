import { expect, test } from '@playwright/test'
import { attendreInvite, fermer, lancer, NOUVEAU_TERMINAL, type Contexte } from './fixtures'

/**
 * Les raccourcis, tels que les tape l'utilisateur du système où tourne le test.
 *
 * Commande sur macOS. Ailleurs, Contrôle et Majuscule : Contrôle seul appartient
 * au shell, et le lui prendre dans une application faite de terminaux se paierait
 * cher — Contrôle+W efface un mot pour l'agent, il fermerait l'onglet.
 */
const COMMANDE = process.platform === 'darwin' ? 'Meta' : 'Control+Shift'

test.describe('raccourcis clavier', () => {
  let ctx: Contexte

  test.beforeAll(async () => {
    ctx = await lancer()
  })

  test.afterAll(async () => {
    await fermer(ctx)
  })

  test('la combinaison de la plateforme ouvre un terminal', async () => {
    await ctx.page.keyboard.press(`${COMMANDE}+T`)
    await expect(ctx.page.locator('.xterm')).toHaveCount(1)
    await attendreInvite(ctx.page, 0)
  })

  test("l'infobulle du bouton annonce la même combinaison", async () => {
    const attendu = process.platform === 'darwin' ? '⌘T' : 'Ctrl+Maj+T'
    // Le libellé vient du même module partagé que la touche écoutée : les avoir
    // écrits séparément faisait passer une suite verte sur une interface où
    // plus rien ne portait le bon nom.
    expect(NOUVEAU_TERMINAL).toBe(`Nouveau terminal (${attendu})`)
    await expect(ctx.page.getByTitle(NOUVEAU_TERMINAL)).toBeVisible()
  })

  test('la combinaison bascule entre conversations et fichiers', async () => {
    const fichiers = ctx.page.getByRole('button', { name: 'Fichiers', exact: true })

    await ctx.page.keyboard.press(`${COMMANDE}+E`)
    await expect(fichiers).toHaveAttribute('aria-pressed', 'true')
    await ctx.page.keyboard.press(`${COMMANDE}+E`)
    await expect(fichiers).toHaveAttribute('aria-pressed', 'false')
  })

  test('hors macOS, Contrôle seul reste au terminal', async () => {
    test.skip(process.platform === 'darwin', 'Contrôle seul y est déjà libre')

    const fichiers = ctx.page.getByRole('button', { name: 'Fichiers', exact: true })

    // Contrôle+E va en fin de ligne dans un shell : l'application ne doit pas
    // s'en saisir, sans quoi l'agent ne le recevrait jamais.
    await ctx.page.keyboard.press('Control+E')
    await expect(fichiers).toHaveAttribute('aria-pressed', 'false')

    // Contrôle+W efface le mot précédent. S'il fermait l'onglet, il emporterait
    // la session tmux et le travail avec elle.
    await ctx.page.keyboard.press('Control+W')
    await expect(ctx.page.locator('.xterm')).toHaveCount(1)
  })
})
