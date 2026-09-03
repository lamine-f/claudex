import { useEffect, useRef, useState } from 'react'

interface Props {
  /** Titre de la conversation dont on part. */
  origine: string
  onValider: (nom: string) => void
  onAnnuler: () => void
}

/**
 * Nommage d'une bifurcation.
 *
 * Une branche sans nom ne dit pas ce qu'on y explore, et deux branches d'une
 * même conversation deviennent indiscernables. Le nom est demandé au moment où
 * l'intention est claire — juste avant de partir.
 */
export function DialogueBifurcation({ origine, onValider, onAnnuler }: Props): React.JSX.Element {
  const [nom, setNom] = useState('')
  const champ = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    champ.current?.focus()
  }, [])

  const valider = (): void => onValider(nom.trim() || `${origine} ⑂`)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-8"
      onClick={onAnnuler}
    >
      <div
        role="dialog"
        aria-label="Bifurquer la session"
        className="w-full max-w-md rounded-xl border border-bordure bg-fond-panneau shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-separateur px-4 py-3">
          <h2 className="text-[14px] font-medium text-texte">Bifurquer la session</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-texte-faible">
            La nouvelle conversation repart du contexte de{' '}
            <span className="text-texte-doux">{origine}</span>, qui reste intacte de son côté.
          </p>
        </div>

        <div className="px-4 py-3">
          <label htmlFor="nom-bifurcation" className="text-[12px] text-texte-faible">
            Nom de la branche
          </label>
          <input
            id="nom-bifurcation"
            ref={champ}
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') valider()
              if (e.key === 'Escape') onAnnuler()
            }}
            placeholder="ce que tu veux explorer"
            className="mt-1.5 w-full rounded-md border border-separateur bg-fond-creux px-3 py-2 text-[13px] text-texte placeholder:text-texte-tenu focus:border-accent-tenu focus:outline-none"
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-separateur px-4 py-3">
          <button
            type="button"
            onClick={onAnnuler}
            className="rounded-md px-3 py-1.5 text-[13px] text-texte-faible transition-colors hover:bg-fond-survol hover:text-texte"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={valider}
            className="rounded-md border border-accent-tenu bg-accent-tenu/30 px-3 py-1.5 text-[13px] text-accent transition-colors hover:bg-accent-tenu/50"
          >
            Bifurquer
          </button>
        </div>
      </div>
    </div>
  )
}
