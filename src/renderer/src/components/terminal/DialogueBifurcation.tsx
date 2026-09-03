import { useEffect, useRef, useState } from 'react'
import { nommerBranche, racine } from '@shared/branches'

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
 *
 * L'origine reste en préfixe : dans une liste de vingt conversations, savoir
 * qu'une branche vient de « Hello world » vaut autant que savoir ce qu'elle
 * explore, et les deux se lisent alors d'un seul regard.
 */
export function DialogueBifurcation({ origine, onValider, onAnnuler }: Props): React.JSX.Element {
  const [nom, setNom] = useState('')
  const champ = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    champ.current?.focus()
  }, [])

  const valider = (): void => onValider(nommerBranche(origine, nom))

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
          <div className="mt-1.5 flex items-center rounded-md border border-separateur bg-fond-creux pl-3 focus-within:border-accent-tenu">
            <span className="shrink-0 truncate py-2 text-[13px] text-texte-tenu" aria-hidden>
              {racine(origine)} --
            </span>
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
              className="min-w-0 flex-1 bg-transparent py-2 pr-3 pl-1.5 text-[13px] text-texte placeholder:text-texte-tenu focus:outline-none"
            />
          </div>
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
