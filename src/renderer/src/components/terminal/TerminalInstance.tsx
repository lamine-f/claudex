import type { Tab } from '@shared/types'
import { useTerminal } from '@renderer/hooks/useTerminal'
import { RestoreBanner } from './RestoreBanner'
import { SessionArretee } from './SessionArretee'

/**
 * Une instance xterm par onglet. Les onglets inactifs restent montés mais masqués :
 * ils conservent ainsi leurs dimensions, ce qui évite un recalcul de taille — et donc
 * un redessin complet par tmux — à chaque bascule.
 */
export function TerminalInstance({
  tab,
  actif,
  onFermer
}: {
  tab: Tab
  actif: boolean
  onFermer: () => void
}): React.JSX.Element {
  const { conteneur, demarre, aRestaurer, arrete, ecrire, oublierRestauration, relancer } =
    useTerminal(tab.id, actif)

  const reprendre = (): void => {
    if (tab.claudeSessionId) ecrire(`claude -r ${tab.claudeSessionId}`)
    else if (tab.lastCommand) ecrire(tab.lastCommand)
  }

  return (
    <div className={`absolute inset-0 ${actif ? 'visible' : 'invisible'}`} aria-hidden={!actif}>
      <div ref={conteneur} className="absolute inset-0 overflow-hidden px-3 py-2" />

      {arrete ? (
        <SessionArretee tab={tab} onRelancer={relancer} onFermer={onFermer} />
      ) : null}

      {aRestaurer && !arrete && (
        <RestoreBanner tab={tab} onReprendre={reprendre} onIgnorer={oublierRestauration} />
      )}

      {/* Un shell met un instant à être prêt à lire, et un agent davantage encore.
          Sans ce repère, on tape dans le vide en croyant l'application figée. */}
      {!demarre && !arrete && (
        <p className="pointer-events-none absolute inset-x-0 top-3 text-center font-mono text-[11.5px] text-texte-faible">
          démarrage du terminal…
        </p>
      )}
    </div>
  )
}
