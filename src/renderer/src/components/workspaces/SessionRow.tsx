import type { ClaudeSession } from '@shared/types'

const dateCourte = (ms: number): string =>
  new Date(ms).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })

interface Props {
  session: ClaudeSession
  ouverte: boolean
  onOuvrir: () => void
  onBifurquer: () => void
}

export function SessionRow({ session, ouverte, onOuvrir, onBifurquer }: Props): React.JSX.Element {
  return (
    <li className="group/session relative">
      <button
        type="button"
        onClick={onOuvrir}
        title={`${session.titre}\n${Math.round(session.octets / 1024)} Ko${
          session.gitBranch ? ` · ${session.gitBranch}` : ''
        }`}
        className="flex w-full items-center gap-2 rounded-md py-1 pr-12 pl-2 text-left transition-colors hover:bg-fond-survol"
      >
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            ouverte ? 'bg-accent' : 'border border-texte-faible'
          }`}
        />
        <span
          className={`min-w-0 flex-1 truncate text-[12px] ${
            ouverte ? 'text-texte' : 'text-texte-doux'
          } ${session.titreDeRepli ? 'italic' : ''}`}
        >
          {session.titre}
        </span>
        <span className="shrink-0 font-mono text-[10.5px] text-texte-faible tabular-nums">
          {dateCourte(session.misAJourLe)}
        </span>
      </button>

      <button
        type="button"
        onClick={onBifurquer}
        title="Bifurquer : repartir de ce contexte sans toucher à la conversation d'origine"
        // Toujours présent dans le flux, simplement effacé au repos : un bouton
        // qui n'existe qu'au survol serait hors d'atteinte au clavier.
        className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded px-1.5 py-0.5 text-[10.5px] text-texte-faible opacity-0 transition-opacity group-hover/session:opacity-100 hover:bg-fond-eleve hover:text-accent focus-visible:opacity-100"
      >
        ⑂
      </button>
    </li>
  )
}
