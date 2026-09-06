import { execFile, spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, test } from '@playwright/test'
import { fermer, lancer, nouveauTerminal, SOCKET_TEST, SUR_WINDOWS, type Contexte } from './fixtures'

const run = promisify(execFile)

/**
 * Abat les services laissés par une exécution précédente.
 *
 * Ils survivent à la fermeture de l'application, ce qui est la promesse même de
 * Claudex : une suite qui suppose une ardoise vierge la trouve donc écrite. Le
 * cas se lisait mal, un service déjà en marche n'offrant plus le bouton
 * « démarrer » que le cas cherchait.
 */
async function ardoiseVierge(): Promise<void> {
  if (SUR_WINDOWS) return
  const { stdout } = await run('tmux', ['-L', SOCKET_TEST, 'ls', '-F', '#{session_name}']).catch(
    () => ({ stdout: '' })
  )
  for (const nom of stdout.split('\n').filter((n) => n.startsWith('svc_'))) {
    await run('tmux', ['-L', SOCKET_TEST, 'kill-session', '-t', `=${nom}`]).catch(() => undefined)
  }
}

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
    await ardoiseVierge()
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
  - nom: variable
    commande: echo "salut $QUI"; sleep 30
    env: { QUI: le monde }
  # Il écoute vraiment son port : un service qui le déclare sans l'ouvrir
  # resterait « démarre » pour toujours, et le cas mesurerait autre chose.
  - nom: squatte
    port: 47821
    commande: >-
      node -e "require('node:net').createServer().listen(47821, '127.0.0.1')"
