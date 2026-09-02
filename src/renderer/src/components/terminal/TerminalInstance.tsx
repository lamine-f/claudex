import { useTerminal } from '@renderer/hooks/useTerminal'

/**
 * Une instance xterm par onglet. Les onglets inactifs restent montés mais masqués :
 * ils conservent ainsi leurs dimensions, ce qui évite un recalcul de taille — et donc
 * un redessin complet par tmux — à chaque bascule.
 */
export function TerminalInstance({
  tabId,
  actif
}: {
  tabId: string
  actif: boolean
}): React.JSX.Element {
  const { conteneur, demarre } = useTerminal(tabId, actif)

  return (
    <div className={`absolute inset-0 ${actif ? 'visible' : 'invisible'}`} aria-hidden={!actif}>
      <div ref={conteneur} className="absolute inset-0 px-2 py-1" />

      {/* Un shell met un instant à être prêt à lire, et un agent davantage encore.
          Sans ce repère, on tape dans le vide en croyant l'application figée. */}
      {!demarre && (
        <p className="pointer-events-none absolute inset-x-0 top-3 text-center font-mono text-[11.5px] text-texte-faible">
          démarrage du terminal…
        </p>
      )}
    </div>
  )
}
