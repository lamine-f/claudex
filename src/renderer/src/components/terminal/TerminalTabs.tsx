import { useState } from 'react'
import type { Tab } from '@shared/types'
import { raccourci } from '@renderer/systeme'
import { MenuContextuel, type Action } from '../ui/MenuContextuel'
import { IconeAttente, IconeBifurquer, IconeFermer, IconePlus } from '../ui/Icones'

interface Props {
  tabs: Tab[]
  /** Vrai quand une vue occupe l'écran à la place du terminal. */
  vueOuverte?: boolean
  /** Conversations qui réclament leur utilisateur, par identifiant de session. */
  sollicitees: Set<string>
  actifId?: string
  onChoisir: (id: string) => void
  onFermer: (id: string) => void
  onFermerPlusieurs: (ids: string[]) => void
  onNouveau: () => void
  onBifurquer: (tab: Tab) => void
}

/**
 * En-tête du terminal : les onglets ouverts, et ce qu'on peut faire de celui
 * qui est actif. La bifurcation n'a de sens que sur une conversation, pas sur
 * un shell nu — elle n'apparaît donc que là.
 */
export function TerminalTabs({
  tabs,
  vueOuverte,
  sollicitees,
  actifId,
  onChoisir,
  onFermer,
  onFermerPlusieurs,
  onNouveau,
  onBifurquer
}: Props): React.JSX.Element {
  // Rien à bifurquer quand on regarde une vue : ce n'est pas une conversation.
  const actif = vueOuverte ? undefined : tabs.find((t) => t.id === actifId)
  const [menu, setMenu] = useState<{ x: number; y: number; actions: Action[] } | null>(null)

  /**
   * Ce que le clic droit propose sur un onglet.
   *
   * Les comptes sont écrits dans les intitulés : fermer un onglet détruit sa
   * session et l'agent qui y travaille, et « fermer les autres » n'a pas le
   * même poids selon qu'il y en a un ou sept.
   */
  const actionsDe = (tab: Tab): Action[] => {
    const rang = tabs.findIndex((t) => t.id === tab.id)
    const autres = tabs.filter((t) => t.id !== tab.id).map((t) => t.id)
    const gauche = tabs.slice(0, rang).map((t) => t.id)
    const droite = tabs.slice(rang + 1).map((t) => t.id)
    const pluriel = (n: number): string => (n > 1 ? 's' : '')

    return [
      { libelle: `Fermer (${raccourci('W')})`, ecarte: true, onChoisir: () => onFermer(tab.id) },
      ...(autres.length > 0
        ? [
            {
              libelle: `Fermer les ${autres.length} autre${pluriel(autres.length)}`,
              ecarte: true,
              onChoisir: () => onFermerPlusieurs(autres)
            }
          ]
        : []),
      ...(gauche.length > 0
        ? [
            {
              libelle: `Fermer les ${gauche.length} de gauche`,
              ecarte: true,
              onChoisir: () => onFermerPlusieurs(gauche)
            }
          ]
        : []),
      ...(droite.length > 0
        ? [
            {
              libelle: `Fermer les ${droite.length} de droite`,
              ecarte: true,
              onChoisir: () => onFermerPlusieurs(droite)
            }
          ]
        : []),
      ...(tabs.length > 1
        ? [
            {
              libelle: `Fermer les ${tabs.length} onglets`,
              ecarte: true,
              onChoisir: () => onFermerPlusieurs(tabs.map((t) => t.id))
            }
          ]
        : [])
    ]
  }

  return (
    <div className="flex h-14 shrink-0 items-center gap-1.5 border-b border-separateur px-3.5">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const courant = tab.id === actifId
          return (
            <div
              key={tab.id}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu({ x: e.clientX, y: e.clientY, actions: actionsDe(tab) })
              }}
              className={`group flex h-9 shrink-0 items-center gap-2 rounded-lg pr-2 pl-3 transition-colors ${
                courant ? 'bg-fond-eleve' : 'hover:bg-fond-survol'
              }`}
            >
              {tab.claudeSessionId &&
                (sollicitees.has(tab.claudeSessionId) ? (
                  // La main levée remplace la pastille : à cette taille, une
                  // couleur de plus se confond, une forme de plus se voit.
                  <span
                    aria-label="Vous attend"
                    title="Cet agent attend une réponse"
                    className="shrink-0 text-attention"
                  >
                    <IconeAttente taille={12} />
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className={`h-[6px] w-[6px] shrink-0 rounded-full ${
                      courant ? 'bg-projet' : 'bg-texte-tenu'
                    }`}
                  />
                ))}
              <button
                type="button"
                // L'onglet regardé se dit, plutôt que de se deviner à sa
                // couleur. `aria-current` suffit là où `role="tab"` promettrait
                // une navigation aux flèches que la barre n'offre pas.
                aria-current={courant ? 'true' : undefined}
                onClick={() => onChoisir(tab.id)}
                className={`max-w-56 truncate text-[13.5px] ${
                  courant ? 'text-texte' : 'text-texte-faible'
                }`}
                title={tab.cwd}
              >
                {tab.title}
              </button>
              <button
                type="button"
                onClick={() => onFermer(tab.id)}
                title="Fermer l'onglet et sa session"
                className="flex h-4 w-4 items-center justify-center rounded text-texte-tenu opacity-0 transition-opacity group-hover:opacity-100 hover:text-texte focus-visible:opacity-100"
              >
                <IconeFermer taille={11} />
              </button>
            </div>
          )
        })}

      </div>

      {actif?.claudeSessionId && (
        <button
          type="button"
          onClick={() => onBifurquer(actif)}
          title="Bifurquer : repartir de ce contexte sans toucher à la conversation d'origine"
          className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-[13.5px] text-texte-doux transition-colors hover:bg-fond-survol hover:text-accent"
        >
          <IconeBifurquer taille={14} />
          Bifurquer
        </button>
      )}

      <button
        type="button"
        onClick={onNouveau}
        title={`Nouveau terminal (${raccourci('T')})`}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-texte-faible transition-colors hover:bg-fond-survol hover:text-texte"
      >
        <IconePlus taille={16} />
      </button>

      {menu && (
        <MenuContextuel
          x={menu.x}
          y={menu.y}
          actions={menu.actions}
          intitule="Actions de l’onglet"
          onFermer={() => setMenu(null)}
        />
      )}
    </div>
  )
}