`
    )
    // Les journaux d'une exécution précédente fausseraient les attentes : ils
    // portent déjà ce que ce cas s'apprête à vérifier.
    await rm(join(provisoire.projet, '.claudex', 'logs'), { recursive: true, force: true })
    await fermer(provisoire, { nettoyer: false })
    ctx = await lancer({ donnees: provisoire.donnees, projet: provisoire.projet })
  })

  test.afterAll(async () => {
    await fermer(ctx)
    // Rien ne doit survivre à la suite : ces sessions-là n'appartiennent à
    // personne une fois le profil jetable effacé.
    await ardoiseVierge()
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

  test('les variables déclarées arrivent au service', async () => {
    test.skip(SUR_WINDOWS, 'PowerShell les pose autrement, éprouvé de son côté')

    await ctx.page.getByRole('button', { name: 'Services', exact: true }).click()
    const ligne = ctx.page.locator('li', { hasText: 'variable' }).last()
    await ligne.getByRole('button', { name: 'démarrer' }).click()

    // C'est le journal qui fait foi : il porte ce que le service a réellement vu.
    const journal = join(ctx.projet, '.claudex', 'logs', 'variable.log')
    await expect
      .poll(async () => (await readFile(journal, 'utf8').catch(() => '')).includes('salut le monde'), {
        timeout: 20_000
      })
      .toBe(true)
  })

  test('la bande du haut compte les services d’un seul chiffre', async () => {
    // Une seule mesure pour tous : neuf pastilles seraient illisibles.
    await expect(ctx.page.getByTitle(/Services en marche/)).toBeVisible()
  })

  test('le skill s’écrit sur demande, et dit où sont les journaux', async () => {
    await ctx.page.getByRole('button', { name: 'Services', exact: true }).click()
    await ctx.page.getByRole('button', { name: 'écrire le skill' }).click()

    const skill = join(ctx.projet, '.claude', 'skills', 'services-du-projet', 'SKILL.md')
    await expect.poll(async () => readFile(skill, 'utf8').catch(() => '')).toContain(
      '.claudex/logs/veilleuse.log'
    )
    // Il dit aussi ce qu'il ne faut pas faire : relancer un service à la main.
    expect(await readFile(skill, 'utf8')).toContain('deux instances')
  })

  test('libérer le port tue ce qui le tient hors de Claudex', async () => {
    test.skip(SUR_WINDOWS, 'netstat et taskkill, éprouvés de leur côté')

    // Un intrus, lancé hors de l'application : c'est exactement le cas où
    // « arrêter » ne peut rien, n'ayant aucune session à détruire.
    const intrus = spawn(process.execPath, [
      '-e',
      "require('node:net').createServer().listen(47821, '127.0.0.1')"
    ])
    try {
      await ctx.page.getByRole('button', { name: 'Services', exact: true }).click()
      const ligne = ctx.page.locator('li', { hasText: 'squatte' }).last()
      await expect(ligne.getByLabel('hors Claudex')).toBeVisible({ timeout: 20_000 })

      await ligne.getByRole('button', { name: 'libérer', exact: true }).click()
      await expect(ligne.getByLabel('arrêté')).toBeVisible({ timeout: 20_000 })
      expect(intrus.exitCode ?? intrus.signalCode).toBeTruthy()
    } finally {
      intrus.kill('SIGKILL')
    }
  })

  test('reprendre le port tue l’intrus et lance le service à sa place', async () => {
    test.skip(SUR_WINDOWS, 'netstat et taskkill, éprouvés de leur côté')

    const intrus = spawn(process.execPath, [
      '-e',
      "require('node:net').createServer().listen(47821, '127.0.0.1')"
    ])
    try {
      await ctx.page.getByRole('button', { name: 'Services', exact: true }).click()
      const ligne = ctx.page.locator('li', { hasText: 'squatte' }).last()
      await expect(ligne.getByLabel('hors Claudex')).toBeVisible({ timeout: 20_000 })

      await ligne.getByRole('button', { name: 'reprendre' }).click()
      // Le service tourne, et c'est Claudex qui le tient : plus « hors Claudex ».
      await expect(ligne.getByLabel('en marche')).toBeVisible({ timeout: 30_000 })
      expect(intrus.exitCode ?? intrus.signalCode).toBeTruthy()
    } finally {
      intrus.kill('SIGKILL')
    }
  })

  test('relancer un service le remet en marche', async () => {
    test.skip(SUR_WINDOWS, 'le pilote ConPTY journalise autrement, éprouvé de son côté')

    await ctx.page.getByRole('button', { name: 'Services', exact: true }).click()
    const ligne = ctx.page.locator('li', { hasText: 'seconde' }).last()
    if (await ligne.getByRole('button', { name: 'démarrer' }).isVisible().catch(() => false)) {
      await ligne.getByRole('button', { name: 'démarrer' }).click()
      await expect(ligne.getByLabel('en marche')).toBeVisible({ timeout: 20_000 })
    }

    await ligne.getByRole('button', { name: 'relancer' }).click()
    await expect(ligne.getByLabel('en marche')).toBeVisible({ timeout: 30_000 })
  })

  test('le clic droit propose de tuer le processus sur le port, quel que soit l’état', async () => {
    await ctx.page.getByRole('button', { name: 'Services', exact: true }).click()
    const ligne = ctx.page.locator('li', { hasText: 'squatte' }).last()
    await ligne.click({ button: 'right' })

    const menu = ctx.page.getByRole('menu')
    await expect(menu.getByRole('menuitem', { name: /Tuer le processus sur le port 47821/ })).toBeVisible()
    await ctx.page.keyboard.press('Escape')
  })

  test('démarrer sur un port déjà tenu ne lance rien', async () => {
    test.skip(SUR_WINDOWS, 'netstat et taskkill, éprouvés de leur côté')

    // Les cas d'avant ont pu laisser ce service sous Claudex : on le rend au
    // repos, sans quoi ce cas mesurerait un tout autre état.
    await ctx.page.getByRole('button', { name: 'Services', exact: true }).click()
    const ligne = ctx.page.locator('li', { hasText: 'squatte' }).last()
    if (await ligne.getByRole('button', { name: 'arrêter' }).isVisible().catch(() => false)) {
      await ligne.getByRole('button', { name: 'arrêter' }).click()
    }
    await expect(ligne.getByLabel('arrêté')).toBeVisible({ timeout: 20_000 })

    const intrus = spawn(process.execPath, [
      '-e',
      "require('node:net').createServer().listen(47821, '127.0.0.1')"
    ])
    try {
      await expect(ligne.getByLabel('hors Claudex')).toBeVisible({ timeout: 20_000 })

      // « tout démarrer » ne regarde pas l'état des lignes : c'est par là que le
      // service partait quand même, pour se heurter au port et attendre une
      // réponse à une question que personne ne voyait.
      await ctx.page.getByRole('button', { name: 'tout démarrer' }).last().click()
      await ctx.page.waitForTimeout(3000)
      await expect(ligne.getByLabel('hors Claudex')).toBeVisible()
      expect(intrus.exitCode ?? intrus.signalCode).toBeNull()
    } finally {
      intrus.kill('SIGKILL')
    }
  })
})
