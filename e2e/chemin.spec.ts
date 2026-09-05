import { expect, test } from '@playwright/test'
import { attendreInvite, fermer, lancer, nouveauTerminal, SUR_WINDOWS } from './fixtures'

/**
 * Le PATH que macOS donne à une application lancée depuis le Dock.
 *
 * Quatre dossiers du système, et rien d'autre. tmux, installé par Homebrew dans
 * `/opt/homebrew/bin`, y est introuvable, comme le CLI de Claude Code dans
 * `~/.local/bin`. Lancée ainsi, l'application restait sur « démarrage du
 * terminal… » pour toujours : le pty mourait à l'instant, faute de tmux.
 *
 * Le défaut ne se voyait qu'installée. En développement, l'application est
 * lancée depuis un terminal et hérite d'un PATH complet, et la suite de tests
 * faisait de même.
 */
const PATH_DU_DOCK = '/usr/bin:/bin:/usr/sbin:/sbin'

test('un terminal s’ouvre même lancée depuis le Dock', async () => {
  test.skip(SUR_WINDOWS, 'le PATH maigre est propre au lancement graphique de macOS')

  const ctx = await lancer({ env: { PATH: PATH_DU_DOCK } })
  try {
    await nouveauTerminal(ctx.page)
    await expect(ctx.page.locator('.xterm')).toHaveCount(1)

    // L'invite qui s'affiche est la preuve que le pty vit : sans tmux, il meurt
    // à l'instant et rien n'arrive jamais.
    const contenu = await attendreInvite(ctx.page, 0)
    expect(contenu).toBeTruthy()
  } finally {
    await fermer(ctx)
  }
})
