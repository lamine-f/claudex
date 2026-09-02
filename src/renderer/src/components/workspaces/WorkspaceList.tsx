import { useEffect } from 'react'
import { useStore } from '@renderer/state/store'
import { Panneau } from '../ui/Panneau'
import { WorkspaceItem } from './WorkspaceItem'

export function WorkspaceList(): React.JSX.Element {
  const workspaces = useStore((e) => e.workspaces)
  const ajouter = useStore((e) => e.ajouterWorkspace)
  const chargerSessions = useStore((e) => e.chargerSessions)

  // Une conversation lancée à la main dans un terminal doit apparaître ici sans
  // qu'on ait à replier puis redéplier le projet.
  useEffect(
    () =>
      window.claudex.claude.onSessionDetectee((chemin) => {
        const cible = useStore.getState().workspaces.find((w) => w.path === chemin)
        if (cible) void chargerSessions(cible.id)
      }),
    [chargerSessions]
  )

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
