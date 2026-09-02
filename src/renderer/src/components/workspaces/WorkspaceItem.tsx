import type { Workspace } from '@shared/types'
import { useStore } from '@renderer/state/store'
import { SessionRow } from './SessionRow'

/** Nombre de sessions montrées avant d'avoir à dérouler le reste. */
const APERCU = 10

export function WorkspaceItem({ workspace }: { workspace: Workspace }): React.JSX.Element {
  const actif = useStore((e) => e.activeWorkspaceId === workspace.id)
  const sessions = useStore((e) => e.sessions[workspace.id])
  const chargement = useStore((e) => e.sessionsEnCours[workspace.id])
  const tout = useStore((e) => e.toutAfficher[workspace.id])
  const tabs = useStore((e) => e.tabs)
  const choisir = useStore((e) => e.choisirWorkspace)
  const basculer = useStore((e) => e.basculerRepli)
  const ouvrirSession = useStore((e) => e.ouvrirSession)
  const derouler = useStore((e) => e.deroulerTout)

  const ouvertes = new Set(tabs.map((t) => t.claudeSessionId).filter(Boolean))
  const visibles = tout ? sessions : sessions?.slice(0, APERCU)
  const reste = (sessions?.length ?? 0) - (visibles?.length ?? 0)

  return (
    <li>
      <div
        className={`flex items-center gap-1 rounded-md pr-1 transition-colors ${
          actif ? 'bg-fond-eleve' : 'hover:bg-fond-survol'
        }`}
      >
        <button
          type="button"
          onClick={() => void basculer(workspace.id)}
          title={workspace.expanded ? 'Replier' : 'Déplier les sessions'}
          className="flex h-6 w-4 shrink-0 items-center justify-center text-[9px] text-texte-faible transition-colors hover:text-texte"
        >
          {workspace.expanded ? '▾' : '▸'}
        </button>

        <button
          type="button"
          onClick={() => void choisir(workspace.id)}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
        >
          <span className="h-4 w-[3px] shrink-0 rounded-full" style={{ background: workspace.color }} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] text-texte">{workspace.name}</span>
            <span className="block truncate text-[11px] text-texte-faible">
              {workspace.path.replace(/^\/Users\/[^/]+/, '~')}
            </span>
          </span>
        </button>
      </div>

      {workspace.expanded && (
        <div className="mt-0.5 mb-1 ml-[13px] border-l border-bordure pl-1.5">
          {chargement && !sessions ? (
            <p className="px-2 py-1 text-[11.5px] text-texte-faible">Lecture des sessions…</p>
          ) : sessions?.length ? (
            <ul>
              {visibles!.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  ouverte={ouvertes.has(session.id)}
                  onOuvrir={() => void ouvrirSession(workspace.id, 'reprise', session.id)}
                  onBifurquer={() => void ouvrirSession(workspace.id, 'bifurcation', session.id)}
                />
              ))}
              {reste > 0 && (
                <li>
                  <button
                    type="button"
                    onClick={() => derouler(workspace.id)}
                    className="w-full rounded-md px-2 py-1 text-left text-[11.5px] text-texte-faible transition-colors hover:bg-fond-survol hover:text-texte-doux"
                  >
                    ⋯ {reste} autre{reste > 1 ? 's' : ''}
                  </button>
                </li>
              )}
            </ul>
          ) : (
            // Un projet parent, ou un dossier où `claude` n'a jamais tourné :
            // c'est le cas normal, pas une anomalie.
            <p className="px-2 py-1 text-[11.5px] text-texte-faible">aucune session ici</p>
          )}

          <button
            type="button"
            onClick={() => void ouvrirSession(workspace.id, 'nouvelle')}
            className="mt-0.5 w-full rounded-md px-2 py-1 text-left text-[11.5px] text-texte-faible transition-colors hover:bg-fond-survol hover:text-accent"
          >
            + Nouvelle session
          </button>
        </div>
      )}
    </li>
  )
}
