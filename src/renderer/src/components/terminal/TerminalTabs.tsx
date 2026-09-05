import type { Tab } from '@shared/types'
import { raccourci } from '@renderer/systeme'
import { IconeAttente, IconeBifurquer, IconeFermer, IconePlus } from '../ui/Icones'

interface Props {
  tabs: Tab[]
  /** Conversations qui réclament leur utilisateur, par identifiant de session. */
  sollicitees: Set<string>
  actifId?: string
  onChoisir: (id: string) => void
  onFermer: (id: string) => void
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
  sollicitees,
  actifId,
  onChoisir,
  onFermer,
  onNouveau,
  onBifurquer
}: Props): React.JSX.Element {
  const actif = tabs.find((t) => t.id === actifId)

  return (
    <div className="flex h-14 shrink-0 items-center gap-1.5 border-b border-separateur px-3.5">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const courant = tab.id === actifId
          return (
            <div
              key={tab.id}
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
    </div>
  )
}
