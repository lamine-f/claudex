import type { Tab } from '@shared/types'

interface Props {
  tabs: Tab[]
  actifId?: string
  onChoisir: (id: string) => void
  onFermer: (id: string) => void
  onNouveau: () => void
}

export function TerminalTabs({
  tabs,
  actifId,
  onChoisir,
  onFermer,
  onNouveau
}: Props): React.JSX.Element {
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-bordure px-2">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const actif = tab.id === actifId
          return (
            <div
              key={tab.id}
              className={`group flex h-7 shrink-0 items-center gap-1.5 rounded-md pr-1 pl-2.5 transition-colors ${
                actif ? 'bg-fond-eleve text-texte' : 'text-texte-faible hover:bg-fond-survol'
              }`}
            >
              <button
                type="button"
                onClick={() => onChoisir(tab.id)}
                className="max-w-40 truncate font-mono text-[11.5px]"
                title={tab.cwd}
              >
                {tab.title}
              </button>
              <button
                type="button"
                onClick={() => onFermer(tab.id)}
                title="Fermer l'onglet et sa session tmux"
                className="flex h-4 w-4 items-center justify-center rounded text-[11px] text-texte-faible opacity-0 transition-opacity group-hover:opacity-100 hover:bg-fond-survol hover:text-texte"
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={onNouveau}
        title="Nouveau terminal"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-texte-faible transition-colors hover:bg-fond-survol hover:text-texte"
      >
        +
      </button>
    </div>
  )
}
