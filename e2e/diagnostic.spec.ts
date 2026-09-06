import { execFileSync } from 'node:child_process'
import { mkdtemp, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { fermer, lancer, type Contexte } from './fixtures'

interface Controle {
  id: string
  severity: string
  detail: string
}

const controles = (ctx: Contexte): Promise<Controle[]> =>
  ctx.page.evaluate(() => window.claudex.doctor.check()) as Promise<Controle[]>

/** Où se trouve un exécutable, ou rien s'il n'est pas sur la machine. */
function ou(nom: string): string | null {
  try {
    return execFileSync('command', ['-v', nom], { encoding: 'utf8', shell: true }).trim() || null
  } catch {
    return null
  }
}

/**
 * Le gestionnaire de fichiers manquant se dit à l'écran d'état.
 *
 * C'est là que l'utilisateur cherche ce qui manque, et le contrôle y voisine
 * tmux et Claude Code. Avant lui, un clic droit sur « Ouvrir dans le
 * gestionnaire de fichiers » restait sans effet et sans explication.
 *
 * Le cas ne vaut que pour Linux : macOS a le Finder et Windows l'explorateur,
 * qui font partie du système et ne peuvent pas manquer.
 */
test.describe('écran d’état', () => {
  test.skip(process.platform !== 'linux', 'seul Linux peut être privé de xdg-open')

  test('signale xdg-open manquant, et se tait quand il est là', async () => {
    const tmux = ou('tmux')
    const claude = ou('claude')
    test.skip(!tmux || !claude, 'il faut les deux outils pour isoler la seule absence de xdg-open')

    // Un PATH qui porte tmux et claude, mais pas xdg-open. Les trois vivent dans
    // les mêmes dossiers sur une Debian ordinaire : les isoler demande de
    // fabriquer un dossier qui ne contient que les deux premiers. Sans eux,
    // `completerChemin()` irait chercher le PATH du shell et ramènerait xdg-open
    // avec le reste.
    const bin = await mkdtemp(join(tmpdir(), 'claudex-sans-xdg-'))
    await symlink(tmux!, join(bin, 'tmux'))
    await symlink(claude!, join(bin, 'claude'))

    let ctx: Contexte | undefined
    try {
      ctx = await lancer({ env: { PATH: bin } })
      const manquant = (await controles(ctx)).find((c) => c.id === 'gestionnaire')
      expect(manquant?.severity).toBe('warn')
      // Le détail porte la commande : c'est ce qu'on vient y chercher.
      expect(manquant?.detail).toContain('xdg-utils')
    } finally {
      if (ctx) await fermer(ctx)
    }

    // Et sur une machine pourvue, le contrôle ne paraît pas : une ligne toujours
    // verte n'apprendrait rien et encombrerait l'écran.
    let normal: Contexte | undefined
    try {
      normal = await lancer()
      test.skip(!ou('xdg-open'), 'cette machine est elle-même privée de xdg-open')
      expect((await controles(normal)).find((c) => c.id === 'gestionnaire')).toBeUndefined()
    } finally {
      if (normal) await fermer(normal)
    }
  })
})
