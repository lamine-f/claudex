import type { Workspace } from '@shared/types'

interface Props {
  workspace: Workspace
  onglets: number
  onConfirmer: () => void
  onAnnuler: () => void
}

/**
 * Confirmation avant de retirer un projet.
 *
 * Le dossier n'est pas touché, ni les conversations que Claude Code y a
 * écrites : le projet sort de la liste, rien de plus. Ce qui se perd tient aux
 * terminaux ouverts, dont les sessions sont fermées — les laisser vivre sans
 * plus personne pour les rouvrir remplirait le multiplexeur de sessions que
 * plus aucun écran ne montre.
 */
export function DialogueRetrait({
  workspace,
  onglets,
  onConfirmer,
  onAnnuler
}: Props): React.JSX.Element {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-8"
      onClick={onAnnuler}
    >
      <div
        role="dialog"
        aria-label="Retirer le projet"
        className="w-full max-w-md rounded-xl border border-bordure bg-fond-panneau shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-separateur px-4 py-3">
          <h2 className="text-[14px] font-medium text-texte">Retirer ce projet ?</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-texte-faible">
            <span className="text-texte-doux">{workspace.name}</span> quittera la liste. Le dossier
            n'est pas touché, ni les conversations qu'il porte : les rouvrir demandera seulement de
            l'ajouter à nouveau.
          </p>
          {onglets > 0 && (
            <p className="mt-2 text-[12.5px] leading-relaxed text-attention">
              {onglets === 1
                ? 'Son terminal ouvert sera fermé, et ce qui y tourne interrompu.'
                : `Ses ${onglets} terminaux ouverts seront fermés, et ce qui y tourne interrompu.`}
            </p>
          )}
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
            Retirer
          </button>
        </div>
      </div>
    </div>
  )
}
