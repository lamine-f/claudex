import { useEffect } from 'react'
import { useStore } from '@renderer/state/store'
import {
  IconeBranche,
  IconeEtincelle,
  IconeModifie,
  IconeNonSuivi,
  IconeTerminal
} from '../ui/Icones'

/**
 * Bande supérieure : où l'on est, et dans quel état.
 *
 * Elle porte tout le contexte permanent. Une seconde bande en bas doublait le
 * chrome et prenait de la hauteur au terminal pour des informations qui
 * tiennent ici, à droite d'un fil d'ariane par nature court.
 */
function Mesure({
  icone,
  valeur,
  titre
}: {
  icone: React.ReactNode
  valeur: string
  titre: string
}): React.JSX.Element {
  return (
    <span className="flex items-center gap-1.5 font-mono text-[11px] text-texte-faible" title={titre}>
      <span className="text-texte-tenu">{icone}</span>
      {valeur}
    </span>
  )
}

export function FilAriane(): React.JSX.Element {
  const workspaces = useStore((e) => e.workspaces)
  const actif = useStore((e) => e.activeWorkspaceId)
  const tabs = useStore((e) => e.tabs)
  const activeTabId = useStore((e) => e.activeTabId)
  const git = useStore((e) => e.git)
  const diagnostics = useStore((e) => e.diagnostics)
  const rafraichirGit = useStore((e) => e.rafraichirGit)

  const courant = workspaces.find((w) => w.id === actif)
  const onglet = tabs.find((t) => t.id === activeTabId)

  // L'état git bouge à chaque commande de l'agent : le relire régulièrement
  // évite d'afficher une branche qu'on a quittée depuis longtemps.
  useEffect(() => {
    if (!actif) return
    const minuterie = setInterval(() => void rafraichirGit(), 15_000)
    return () => clearInterval(minuterie)
  }, [actif, rafraichirGit])

  /** Numéro de version d'un outil, tel que le diagnostic l'a relevé. */
  const version = (id: string): string | undefined =>
    diagnostics.find((d) => d.id === id && d.severity === 'ok')?.detail?.match(/\d[\w.-]*/)?.[0]

  const tmux = version('tmux')
  const claude = version('claude')

  return (
    <header className="zone-glissable flex h-11 shrink-0 items-center gap-2.5 border-b border-separateur pr-5 pl-[92px]">
      {courant && (
        <>
          <span className="shrink-0 font-mono text-[12.5px] text-texte-faible">{courant.name}</span>
          {onglet && (
            <>
              <span className="shrink-0 text-texte-tenu">/</span>
              <span className="truncate text-[13.5px] font-medium text-texte">{onglet.title}</span>
            </>
          )}
        </>
      )}

      <div className="min-w-4 flex-1" />

      <div className="flex shrink-0 items-center gap-3.5">
        {git?.branche && (
          <Mesure icone={<IconeBranche />} valeur={git.branche} titre="Branche courante" />
        )}
        {git && git.modifies > 0 && (
          <Mesure
            icone={<IconeModifie />}
            valeur={String(git.modifies)}
            titre={`${git.modifies} fichier${git.modifies > 1 ? 's' : ''} modifié${
              git.modifies > 1 ? 's' : ''
            }`}
          />
        )}
        {git && git.nonSuivis > 0 && (
          <Mesure
            icone={<IconeNonSuivi />}
            valeur={String(git.nonSuivis)}
            titre={`${git.nonSuivis} fichier${git.nonSuivis > 1 ? 's' : ''} non suivi${
              git.nonSuivis > 1 ? 's' : ''
            }`}
          />
        )}
        {tmux && <Mesure icone={<IconeTerminal />} valeur={tmux} titre={`tmux ${tmux}`} />}
        {claude && (
          <Mesure icone={<IconeEtincelle />} valeur={claude} titre={`Claude Code ${claude}`} />
        )}
      </div>
    </header>
  )
}
