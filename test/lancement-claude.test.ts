import { describe, expect, it } from 'vitest'
import { lancementClaude } from '../src/main/services/git'

/**
 * La façon de lancer Claude Code, qui n'est pas la même partout.
 *
 * Éprouvée ici plutôt que de bout en bout : la branche Windows ne s'exécute
 * pas sur les deux autres systèmes, et c'est justement celle qui a fait tomber
 * quatre cas de rédaction sur cette plateforme.
 */
describe('lancement de Claude Code', () => {
  it('lance la commande telle quelle hors de Windows', () => {
    expect(lancementClaude('claude', 'darwin')).toEqual({ commande: 'claude', shell: false })
    expect(lancementClaude('/opt/bin/claude', 'linux')).toEqual({
      commande: '/opt/bin/claude',
      shell: false
    })
  })

  it('lance un exécutable Windows directement', () => {
    // L'installateur natif dépose un `.exe`, que `spawn` sait démarrer seul.
    expect(lancementClaude('C:\\Users\\x\\.local\\bin\\claude.exe', 'win32')).toEqual({
      commande: 'C:\\Users\\x\\.local\\bin\\claude.exe',
      shell: false
    })
  })

  it('passe par l’interpréteur pour ce qui n’est pas un exécutable', () => {
    // npm installe un `.cmd`, que `spawn` ne démarre pas sans lui.
    expect(lancementClaude('claude.cmd', 'win32')).toEqual({
      commande: '"claude.cmd"',
      shell: true
    })
  })

  it('cite le chemin, que l’interpréteur couperait à l’espace', () => {
    expect(lancementClaude('C:\\Program Files\\claude\\claude.cmd', 'win32').commande).toBe(
      '"C:\\Program Files\\claude\\claude.cmd"'
    )
  })

  it('reconnaît l’extension quelle qu’en soit la casse', () => {
    expect(lancementClaude('C:\\bin\\CLAUDE.EXE', 'win32').shell).toBe(false)
  })
})
