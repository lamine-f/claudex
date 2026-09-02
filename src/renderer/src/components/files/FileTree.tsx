import { useStore } from '@renderer/state/store'
import { Panneau } from '../ui/Panneau'

/** Phase 4 : arborescence réelle avec chokidar et virtualisation.
 *  Pour l'instant, la colonne existe et affiche le contexte courant. */
export function FileTree(): React.JSX.Element {
  const workspaces = useStore((e) => e.workspaces)
  const actif = useStore((e) => e.activeWorkspaceId)
  const courant = workspaces.find((w) => w.id === actif)

  return (
    <Panneau titre="Fichiers" className="border-l border-bordure">
      {courant ? (
        <div className="px-3 py-2">
          <p className="truncate font-mono text-[12px] text-texte-doux">{courant.name}</p>
          <p className="mt-4 text-[12px] text-texte-faible">
            L'arborescence arrive en phase 4.
          </p>
        </div>
      ) : (
        <p className="px-3 py-2 text-[12px] text-texte-faible">Aucun projet sélectionné.</p>
      )}
    </Panneau>
  )
}
