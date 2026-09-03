import type { ClaudeSession } from '@shared/types'

interface Props {
  session: ClaudeSession
  onConfirmer: () => void
  onAnnuler: () => void
}

/**
 * Confirmation avant d'écarter une conversation.
 *
 * Le transcrit part dans la corbeille de Claudex plutôt que d'être effacé : il
 * est parfois le seul exemplaire d'un travail long, et le dire enlève à ce
 * geste ce qu'il aurait d'irréversible.
 */
export function DialogueEcart({ session, onConfirmer, onAnnuler }: Props): React.JSX.Element {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-8"
      onClick={onAnnuler}
    >
      <div
        role="dialog"
        aria-label="Écarter la conversation"
        className="w-full max-w-md rounded-xl border border-bordure bg-fond-panneau shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-separateur px-4 py-3">
          <h2 className="text-[14px] font-medium text-texte">Écarter cette conversation ?</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-texte-faible">
            <span className="text-texte-doux">{session.titre}</span> quittera la liste. Son
            transcrit n'est pas effacé : il rejoint la corbeille de Claudex, où il reste
            récupérable à la main.
          </p>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3">
          <button
            type="button"
            onClick={onAnnuler}
            className="rounded-md px-3 py-1.5 text-[13px] text-texte-faible transition-colors hover:bg-fond-survol hover:text-texte"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirmer}
            className="rounded-md border border-erreur/40 bg-erreur/15 px-3 py-1.5 text-[13px] text-erreur transition-colors hover:bg-erreur/25"
          >
            Écarter
          </button>
        </div>
      </div>
    </div>
  )
}
