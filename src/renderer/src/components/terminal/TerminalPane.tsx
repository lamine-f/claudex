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

  const courant = workspaces.find((w) => w.id === workspaceActif)

  if (!courant) {
    return (
      <section className="flex h-full min-w-0 flex-col border-l border-bordure bg-fond">
        <div className="flex flex-1 items-center justify-center">
          <p className="font-mono text-[12px] text-texte-faible">
            Ajoute un projet pour ouvrir un terminal.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="flex h-full min-w-0 flex-col border-l border-bordure bg-fond">
      <TerminalTabs
        tabs={tabs}
        actifId={activeTabId}
        onChoisir={choisirOnglet}
        onFermer={(id) => void fermerOnglet(id)}
        onNouveau={() => void nouvelOnglet()}
      />

      <div className="relative min-h-0 flex-1">
        {tabs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <p className="font-mono text-[12px] text-texte-faible">
              Aucun terminal ouvert pour {courant.name}.
            </p>
            <button
              type="button"
              onClick={() => void nouvelOnglet()}
              className="rounded-md border border-bordure-forte px-3 py-1.5 text-[12px] text-texte-doux transition-colors hover:bg-fond-survol hover:text-texte"
            >
              Ouvrir un terminal
            </button>
          </div>
        ) : (
          tabs.map((tab) => (
            <TerminalInstance key={tab.id} tabId={tab.id} actif={tab.id === activeTabId} />
          ))
        )}
      </div>
    </section>
  )
}
