import type { Tab } from '@shared/types'

interface Props {
  tab: Tab
  onRelancer: () => void
  onFermer: () => void
}

/**
 * Un terminal dont le client tmux s'est terminé.
 *
 * Sans ce panneau, il ne restait qu'un « [server exited] » au milieu d'un écran
 * mort : on tapait sans effet, sans savoir ce qui s'était passé ni comment en
 * sortir.
 */
export function SessionArretee({ tab, onRelancer, onFermer }: Props): React.JSX.Element {
  const agent = Boolean(tab.claudeSessionId)

  return (
    <div className="absolute inset-x-0 top-0 z-10 border-b border-bordure bg-fond-panneau/95 px-4 py-3 backdrop-blur">
      <p className="text-[13px] text-texte">Ce terminal s'est arrêté.</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-texte-faible">
        Le serveur tmux qui le portait n'est plus là — il s'arrête quand sa dernière session
        se termine, quand on le tue depuis un autre terminal, ou au redémarrage de la machine.
        Les autres onglets de ce projet sont probablement dans le même état.
      </p>

      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={onRelancer}
          className="rounded-md border border-accent-tenu bg-accent-tenu/30 px-2.5 py-1 text-[12.5px] text-accent transition-colors hover:bg-accent-tenu/50"
        >
          {agent ? 'Relancer et reprendre la conversation' : 'Relancer le terminal'}
        </button>
        <button
          type="button"
          onClick={onFermer}
          className="rounded-md px-2.5 py-1 text-[12.5px] text-texte-faible transition-colors hover:bg-fond-survol hover:text-texte"
        >
          Fermer l'onglet
        </button>
      </div>
    </div>
  )
}
