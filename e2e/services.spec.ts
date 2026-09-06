import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { fermer, lancer, nouveauTerminal, SUR_WINDOWS, type Contexte } from './fixtures'

/**
 * Les services d'un projet, de la déclaration au fichier de journal.
 *
 * Le service de ce cas n'écoute aucun port : son état se lit alors sur sa
 * session. C'est le seul montage qui tienne dans une suite, un vrai port
 * demanderait de choisir un numéro que la machine pourrait déjà utiliser.
 */
test.describe('services du projet', () => {
  let ctx: Contexte

  test.beforeAll(async () => {
    const provisoire = await lancer()
    await mkdir(join(provisoire.projet, '.claudex'), { recursive: true })
    await writeFile(
      join(provisoire.projet, '.claudex', 'services.yml'),
      `
defaut:
  bruit:
    commande: while true; do echo tic; sleep 1; done

services:
  - { nom: veilleuse, groupe: bruit }
  - { nom: seconde, groupe: bruit }
`
    )
    await fermer(provisoire, { nettoyer: false })
    ctx = await lancer({ donnees: provisoire.donnees, projet: provisoire.projet })
  })

  test.afterAll(async () => {
    await ctx.page.getByRole('button', { name: 'Services', exact: true }).click()
    await ctx.page.getByRole('button', { name: 'tout arrêter' }).click().catch(() => undefined)
    await fermer(ctx)
  })

  test('la colonne les liste, groupés et arrêtés', async () => {
    await ctx.page.getByRole('button', { name: 'Services', exact: true }).click()
    await expect(ctx.page.getByText('bruit', { exact: true })).toBeVisible()
    await expect(ctx.page.getByRole('button', { name: 'veilleuse' })).toBeVisible()
    await expect(ctx.page.getByLabel('arrêté').first()).toBeVisible()
  })

  test('démarrer un service le fait vivre et remplit son journal', async () => {
    test.skip(SUR_WINDOWS, 'le pilote ConPTY journalise autrement, éprouvé de son côté')

    const ligne = ctx.page.locator('li', { hasText: 'veilleuse' }).last()
    await ligne.hover()
    await ligne.getByRole('button', { name: 'démarrer' }).click()

    // L'état se relit tout seul : la colonne interroge le système régulièrement.
    await expect(ligne.getByLabel('en marche')).toBeVisible({ timeout: 20_000 })

    // Le fichier est celui qu'un agent lira. C'est lui qui compte, pas l'écran.
    const journal = join(ctx.projet, '.claudex', 'logs', 'veilleuse.log')
    await expect
      .poll(async () => (await readFile(journal, 'utf8').catch(() => '')).includes('tic'), {
        timeout: 20_000
      })
      .toBe(true)
  })

  test('arrêter le service le rend au repos', async () => {
    test.skip(SUR_WINDOWS, 'le pilote ConPTY journalise autrement, éprouvé de son côté')

    const ligne = ctx.page.locator('li', { hasText: 'veilleuse' }).last()
    await ligne.hover()
    await ligne.getByRole('button', { name: 'arrêter' }).click()
    await expect(ligne.getByLabel('arrêté')).toBeVisible({ timeout: 20_000 })
  })

  test('cliquer un service ouvre son journal en onglet, à la place du terminal', async () => {
    test.skip(SUR_WINDOWS, 'le pilote ConPTY journalise autrement, éprouvé de son côté')

    // Un terminal d'abord, pour vérifier que le journal prend sa place sans le
    // fermer, et que l'onglet du terminal le ramène.
    await nouveauTerminal(ctx.page)
    await expect(ctx.page.locator('.xterm')).toHaveCount(1)

    await ctx.page.getByRole('button', { name: 'Services', exact: true }).click()
    const ligne = ctx.page.locator('li', { hasText: 'seconde' }).last()
    await ligne.hover()
    await ligne.getByRole('button', { name: 'démarrer' }).click()
    await ctx.page.getByRole('button', { name: 'seconde' }).first().click()

    // L'onglet du journal porte le chemin du fichier en infobulle, là où la
    // ligne de la liste porte le même nom : c'est ce qui les distingue.
    const onglet = ctx.page.getByTitle(/seconde\.log$/)
    await expect(onglet).toHaveAttribute('aria-current', 'true')
    await expect(ctx.page.getByRole('button', { name: /suit|gelé/ })).toBeVisible()

    // Revenir au terminal, puis fermer la vue sans arrêter le service.
    await ctx.page.getByRole('button', { name: 'Terminal', exact: true }).first().click()
    await expect(ctx.page.getByRole('button', { name: /suit|gelé/ })).toHaveCount(0)

    await onglet.hover()
    await ctx.page
      .getByTitle('Fermer la vue. Le service continue de tourner.')
      .first()
      .click()
    await expect(onglet).toHaveCount(0)

    // Le service, lui, tourne toujours.
    await ctx.page.getByRole('button', { name: 'Services', exact: true }).click()
    await expect(
      ctx.page.locator('li', { hasText: 'seconde' }).last().getByLabel('en marche')
    ).toBeVisible()
  })
})
