import { useStore } from '@renderer/state/store'
import { TerminalInstance } from './TerminalInstance'
import { TerminalTabs } from './TerminalTabs'

export function TerminalPane(): React.JSX.Element {
  const workspaces = useStore((e) => e.workspaces)
  const workspaceActif = useStore((e) => e.activeWorkspaceId)
  const tabs = useStore((e) => e.tabs)
  const activeTabId = useStore((e) => e.activeTabId)
  const nouvelOnglet = useStore((e) => e.nouvelOnglet)
  const choisirOnglet = useStore((e) => e.choisirOnglet)
  const fermerOnglet = useStore((e) => e.fermerOnglet)
  const demanderBifurcation = useStore((e) => e.demanderBifurcation)

  const courant = workspaces.find((w) => w.id === workspaceActif)

  if (!courant) {
    return (
      <section className="flex h-full min-w-0 flex-col bg-fond">
        <div className="flex flex-1 items-center justify-center">
          <p className="font-mono text-[12px] text-texte-faible">
            Ajoute un projet pour ouvrir un terminal.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="flex h-full min-w-0 flex-col bg-fond">
      <TerminalTabs
        tabs={tabs}
        actifId={activeTabId}
        onChoisir={choisirOnglet}
        onFermer={(id) => void fermerOnglet(id)}
        onNouveau={() => void nouvelOnglet()}
        onBifurquer={(tab) =>
          tab.claudeSessionId &&
          demanderBifurcation(tab.workspaceId, tab.claudeSessionId, tab.title)
        }
      />

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {tabs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-5">
            {/* Un écran vide dit qu'il ne se passe rien ; le logo dit où l'on
                est. La marque a sa place là où il n'y a rien d'autre. */}
            <img src="./logo.png" alt="" aria-hidden className="w-28 opacity-25" />
            <p className="font-mono text-[12.5px] text-texte-tenu">
              Aucun terminal ouvert pour {courant.name}.
            </p>
            <button
              type="button"
              onClick={() => void nouvelOnglet()}
              className="rounded-lg border border-bordure px-4 py-2 text-[13px] text-texte-doux transition-colors hover:border-accent-tenu hover:bg-fond-survol hover:text-accent"
            >
              Ouvrir un terminal
            </button>
          </div>
        ) : (
          tabs.map((tab) => (
            <TerminalInstance
              key={tab.id}
              tab={tab}
              actif={tab.id === activeTabId}
              onFermer={() => void fermerOnglet(tab.id)}
            />
          ))
        )}
      </div>
    </section>
  )
}
