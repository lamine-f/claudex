import { useStore } from '@renderer/state/store'

/**
 * Bande supérieure : où l'on est, et l'état de l'environnement.
 *
 * Le fil d'ariane porte le nom complet du projet, que le rail réduit à ses
 * initiales, puis la conversation en cours.
 */
export function FilAriane(): React.JSX.Element {
  const workspaces = useStore((e) => e.workspaces)
  const actif = useStore((e) => e.activeWorkspaceId)
  const tabs = useStore((e) => e.tabs)
  const activeTabId = useStore((e) => e.activeTabId)
  const diagnostics = useStore((e) => e.diagnostics)
  const ouvrirDiagnostic = useStore((e) => e.ouvrirDiagnostic)

  const courant = workspaces.find((w) => w.id === actif)
  const onglet = tabs.find((t) => t.id === activeTabId)
  const soucis = diagnostics.filter((d) => d.severity !== 'ok').length

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

      <button
        type="button"
        onClick={() => ouvrirDiagnostic(true)}
        className="flex items-center gap-2 rounded-[7px] border border-separateur bg-fond-creux px-3 py-1.5 text-[13px] text-texte-doux transition-colors hover:border-bordure hover:text-texte"
      >
        <span
          className={`h-[7px] w-[7px] rounded-full ${soucis > 0 ? 'bg-attention' : 'bg-succes'}`}
        />
        {soucis > 0 ? `${soucis} point${soucis > 1 ? 's' : ''} à voir` : 'Tout est prêt'}
      </button>
    </header>
  )
}
