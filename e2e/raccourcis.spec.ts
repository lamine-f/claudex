import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

  test('Contrôle+Tab passe d’un onglet à l’autre, comme dans un navigateur', async () => {
    const onglets = ctx.page.getByRole('button', { name: 'Terminal', exact: true })
    // Un second terminal : à un seul onglet, le raccourci n'aurait rien à dire.
    await ctx.page.keyboard.press(`${COMMANDE}+T`)
    await expect(onglets).toHaveCount(2)
    await expect(onglets.nth(1)).toHaveAttribute('aria-current', 'true')

    // Depuis le dernier, le suivant est le premier : la boucle se referme.
    await ctx.page.keyboard.press('Control+Tab')
    await expect(onglets.nth(0)).toHaveAttribute('aria-current', 'true')

    await ctx.page.keyboard.press('Control+Tab')
    await expect(onglets.nth(1)).toHaveAttribute('aria-current', 'true')

    // Majuscule remonte, comme partout ailleurs.
    await ctx.page.keyboard.press('Control+Shift+Tab')
    await expect(onglets.nth(0)).toHaveAttribute('aria-current', 'true')
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
    // Le compte du moment, et non un chiffre écrit d'avance. Les cas d'au-dessus
    // laissent derrière eux les onglets qu'ils ont ouverts : celui-ci passait ou
    // tombait selon ce que son voisin avait fait avant lui.
    const onglets = await ctx.page.locator('.xterm').count()

    // Contrôle+E va en fin de ligne dans un shell, Contrôle+W efface le mot
    // précédent : l'application ne doit se saisir ni de l'un ni de l'autre, sans
    // quoi l'agent ne les recevrait jamais et l'onglet se fermerait sous lui,
    // emportant sa session et le travail avec elle.
    await ctx.page.keyboard.press('Control+E')
    await ctx.page.keyboard.press('Control+W')

    // Prouver qu'il ne s'est rien passé demande de laisser le temps qu'il se
    // passe quelque chose : sans cette pause, l'assertion ne constaterait que sa
    // propre hâte.
    await ctx.page.waitForTimeout(500)
    await expect(fichiers).toHaveAttribute('aria-pressed', 'false')
    await expect(ctx.page.locator('.xterm')).toHaveCount(onglets)
  })
})

/**
 * Les chiffres font exception : ils se passent de Majuscule hors de macOS.
 *
 * Le shell ne revendique pas Contrôle+chiffre, il n'y a donc rien à lui laisser.
 * Et `Ctrl+Maj+1` ne rapporte pas le même `key` d'une disposition à l'autre.
 */
test.describe('bascule entre projets', () => {
  let ctx: Contexte

  test.beforeAll(async () => {
    const donnees = await mkdtemp(join(tmpdir(), 'claudex-e2e-'))
    const premier = await mkdtemp(join(tmpdir(), 'claudex-projet-'))
    const second = await mkdtemp(join(tmpdir(), 'claudex-projet-'))

    await writeFile(
      join(donnees, 'state.json'),
      JSON.stringify({
        workspaces: [
          { id: 'ws1', path: premier, name: 'Premier projet', color: '#e8825a', order: 0 },
          { id: 'ws2', path: second, name: 'Second projet', color: '#7aa2f7', order: 1 }
        ],
        tabs: [],
        layout: { leftWidth: 260, middleWidth: 300 },
        activeWorkspaceId: 'ws1'
      })
    )

    ctx = await lancer({ donnees, projet: premier })
  })

  test.afterAll(async () => {
    await fermer(ctx)
  })

  test('le chiffre seul suffit à changer de projet', async () => {
    const entete = ctx.page.locator('header').first()
    await expect(entete).toContainText('Premier projet')

    await ctx.page.keyboard.press(process.platform === 'darwin' ? 'Meta+2' : 'Control+2')
    await expect(entete).toContainText('Second projet')

    await ctx.page.keyboard.press(process.platform === 'darwin' ? 'Meta+1' : 'Control+1')
    await expect(entete).toContainText('Premier projet')
  })
})
