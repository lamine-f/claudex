import { useEffect } from 'react'
import { estMac } from '@renderer/plateforme'
import { useStore } from '@renderer/state/store'
import {
  IconeBranche,
  IconeEtincelle,
  IconeModifie,
  IconeNonSuivi,
  IconePanneauColonne,
  IconePanneauProjets,
  IconeTerminal
} from '../ui/Icones'

/**
 * Bande supérieure : où l'on est, et dans quel état.
 *
 * Elle porte tout le contexte permanent. Une seconde bande en bas doublait le
 * chrome et prenait de la hauteur au terminal pour des informations qui
 * tiennent ici.
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
    <span
      className="flex items-center gap-1.5 font-mono text-[11px] text-texte-faible"
      title={titre}
    >
      <span className="text-texte-tenu">{icone}</span>
      {valeur}
    </span>
  )
}

function BoutonRepli({
  actif,
  titre,
  icone,
  onBasculer
}: {
  actif: boolean
  titre: string
  icone: React.ReactNode
  onBasculer: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onBasculer}
      title={titre}
      aria-label={titre}
      aria-pressed={!actif}
      className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-fond-survol ${
        actif ? 'text-texte-tenu' : 'text-texte-doux'
      }`}
    >
      {icone}
    </button>
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
  const layout = useStore((e) => e.layout)
  const replier = useStore((e) => e.replier)
  const ouvrirDiagnostic = useStore((e) => e.ouvrirDiagnostic)

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
  const soucis = diagnostics.filter((d) => d.severity !== 'ok').length

  // Les 88 px de gauche laissent la place aux feux du système, que macOS pose
  // sur cette barre. Ailleurs la fenêtre garde son cadre, les feux sont dessus,
  // et le retrait ne ferait qu'un trou au bord de la barre.
  return (
    <header
      className={`zone-glissable relative flex h-9 shrink-0 items-center gap-2 border-b border-separateur pr-4 ${estMac ? 'pl-[88px]' : 'pl-2'}`}
    >
      <BoutonRepli
        actif={Boolean(layout.railReplie)}
        titre={layout.railReplie ? 'Afficher les projets' : 'Masquer les projets'}
        icone={<IconePanneauProjets taille={15} />}
        onBasculer={() => replier('rail')}
      />
      <BoutonRepli
        actif={Boolean(layout.colonneRepliee)}
        titre={layout.colonneRepliee ? 'Afficher la colonne' : 'Masquer la colonne'}
        icone={<IconePanneauColonne taille={15} />}
        onBasculer={() => replier('colonne')}
      />

      {courant && (
        <>
          <span className="ml-1 shrink-0 font-mono text-[12.5px] text-texte-faible">
            {courant.name}
          </span>
          {onglet && (
            <>
              <span className="shrink-0 text-texte-tenu">/</span>
              <span className="truncate text-[13.5px] font-medium text-texte">{onglet.title}</span>
            </>
          )}
        </>
      )}

      {/* Centré sur la fenêtre, non sur la place qui reste : le nom doit tomber
          au milieu quel que soit ce qui l'entoure. */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[13px] text-texte-tenu"
      >
        Claudex
      </span>

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

        {/* L'état de l'environnement tient dans une pastille : c'est une veilleuse,
            qu'on ne consulte que lorsqu'elle change de couleur. */}
        <button
          type="button"
          onClick={() => ouvrirDiagnostic(true)}
          title={
            soucis > 0
              ? `${soucis} point${soucis > 1 ? 's' : ''} à voir dans l'environnement`
              : 'Environnement en ordre'
          }
          aria-label="État de l'environnement"
          className="ml-1 flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-fond-survol"
        >
          <span
            className={`h-[7px] w-[7px] rounded-full ${soucis > 0 ? 'bg-attention' : 'bg-succes'}`}
          />
        </button>
      </div>
    </header>
  )
}
