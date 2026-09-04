import type { Tab } from '@shared/types'

interface Props {
  tab: Tab
  onReprendre: () => void
  onIgnorer: () => void
}

const quand = (ms: number): string =>
  new Date(ms).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit'
  })

/**
 * Proposée quand la session a dû être recréée — après un redémarrage de la
 * machine, qui emporte le serveur tmux, ou après une simple fermeture de
 * l'application là où le pilote ne fait pas survivre les sessions. L'écran
 * d'avant est réaffiché derrière, et cette bande dit ce qu'il est possible de
 * reprendre.
 *
 * La commande en cours n'est nommée que si le pilote a su la relever ; une
 * conversation, elle, se reprend toujours, puisque c'est son identifiant qui
 * porte le contexte et non le processus qui la faisait tourner.
 */
export function RestoreBanner({ tab, onReprendre, onIgnorer }: Props): React.JSX.Element | null {
  const agent = Boolean(tab.claudeSessionId)
  const commande = tab.lastCommand
  if (!agent && !commande) return null

  return (
    <div className="absolute inset-x-3 top-3 z-10 rounded-lg border border-accent-tenu bg-fond-eleve/95 px-3 py-2.5 shadow-lg backdrop-blur">
      <p className="text-[12px] text-texte">
        {agent ? (
          <>
            Cette conversation s'était arrêtée le{' '}
            <span className="text-texte-doux">{quand(tab.lastActiveAt)}</span>. La reprendre lui
            rendra tout son contexte.
          </>
        ) : (
          <>
            Ce terminal exécutait{' '}
            <span className="font-mono text-texte-doux">{commande}</span> avant le redémarrage.
          </>
        )}
      </p>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={onReprendre}
          className="rounded-md border border-accent-tenu bg-accent-tenu/25 px-2.5 py-1 text-[12px] text-accent transition-colors hover:bg-accent-tenu/40"
        >
          {agent ? 'Reprendre la conversation' : 'Relancer la commande'}
        </button>
        <button
          type="button"
          onClick={onIgnorer}
          className="rounded-md px-2.5 py-1 text-[12px] text-texte-faible transition-colors hover:bg-fond-survol hover:text-texte"
        >
          Repartir à neuf
        </button>
      </div>
    </div>
  )
}
