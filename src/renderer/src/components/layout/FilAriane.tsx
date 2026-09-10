import { useEffect } from 'react'
import { useStore } from '@renderer/state/store'
import { SUR_MAC } from '@renderer/systeme'
import {
  IconeBranche,
  IconeDepots,
  IconeEtincelle,
  IconeModifie,
  IconeServices,
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
  titre,
  teinte
}: {
  icone: React.ReactNode
  valeur: string
  titre: string
  /** Couleur du chiffre, quand il porte plus qu'un compte. */
  teinte?: string
}): React.JSX.Element {
  return (
    <span
      className={`flex items-center gap-1.5 font-mono text-[11px] ${teinte ?? 'text-texte-faible'}`}
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
  const services = useStore((e) => (e.activeWorkspaceId ? e.services[e.activeWorkspaceId] : undefined))
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

  const terminal = diagnostics.find((d) => d.id === 'multiplexeur' && d.severity === 'ok')
  const versionTerminal = terminal?.detail?.match(/\d[\w.-]*/)?.[0]
  const claude = version('claude')
  const soucis = diagnostics.filter((d) => d.severity !== 'ok').length

  // Les feux du système sont posés en haut à gauche, dans la barre elle-même, et
  // il faut leur laisser la place. Windows dessine son propre cadre au-dessus :
  // réserver ces 88 px y creuserait un trou que rien ne vient remplir.
  return (
    <header
      className={`zone-glissable relative flex h-9 shrink-0 items-center gap-2 border-b border-separateur pr-4 ${
        SUR_MAC ? 'pl-[88px]' : 'pl-2'
      }`}
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
        // Le fil vit dans sa propre boîte rétrécissable. Sans `min-w-0`, un
        // titre d'onglet un peu long ne peut pas se couper : il pousse la
        // barre du haut, et la fenêtre avec elle.
        <div className="flex min-w-0 items-center gap-2">
          <span className="ml-1 shrink-0 font-mono text-[12.5px] text-texte-faible">
            {courant.name}
          </span>
          {onglet && (
            <>
              <span className="shrink-0 text-texte-tenu">/</span>
              <span className="truncate text-[13.5px] font-medium text-texte">{onglet.title}</span>
            </>
          )}
        </div>
      )}

      <div className="min-w-4 flex-1" />

      <div className="flex shrink-0 items-center gap-3.5">
        {/* Une seule mesure pour tous les services : neuf pastilles séparées
            seraient illisibles, un chiffre se lit sans s'arrêter. Elle ne
            paraît que là où des services sont déclarés. */}
        {services && services.length > 0 && (
          <Mesure
            icone={<IconeServices />}
            valeur={`${services.filter((s) => s.etat !== 'arrete').length}/${services.length}`}
            titre={
              services.some((s) => s.reproche)
                ? 'Services en marche. Une déclaration est incomplète.'
                : 'Services en marche sur ceux qui sont déclarés'
            }
            teinte={services.some((s) => s.reproche) ? 'text-attention' : undefined}
          />
        )}
        {/* Un projet peut porter seize dépôts sur trois branches. Le compte de
            ceux qui ont des changements se lit d'un coup d'œil, là où seize
            pastilles ne diraient rien. */}
        {git && git.depots.length > 1 && (
          <Mesure
            icone={<IconeDepots />}
            valeur={`${git.depots.filter((d) => d.fichiers.length > 0).length}/${git.depots.length}`}
            titre={`${git.depots.filter((d) => d.fichiers.length > 0).length} dépôt(s) avec des changements, sur ${git.depots.length}`}
          />
        )}
        {git?.branche && (
          <Mesure
            icone={<IconeBranche />}
            valeur={git.branche}
            titre={
              git.depots.length > 1
                ? 'Branche commune aux dépôts du projet'
                : 'Branche courante'
            }
          />
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
        {versionTerminal && (
          <Mesure
            icone={<IconeTerminal />}
            valeur={versionTerminal}
            titre={`${terminal?.label} ${versionTerminal}`}
          />
        )}
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
