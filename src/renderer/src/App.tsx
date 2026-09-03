import { useEffect } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { useShortcuts } from '@renderer/hooks/useShortcuts'
import { useStore } from '@renderer/state/store'
import { BarreStatut } from './components/layout/BarreStatut'
import { ColonneLaterale } from './components/layout/ColonneLaterale'
import { Diagnostic } from './components/layout/Diagnostic'
import { FilAriane } from './components/layout/FilAriane'
import { FilePreview } from './components/files/FilePreview'
import { Rail } from './components/rail/Rail'
import { TerminalPane } from './components/terminal/TerminalPane'

function Poignee(): React.JSX.Element {
  return (
    <Separator className="w-px bg-separateur transition-colors hover:bg-bordure data-[state=dragging]:bg-accent" />
  )
}

export default function App(): React.JSX.Element {
  const charger = useStore((e) => e.charger)
  const pret = useStore((e) => e.pret)
  useShortcuts()

  useEffect(() => {
    void charger()
  }, [charger])

  // Une conversation lancée à la main dans un terminal doit rejoindre la colonne
  // sans qu'on ait à changer de projet pour la voir.
  useEffect(
    () =>
      window.claudex.claude.onSessionDetectee((chemin) => {
        const etat = useStore.getState()
        const cible = etat.workspaces.find((w) => w.path === chemin)
        if (cible) void etat.chargerSessions(cible.id)
      }),
    []
  )

  return (
    // Trois bandes : où l'on est, ce qu'on fait, dans quel état est le projet.
    <div className="grid h-full grid-rows-[56px_1fr_38px]">
      <FilAriane />

      {pret ? (
        <div className="flex min-h-0">
          <Rail />
          <Group orientation="horizontal" className="min-h-0 flex-1">
            <Panel defaultSize="26%" minSize="16%" maxSize="42%">
              <ColonneLaterale />
            </Panel>
            <Poignee />
            <Panel defaultSize="74%" minSize="40%">
              <TerminalPane />
            </Panel>
          </Group>
        </div>
      ) : (
        <div className="flex items-center justify-center text-[12px] text-texte-faible">
          Chargement…
        </div>
      )}

      <BarreStatut />
      <FilePreview />
      <Diagnostic />
    </div>
  )
}
