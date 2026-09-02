import { useEffect } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { useShortcuts } from '@renderer/hooks/useShortcuts'
import { useStore } from '@renderer/state/store'
import { Diagnostic } from './components/layout/Diagnostic'
import { TitleBar } from './components/layout/TitleBar'
import { FilePreview } from './components/files/FilePreview'
import { FileTree } from './components/files/FileTree'
import { TerminalPane } from './components/terminal/TerminalPane'
import { WorkspaceList } from './components/workspaces/WorkspaceList'

function Poignee(): React.JSX.Element {
  return (
    <Separator className="w-px bg-bordure transition-colors hover:bg-bordure-forte data-[state=dragging]:bg-accent" />
  )
}

export default function App(): React.JSX.Element {
  const charger = useStore((e) => e.charger)
  const pret = useStore((e) => e.pret)
  useShortcuts()

  useEffect(() => {
    void charger()
  }, [charger])

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      {pret ? (
        <Group orientation="horizontal" className="min-h-0 flex-1">
          <Panel defaultSize="18%" minSize="12%" maxSize="32%">
            <WorkspaceList />
          </Panel>
          <Poignee />
          <Panel defaultSize="22%" minSize="12%" maxSize="40%">
            <FileTree />
          </Panel>
          <Poignee />
          <Panel defaultSize="60%" minSize="30%">
            <TerminalPane />
          </Panel>
        </Group>
      ) : (
        <div className="flex flex-1 items-center justify-center text-[12px] text-texte-faible">
          Chargement…
        </div>
      )}
      <FilePreview />
      <Diagnostic />
    </div>
  )
}
