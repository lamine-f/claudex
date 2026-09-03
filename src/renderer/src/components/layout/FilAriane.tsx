import { useStore } from '@renderer/state/store'

/**
 * Bande supérieure : où l'on est.
 *
 * Le fil d'ariane porte le nom complet du projet, que le rail réduit à ses
 * initiales, puis la conversation en cours. L'état de l'environnement n'y
 * figure pas : le rail le signale déjà, et le répéter encombrerait une bande
 * dont le seul rôle est de situer.
 */
export function FilAriane(): React.JSX.Element {
  const workspaces = useStore((e) => e.workspaces)
  const actif = useStore((e) => e.activeWorkspaceId)
  const tabs = useStore((e) => e.tabs)
  const activeTabId = useStore((e) => e.activeTabId)
  const courant = workspaces.find((w) => w.id === actif)
  const onglet = tabs.find((t) => t.id === activeTabId)

  return (
    <header className="zone-glissable flex h-14 shrink-0 items-center gap-2.5 border-b border-separateur pr-4 pl-24">
      {courant && (
        <>
          <span className="font-mono text-[13px] text-texte-faible">{courant.name}</span>
          {onglet && (
            <>
              <span className="text-texte-tenu">/</span>
              <span className="truncate text-[14px] font-medium text-texte">{onglet.title}</span>
              {onglet.claudeSessionId && (
                <span className="font-mono text-[12px] text-texte-tenu">ouverte</span>
              )}
            </>
          )}
        </>
      )}

      <div className="flex-1" />
    </header>
  )
}
