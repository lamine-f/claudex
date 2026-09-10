import { useEffect, useState } from 'react'
import type { DepotGit } from '@shared/types'
import { useStore } from '@renderer/state/store'
import { IconeChevron } from '../ui/Icones'

/** Ce qu'un dépôt a donné, tel que le processus principal le rapporte. */
interface Compte {
  depot: string
  nom: string
  fait: boolean
  message?: string
}

interface Branches {
  courante: string
  locales: string[]
  distantes: string[]
}

/**
 * Les dépôts du projet, avec leur branche et de quoi agir dessus.
 *
 * Séparés des changements, parce qu'un dépôt sans fichier modifié peut avoir
 * douze commits à pousser : il n'apparaissait alors dans aucune des deux
 * sections, et rien ne disait qu'il attendait.
 *
 * Les cases y désignent des dépôts, là où celles des changements désignent des
 * fichiers. Deux niveaux d'action, deux sélections.
 */
export function ListeDepots({ workspaceId }: { workspaceId: string }): React.JSX.Element | null {
  const git = useStore((e) => e.git)
  const coches = useStore((e) => e.depotsCoches)
  const cocher = useStore((e) => e.cocherDepots)
  const replie = useStore((e) => (e.depotsReplies[workspaceId] ?? []).includes('depots:'))
  const replier = useStore((e) => e.replierDepot)
  const rafraichirGit = useStore((e) => e.rafraichirGit)

  const [branches, setBranches] = useState<Record<string, Branches>>({})
  const [enCours, setEnCours] = useState<'pousse' | 'bascule' | null>(null)
  const [comptes, setComptes] = useState<Compte[] | null>(null)
  const [cible, setCible] = useState<string | null>(null)

  const depots = git?.depots ?? []

  useEffect(() => {
    let vivant = true
    void window.claudex.git.branches(workspaceId).then((lues) => {
      if (vivant) setBranches(lues)
    })
    return () => {
      vivant = false
    }
    // Les branches suivent l'état : après un commit ou un changement de branche,
    // l'avance a bougé et la courante peut-être aussi.
  }, [workspaceId, git])

  if (depots.length === 0) return null

  const choisis = depots.filter((d) => coches.includes(d.chemin))
  const tout = depots.length > 0 && depots.every((d) => coches.includes(d.chemin))

  /** Ce que les dépôts choisis ont en commun comme branches où aller. */
  const communes = (): string[] => {
    if (choisis.length === 0) return []
    const listes = choisis.map((d) => {
      const b = branches[d.chemin]
      return new Set([...(b?.locales ?? []), ...(b?.distantes ?? [])])
    })
    return [...(listes[0] ?? [])].filter((nom) => listes.every((l) => l.has(nom))).sort()
  }

  const agir = async (quoi: 'pousse' | 'bascule', branche?: string): Promise<void> => {
    setEnCours(quoi)
    setComptes(null)
    try {
      const chemins = choisis.map((d) => d.chemin)
      setComptes(
        quoi === 'pousse'
          ? await window.claudex.git.pousser(workspaceId, chemins)
          : await window.claudex.git.changerBranche(workspaceId, chemins, branche ?? '')
      )
      await rafraichirGit()
    } finally {
      setEnCours(null)
      setCible(null)
    }
  }

  return (
    <li>
      <div className="flex h-9 items-stretch gap-1.5 pr-2 pl-1.5 transition-colors hover:bg-fond-survol">
        <Case
          cochee={tout}
          partielle={!tout && choisis.length > 0}
          libelle="Tout cocher dans Dépôts"
          onBasculer={() => cocher(depots.map((d) => d.chemin), !tout)}
        />
        <button
          type="button"
          onClick={() => replier(workspaceId, 'depots:')}
          aria-expanded={!replie}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-0.5 text-left"
        >
          <span
            aria-hidden
            className={`flex h-5 w-5 shrink-0 items-center justify-center text-texte-tenu transition-transform ${
              replie ? '' : 'rotate-90'
            }`}
          >
            <IconeChevron taille={13} />
          </span>
          <span className="min-w-0 truncate text-[13px] text-texte">Dépôts</span>
          <span className="ml-auto shrink-0 font-mono text-[10.5px] text-texte-tenu">
            {depots.length}
          </span>
        </button>
      </div>

      <ul hidden={replie} aria-label="Dépôts">
        {depots.map((depot) => (
          <Ligne
            key={depot.chemin}
            depot={depot}
            branche={branches[depot.chemin]?.courante}
            cochee={coches.includes(depot.chemin)}
            onBasculer={() => cocher([depot.chemin], !coches.includes(depot.chemin))}
          />
        ))}
      </ul>

      {!replie && choisis.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-2">
          <span className="font-mono text-[10.5px] text-texte-tenu">
            {choisis.length} dépôt{choisis.length > 1 ? 's' : ''}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            disabled={enCours !== null}
            onClick={() => void agir('pousse')}
            title="Pousser les dépôts cochés vers leur amont"
            className="rounded-md border border-bordure px-2.5 py-1 text-[11.5px] text-texte-doux transition-colors hover:bg-fond-survol disabled:opacity-35"
          >
            {enCours === 'pousse' ? 'envoi…' : 'Pousser'}
          </button>
          <button
            type="button"
            disabled={enCours !== null || communes().length === 0}
            onClick={() => setCible(cible === null ? '' : null)}
            title={
              communes().length === 0
                ? 'Ces dépôts n’ont aucune branche en commun'
                : 'Changer de branche dans les dépôts cochés'
            }
            className="rounded-md border border-bordure px-2.5 py-1 text-[11.5px] text-texte-doux transition-colors hover:bg-fond-survol disabled:opacity-35"
          >
            {enCours === 'bascule' ? 'bascule…' : 'Changer de branche'}
          </button>
        </div>
      )}

      {cible !== null && (
        // Seules les branches que tous les dépôts choisis portent : proposer
        // celles d'un seul ferait échouer les autres sans qu'on ait pu le voir.
        <ul aria-label="Branches communes" className="flex flex-col px-2.5 pb-2">
          {communes().map((nom) => (
            <li key={nom}>
              <button
                type="button"
                onClick={() => void agir('bascule', nom)}
                className="w-full truncate rounded px-2 py-1 text-left font-mono text-[11.5px] text-texte-doux transition-colors hover:bg-fond-survol hover:text-texte"
              >
                {nom}
              </button>
            </li>
          ))}
        </ul>
      )}

      {comptes && (
        <ul aria-label="Compte rendu des dépôts" className="flex flex-col gap-1 px-2.5 pb-2">
          {comptes.map((compte) => (
            <li key={compte.depot} className="flex items-baseline gap-1.5 text-[11.5px]">
              <span className={`shrink-0 ${compte.fait ? 'text-succes' : 'text-erreur'}`}>
                {compte.fait ? '✓' : '✕'}
              </span>
              <span className="shrink-0 font-mono text-texte-doux">{compte.nom}</span>
              {compte.message && (
                <span className="min-w-0 flex-1 font-mono text-[10.5px] whitespace-pre-wrap text-texte-tenu">
                  {compte.message}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

/** Un dépôt, sa branche et ce qui l'attend. */
function Ligne({
  depot,
  branche,
  cochee,
  onBasculer
}: {
  depot: DepotGit
  branche?: string
  cochee: boolean
  onBasculer: () => void
}): React.JSX.Element {
  return (
    <li className="flex items-stretch gap-1.5 pr-2 pl-1.5 transition-colors hover:bg-fond-survol">
      <span aria-hidden className="flex shrink-0">
        <span className="ml-[9px] w-[11px] shrink-0 border-l border-separateur" />
      </span>
      <Case cochee={cochee} libelle={depot.nom} onBasculer={onBasculer} />
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5 py-2">
        <span className="shrink-0 truncate text-[13px] text-texte-doux">{depot.nom}</span>
        <span className="shrink-0 font-mono text-[10.5px] text-texte-tenu">
          {branche ?? depot.branche ?? '…'}
        </span>
        {depot.avance > 0 && (
          <span
            title={`${depot.avance} commit(s) à pousser`}
            className="shrink-0 font-mono text-[10.5px] text-attention"
          >
            ↑{depot.avance}
          </span>
        )}
        {depot.retard > 0 && (
          <span
            title={`${depot.retard} commit(s) à récupérer`}
            className="shrink-0 font-mono text-[10.5px] text-info"
          >
            ↓{depot.retard}
          </span>
        )}
        {!depot.amont && (
          <span title="Cette branche n’a pas d’amont" className="shrink-0 font-mono text-[10.5px] text-texte-tenu">
            sans amont
          </span>
        )}
      </span>
    </li>
  )
}

/** La même case que celle des changements, à l'identique. */
function Case({
  cochee,
  partielle,
  libelle,
  onBasculer
}: {
  cochee: boolean
  partielle?: boolean
  libelle: string
  onBasculer: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={partielle ? 'mixed' : cochee}
      aria-label={libelle}
      onClick={onBasculer}
      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center self-center rounded-[3px] border transition-colors ${
        cochee || partielle
          ? 'border-projet bg-projet text-fond'
          : 'border-bordure hover:border-texte-tenu'
      }`}
    >
      {cochee && (
        <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
          <path
            d="M2.5 6.2 4.8 8.5 9.5 3.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {partielle && !cochee && <span aria-hidden className="h-[2px] w-2 rounded-full bg-fond" />}
    </button>
  )
}
