import { useEffect, useRef } from 'react'

export interface Action {
  libelle: string
  onChoisir: () => void
  /** Une action qui écarte quelque chose se distingue des autres. */
  ecarte?: boolean
}

interface Props {
  x: number
  y: number
  actions: Action[]
  onFermer: () => void
  /** Ce que le menu concerne, pour qui ne voit que l'arbre d'accessibilité. */
  intitule?: string
}

/**
 * Menu d'une conversation.
 *
 * Les actions qui la concernent tiennent au même endroit plutôt que d'être
 * dispersées entre des gestes qu'il faut connaître d'avance.
 */
export function MenuSession({
  x,
  y,
  actions,
  onFermer,
  intitule = 'Actions de la conversation'
}: Props): React.JSX.Element {
  const menu = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const surTouche = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onFermer()
    }
    document.addEventListener('keydown', surTouche)
    return () => document.removeEventListener('keydown', surTouche)
  }, [onFermer])

  return (
    <div className="fixed inset-0 z-50" onMouseDown={onFermer} onContextMenu={(e) => e.preventDefault()}>
      <div
        ref={menu}
        role="menu"
        aria-label={intitule}
        // Bornée à la fenêtre : un clic droit en bas de liste ouvrirait sinon un
        // menu à moitié hors de l'écran.
        style={{
          left: Math.min(x, window.innerWidth - 220),
          top: Math.min(y, window.innerHeight - actions.length * 38 - 20)
        }}
        className="absolute min-w-56 rounded-lg border border-bordure bg-fond-panneau py-1.5 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {actions.map((action) => (
          <button
            key={action.libelle}
            type="button"
            role="menuitem"
            onClick={() => {
              onFermer()
              action.onChoisir()
            }}
            className={`block w-full px-3.5 py-2 text-left text-[13.5px] transition-colors hover:bg-fond-survol ${
              action.ecarte ? 'text-erreur' : 'text-texte-doux hover:text-texte'
            }`}
          >
            {action.libelle}
          </button>
        ))}
      </div>
    </div>
  )
}
