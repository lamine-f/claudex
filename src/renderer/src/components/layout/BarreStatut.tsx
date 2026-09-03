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
 * Bande inférieure : le contexte permanent, jamais le contenu.
 *
 * Réduite à des icônes et des valeurs. Écrite en toutes lettres — « 2 fichiers
 * non suivis », « Claude Code 2.1.259 » — elle occupait la moitié de la largeur
 * pour dire ce qu'un pictogramme et un nombre disent aussi bien ; le sens
 * complet reste au survol.
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
    <span className="flex items-center gap-1.5" title={titre}>
      <span className="text-texte-tenu">{icone}</span>
      <span>{valeur}</span>
    </span>
  )
}

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

  /** Numéro de version d'un outil, tel que le diagnostic l'a relevé. */
  const version = (id: string): string | undefined =>
    diagnostics.find((d) => d.id === id && d.severity === 'ok')?.detail?.match(/\d[\w.-]*/)?.[0]

  const tmux = version('tmux')
  const claude = version('claude')

  return (
    <footer className="flex h-[38px] shrink-0 items-center gap-4 border-t border-separateur px-5 font-mono text-[11.5px] text-texte-faible">
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

      <div className="flex-1" />

      {tmux && <Mesure icone={<IconeTerminal />} valeur={tmux} titre={`tmux ${tmux}`} />}
      {claude && (
        <Mesure icone={<IconeEtincelle />} valeur={claude} titre={`Claude Code ${claude}`} />
      )}
      <span className="text-texte-tenu" title="Nouveau terminal">
        ⌘T
      </span>
    </footer>
  )
}
