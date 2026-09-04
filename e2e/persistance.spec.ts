import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { expect, test } from '@playwright/test'
import { FERMER_ONGLET, fermer, lancer, lireTerminaux, NOUVEAU_TERMINAL, SOCKET_TEST, SUR_WINDOWS, taper } from './fixtures'

const run = promisify(execFile)

async function sessionsClaudex(): Promise<string[]> {
  try {
    const { stdout } = await run('tmux', ['-L', SOCKET_TEST, 'ls', '-F', '#{session_name}'])
    return stdout.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

/**
 * La promesse centrale de Claudex : fermer l'application ne détruit rien.
 * Les sessions tmux survivent, et les rouvrir restitue l'écran tel qu'il était.
 *
 * Le pilote ConPTY ne la tient pas : la session est le pty, et il meurt avec
 * l'application. Ce cas est donc écarté sur Windows plutôt que réécrit à sa
 * mesure — le réécrire lui ferait dire l'inverse de son titre. Ce que Windows
 * sait faire à la place est vérifié par `reboot.spec.ts`, qui part précisément
 * d'un état où plus aucune session ne subsiste.
 */
test.skip(SUR_WINDOWS, 'le pilote ConPTY ne fait pas survivre les sessions')

test('un terminal survit à la fermeture de l’application', async () => {
  // Le socket peut porter des sessions d'autres tests : on ne raisonne que sur
  // celles que ce test crée lui-même.
  const initiales = await sessionsClaudex()
  const premier = await lancer()

  await premier.page.getByTitle(NOUVEAU_TERMINAL).click()
  await expect(premier.page.locator('.xterm')).toHaveCount(1)

  await taper(premier.page, 0, 'echo MARQUE_PERSISTANCE', 'MARQUE_PERSISTANCE')

  const avant = (await sessionsClaudex()).filter((s) => !initiales.includes(s))
  expect(avant).toHaveLength(1)

  // Fermeture de l'application, profil conservé.
  await fermer(premier, { nettoyer: false })

  // La session tmux, elle, est toujours debout : le client s'est simplement détaché.
  expect(await sessionsClaudex()).toEqual(expect.arrayContaining(avant))

  // Réouverture sur le même profil : l'onglet se rattache tout seul.
  const second = await lancer({ donnees: premier.donnees, projet: premier.projet })
  try {
    await expect(second.page.locator('.xterm')).toHaveCount(1)

    // tmux redessine à l'arrivée du nouveau client : ce qui était à l'écran avant
    // la fermeture est de retour, sans que rien n'ait été rejoué.
    await expect
      .poll(async () => (await lireTerminaux(second.page))[0]?.lignes.join('\n') ?? '')
      .toContain('MARQUE_PERSISTANCE')
  } finally {
    // Fermeture définitive de l'onglet : cette fois la session doit disparaître.
    await second.page.getByTitle(FERMER_ONGLET).last().click()
    await expect(second.page.locator('.xterm')).toHaveCount(0)
    await fermer(second)
  }

  const apres = await sessionsClaudex()
  for (const session of avant) expect(apres).not.toContain(session)
})
