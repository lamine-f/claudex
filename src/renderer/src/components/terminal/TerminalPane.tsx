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
  const sollicitations = useStore((e) => e.sollicitations)

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
        sollicitees={new Set(Object.keys(sollicitations))}
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
          <div className="flex h-full items-center justify-center">
            {/* Le logo seul : ouvrir un terminal se fait depuis l'en-tête, la
                colonne des conversations ou ⌘T, et un bouton de plus au milieu
                de l'écran ne faisait que répéter ces chemins. */}
            <img src="./logo.png" alt="" aria-hidden className="w-32 opacity-20" />
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
