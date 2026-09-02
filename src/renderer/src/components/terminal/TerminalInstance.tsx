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
  const { conteneur } = useTerminal(tabId)

  return (
    <div
      ref={conteneur}
      className={`absolute inset-0 px-2 py-1 ${actif ? 'visible' : 'invisible'}`}
      aria-hidden={!actif}
    />
  )
}
