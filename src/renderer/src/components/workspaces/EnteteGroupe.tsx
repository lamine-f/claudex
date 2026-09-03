import { useEffect, useRef, useState } from 'react'
import { IconeChevron } from '../ui/Icones'

/**
 * Gestes de réarrangement d'un groupe.
 *
 * Trois bandes plutôt que deux : au-dessus et en dessous, on se range à côté du
 * groupe ; au milieu, on entre dedans. C'est le seul endroit de la liste où
 * déposer veut dire deux choses différentes selon la hauteur.
 */
export interface GlisserGroupe {
  enCours: boolean
  indicateur?: 'avant' | 'dans' | 'apres'
  onDebut: () => void
  onFin: () => void
  onSurvol: (position: 'avant' | 'dans' | 'apres') => void
  onDepot: (position: 'avant' | 'dans' | 'apres') => void
}

interface Props {
  nom: string
  replie: boolean
  compte: number
  /** Vrai à la création : un groupe qui vient de naître attend son nom. */
  enEdition: boolean
  onNommer: (nom: string) => void
  onEditer: (ouvert: boolean) => void
  onReplier: () => void
  onMenu: (x: number, y: number, editer: () => void) => void
  glisser?: GlisserGroupe
}

function positionDe(evenement: React.DragEvent): 'avant' | 'dans' | 'apres' {
  const cadre = evenement.currentTarget.getBoundingClientRect()
  const part = (evenement.clientY - cadre.top) / cadre.height
  if (part < 0.3) return 'avant'
  if (part > 0.7) return 'apres'
  return 'dans'
}

export function EnteteGroupe({
  nom,
  replie,
  compte,
  enEdition,
  onNommer,
  onEditer,
  onReplier,
  onMenu,
  glisser
}: Props): React.JSX.Element {
  const [texte, setTexte] = useState(nom)
  const champ = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (enEdition) {
      setTexte(nom)
      champ.current?.select()
    }
  }, [enEdition, nom])

  const valider = (): void => {
    onEditer(false)
    if (texte.trim() !== nom) onNommer(texte)
  }

  return (
    <li
      className={`relative ${glisser?.enCours ? 'opacity-40' : ''}`}
      draggable={!!glisser && !enEdition}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', nom)
        glisser?.onDebut()
      }}
      onDragEnd={() => glisser?.onFin()}
      onDragOver={(e) => {
        if (!glisser) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        glisser.onSurvol(positionDe(e))
      }}
      onDrop={(e) => {
        if (!glisser) return
        e.preventDefault()
        glisser.onDepot(positionDe(e))
      }}
    >
      {glisser?.indicateur === 'avant' && (
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[2px] bg-projet" />
      )}
      {glisser?.indicateur === 'apres' && (
        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[2px] bg-projet" />
      )}

      <div
        className={`flex items-center gap-1.5 py-2 pr-2 pl-1.5 transition-colors ${
          glisser?.indicateur === 'dans' ? 'bg-fond-eleve ring-1 ring-projet' : 'hover:bg-fond-survol'
        }`}
        onContextMenu={(e) => {
          e.preventDefault()
          onMenu(e.clientX, e.clientY, () => onEditer(true))
        }}
      >
        <button
          type="button"
          onClick={onReplier}
          title={replie ? 'Déployer le groupe' : 'Replier le groupe'}
          aria-label={replie ? 'Déployer le groupe' : 'Replier le groupe'}
          aria-expanded={!replie}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-texte-tenu transition-colors hover:text-texte-doux"
        >
          <span className={`transition-transform ${replie ? '' : 'rotate-90'}`}>
            <IconeChevron taille={13} />
          </span>
        </button>

        {enEdition ? (
          <input
            ref={champ}
            value={texte}
            maxLength={60}
            onChange={(e) => setTexte(e.target.value)}
            onBlur={valider}
            onKeyDown={(e) => {
              if (e.key === 'Enter') valider()
              if (e.key === 'Escape') onEditer(false)
            }}
            placeholder="nom du groupe"
            aria-label="Nom du groupe"
            autoFocus
            className="min-w-0 flex-1 rounded border border-projet-tenu bg-fond-eleve px-1.5 py-px text-[13px] text-texte placeholder:text-texte-tenu focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={onReplier}
            onDoubleClick={(e) => {
              e.preventDefault()
              onEditer(true)
            }}
            // Un groupe se nomme comme une conversation se renomme : double-clic
            // sur le nom, et le clic droit pour le reste.
            className="min-w-0 flex-1 truncate text-left text-[13px] font-medium text-texte-doux"
          >
            {nom || 'Sans nom'}
          </button>
        )}

        <span className="shrink-0 font-mono text-[10.5px] text-texte-tenu">{compte}</span>
      </div>
    </li>
  )
}
