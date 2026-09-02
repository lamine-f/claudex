import { useStore } from '@renderer/state/store'
import { Panneau } from '../ui/Panneau'
import { WorkspaceItem } from './WorkspaceItem'

export function WorkspaceList(): React.JSX.Element {
  const workspaces = useStore((e) => e.workspaces)
  const ajouter = useStore((e) => e.ajouterWorkspace)

  return (
    <Panneau
      titre="Workspaces"
      action={
        <button
          type="button"
          onClick={() => void ajouter()}
          title="Ajouter un projet"
          className="flex h-5 w-5 items-center justify-center rounded text-texte-faible transition-colors hover:bg-fond-survol hover:text-texte"
        >
          +
        </button>
      }
    >
      {workspaces.length === 0 ? (
        <div className="px-3 py-6 text-center">
          <p className="text-[12px] leading-relaxed text-texte-faible">
            Aucun projet pour l'instant.
          </p>
          <button
            type="button"
            onClick={() => void ajouter()}
            className="mt-3 rounded-md border border-bordure-forte px-2.5 py-1.5 text-[12px] text-texte-doux transition-colors hover:bg-fond-survol hover:text-texte"
          >
            Ajouter un dossier
          </button>
        </div>
      ) : (
        <ul className="px-1.5 pb-2">
          {workspaces.map((w) => (
            <WorkspaceItem key={w.id} workspace={w} />
          ))}
        </ul>
      )}
    </Panneau>
  )
}
