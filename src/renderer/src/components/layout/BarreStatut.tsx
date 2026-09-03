import { useEffect } from 'react'
import { useStore } from '@renderer/state/store'

/**
 * Bande inférieure : le contexte permanent, jamais le contenu.
 *
 * Ce qu'on veut savoir sans le demander — sur quelle branche on travaille, ce
 * qui n'est pas commité, quelles versions tournent.
 */
export function BarreStatut(): React.JSX.Element {
  const git = useStore((e) => e.git)
  const diagnostics = useStore((e) => e.diagnostics)
  const rafraichirGit = useStore((e) => e.rafraichirGit)
  const actif = useStore((e) => e.activeWorkspaceId)

  // L'état git bouge à chaque commande de l'agent : le relire régulièrement
  // évite d'afficher une branche qu'on a quittée depuis longtemps.
  useEffect(() => {
    if (!actif) return
    const minuterie = setInterval(() => void rafraichirGit(), 15_000)
    return () => clearInterval(minuterie)
  }, [actif, rafraichirGit])

  /**
   * Version d'un outil, sous une forme lisible.
   *
   * Le diagnostic renvoie ce que la commande a répondu — « tmux 3.7c », mais
   * « 2.1.259 (Claude Code) » — et cette seconde forme se lit mal dans une bande
   * de contexte. On la remet à l'endroit.
   */
  const version = (id: string, nom: string): string | undefined => {
    const brut = diagnostics.find((d) => d.id === id && d.severity === 'ok')?.detail
    if (!brut) return undefined
    const numero = brut.match(/\d[\w.-]*/)?.[0]
    return numero ? `${nom} ${numero}` : brut
  }

  const morceaux = [
    git?.branche,
    git && git.nonSuivis > 0
      ? `${git.nonSuivis} fichier${git.nonSuivis > 1 ? 's' : ''} non suivi${git.nonSuivis > 1 ? 's' : ''}`
      : undefined,
    git && git.modifies > 0
      ? `${git.modifies} modifié${git.modifies > 1 ? 's' : ''}`
      : undefined,
    version('tmux', 'tmux'),
    version('claude', 'Claude Code')
  ].filter(Boolean)

  return (
    <footer className="flex h-[38px] shrink-0 items-center gap-5 border-t border-separateur px-5 font-mono text-[11.5px] text-texte-tenu">
      {morceaux.map((m) => (
        <span key={m}>{m}</span>
      ))}
      <div className="flex-1" />
      <span>⌘T nouveau terminal</span>
    </footer>
  )
}
