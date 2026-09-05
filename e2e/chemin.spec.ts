import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { attendreInvite, fermer, lancer, nouveauTerminal, SUR_WINDOWS } from './fixtures'

/**
 * Un PATH où rien de ce dont Claudex a besoin ne se trouve.
 *
 * Le cas réel est celui du Dock de macOS, qui donne `/usr/bin:/bin:/usr/sbin:/sbin`
 * et rien d'autre : tmux, installé par Homebrew dans `/opt/homebrew/bin`, y est
 * introuvable, comme le CLI de Claude Code dans `~/.local/bin`. Lancée ainsi,
 * l'application restait sur « démarrage du terminal… » pour toujours, le pty
 * mourant à l'instant faute de tmux.
 *
 * Ce PATH-là ne prouve pourtant rien hors de macOS. tmux vient d'apt sur Debian,
 * donc de `/usr/bin`, qui en fait partie : le terminal s'y ouvrait de toute façon,
 * et le cas passait au vert sans avoir rien éprouvé. Un dossier vide ne laisse
 * cette échappatoire à aucun système.
 *
 * Le défaut ne se voyait qu'installée. En développement, l'application est
 * lancée depuis un terminal et hérite d'un PATH complet, et la suite de tests
 * faisait de même.
 */
const PATH_SANS_RIEN = await mkdtemp(join(tmpdir(), 'claudex-path-vide-'))

/**
 * Le plus maigre qu'un processus Windows puisse recevoir sans être cassé.
 *
 * Il n'imite aucun mode de lancement : Windows n'a pas d'équivalent du PATH du
 * Dock. L'explorateur, qui ouvre une application depuis le menu Démarrer,
 * compose le PATH depuis le registre et le transmet entier, machine et
 * utilisateur réunis — mesuré sur une machine de développement : treize
 * dossiers, dont `~/.local/bin`. C'est pourquoi `completerChemin()` sort sans
 * rien faire sur Windows.
 */
const PATH_MAIGRE_WINDOWS = 'C:\\Windows\\system32;C:\\Windows'

test('un terminal s’ouvre même sans rien dans le PATH', async () => {
  test.skip(SUR_WINDOWS, 'Windows a son cas à lui, plus bas')

  const ctx = await lancer({ env: { PATH: PATH_SANS_RIEN } })
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

/**
 * Le pendant Windows, qui dit pourquoi le cas d'à côté n'y a pas lieu.
 *
 * Le pilote ConPTY résout `powershell.exe` par chemin absolu sous
 * `%SystemRoot%`, et n'a donc jamais besoin du PATH pour ouvrir un terminal.
 * C'est ce qui rend sûre la sortie immédiate de `completerChemin()`, et ce cas
 * est là pour que cette sûreté cesse d'être une affirmation.
 *
 * Un décalage existe pourtant ici aussi, mais dans le temps plutôt que dans
 * l'espace, et il penche de l'autre côté. Un installateur écrit dans le
 * registre, l'explorateur le relit à l'ouverture de session : c'est le processus
 * déjà lancé — un terminal ouvert la veille — qui reste en retard, et
 * l'application ouverte depuis le menu Démarrer qui en sait le plus. Le pilote
 * ajoute `~/.local/bin` au PATH des terminaux qu'il lance quand `claude.exe` s'y
 * trouve, précisément pour ce cas-là.
 */
test('un terminal s’ouvre même sur un PATH réduit', async () => {
  test.skip(!SUR_WINDOWS, 'le pilote ConPTY est le seul à ne rien devoir au PATH')

  const ctx = await lancer({ env: { PATH: PATH_MAIGRE_WINDOWS } })
  try {
    await nouveauTerminal(ctx.page)
    await expect(ctx.page.locator('.xterm')).toHaveCount(1)

    // Même preuve que pour le cas d'à côté : l'invite ne s'affiche que si le
    // pty vit.
    const contenu = await attendreInvite(ctx.page, 0)
    expect(contenu).toBeTruthy()
  } finally {
    await fermer(ctx)
  }
})
