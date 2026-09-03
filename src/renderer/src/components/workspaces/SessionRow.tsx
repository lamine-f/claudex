import type { ClaudeSession, StatutSession } from '@shared/types'
import { quand } from '@shared/temps'

const STATUTS: Record<StatutSession, { libelle: string; couleur: string }> = {
  ouverte: { libelle: 'ouverte', couleur: 'var(--color-accent)' },
  attente: { libelle: 'en attente', couleur: 'var(--color-attention)' },
  interrompue: { libelle: 'interrompue', couleur: 'var(--color-erreur)' },
  terminee: { libelle: 'terminée', couleur: 'var(--color-texte-faible)' }
}

interface Props {
  session: ClaudeSession
  statut: StatutSession
  onOuvrir: () => void
  onBifurquer: () => void
}

export function SessionRow({ session, statut, onOuvrir, onBifurquer }: Props): React.JSX.Element {
  const { libelle, couleur } = STATUTS[statut]
  const ouverte = statut === 'ouverte'

  return (
    <li className="group/session relative">
      <button
        type="button"
        onClick={onOuvrir}
        title={`${session.titre}\n${Math.round(session.octets / 1024)} Ko${
          session.gitBranch ? ` · ${session.gitBranch}` : ''
        }`}
        className={`flex w-full flex-col gap-[3px] border-l-2 py-2 pr-10 pl-3 text-left transition-colors ${
          ouverte
            ? 'border-l-accent bg-fond-creux'
            : 'border-l-separateur hover:border-l-bordure hover:bg-fond-survol'
        }`}
      >
        <span
          className={`truncate text-[13.5px] ${ouverte ? 'text-texte' : 'text-texte-doux'} ${
            session.titreDeRepli ? 'italic' : ''
          }`}
        >
          {session.titre}
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[11px]">
          <span style={{ color: couleur }}>{libelle}</span>
          <span className="text-texte-tenu">·</span>
          <span className="text-texte-tenu">{quand(session.misAJourLe)}</span>
        </span>
      </button>

      <button
        type="button"
        onClick={onBifurquer}
        title="Bifurquer : repartir de ce contexte sans toucher à la conversation d'origine"
        className="absolute top-2 right-2 rounded px-1.5 py-0.5 text-[11px] text-texte-tenu opacity-0 transition-opacity group-hover/session:opacity-100 hover:bg-fond-eleve hover:text-accent focus-visible:opacity-100"
      >
        ⑂
      </button>
    </li>
  )
}
