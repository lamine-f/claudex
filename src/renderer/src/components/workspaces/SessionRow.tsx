import { useEffect, useRef, useState } from 'react'
import type { ClaudeSession, StatutSession } from '@shared/types'
import { quand } from '@shared/temps'
import { IconeBifurquer, IconeBranche, IconeFavori } from '../ui/Icones'

const STATUTS: Record<StatutSession, { libelle: string; couleur: string }> = {
  active: { libelle: 'à l’écran', couleur: 'var(--color-projet)' },
  ouverte: { libelle: 'dans un onglet', couleur: 'var(--color-texte-doux)' },
  attente: { libelle: 'en attente', couleur: 'var(--color-attention)' },
  interrompue: { libelle: 'interrompue', couleur: 'var(--color-erreur)' },
  terminee: { libelle: 'terminée', couleur: 'var(--color-texte-faible)' }
}

/**
 * Gestes de réarrangement posés sur une ligne.
 *
 * Absents quand la liste n'est pas réarrangeable — sous un filtre, l'ordre
 * affiché n'est plus celui de la liste, et déposer une conversation « ici »
 * ne voudrait rien dire.
 */
export interface Glisser {
  /** Vrai quand c'est cette ligne que l'on est en train de déplacer. */
  enCours: boolean
  /** Trait d'insertion à afficher, s'il y a lieu. */
  indicateur?: 'avant' | 'apres'
  onDebut: () => void
  onFin: () => void
  onSurvol: (position: 'avant' | 'apres') => void
  onDepot: (position: 'avant' | 'apres') => void
}

interface Props {
  session: ClaudeSession
  statut: StatutSession
  glisser?: Glisser
  onOuvrir: () => void
  onBifurquer: () => void
  onEtiqueter: (texte: string) => void
  onRenommer: (titre: string) => void
  /** Ouvre le menu de la conversation à l'endroit du clic. */
  onMenu: (x: number, y: number, editer: (quoi: Champ) => void) => void
}

/** Ce que le double-clic ou le clic droit met en édition sur la ligne. */
type Champ = 'titre' | 'etiquette'

/** Moitié haute ou moitié basse de la ligne : au-dessus, ou en dessous. */
function positionDe(evenement: React.DragEvent): 'avant' | 'apres' {
  const cadre = evenement.currentTarget.getBoundingClientRect()
  return evenement.clientY - cadre.top < cadre.height / 2 ? 'avant' : 'apres'
}

export function SessionRow({
  session,
  statut,
  glisser,
  onOuvrir,
  onBifurquer,
  onEtiqueter,
  onRenommer,
  onMenu
}: Props): React.JSX.Element {
  const { libelle, couleur } = STATUTS[statut]
  const active = statut === 'active'
  const dansUnOnglet = active || statut === 'ouverte'
  const [edition, setEdition] = useState<Champ | null>(null)
  const [texte, setTexte] = useState('')
  const champ = useRef<HTMLInputElement | null>(null)
  const clicDiffere = useRef<number | null>(null)

  useEffect(() => {
    if (edition) champ.current?.select()
  }, [edition])

  useEffect(
    () => () => {
      if (clicDiffere.current) window.clearTimeout(clicDiffere.current)
    },
    []
  )

  /**
   * Le premier clic d'un double-clic ouvrirait la conversation, et le
   * remontage qui suit emporterait l'édition à peine ouverte. L'ouverture est
   * donc retenue le temps de savoir si un second clic arrive.
   */
  const surClic = (): void => {
    if (clicDiffere.current) window.clearTimeout(clicDiffere.current)
    clicDiffere.current = window.setTimeout(() => {
      clicDiffere.current = null
      onOuvrir()
    }, 220)
  }

  const annulerClic = (): void => {
    if (clicDiffere.current) {
      window.clearTimeout(clicDiffere.current)
      clicDiffere.current = null
    }
  }

  const editer = (quoi: Champ): void => {
    setTexte(quoi === 'titre' ? session.titre : (session.etiquette ?? ''))
    setEdition(quoi)
  }

  const valider = (): void => {
    const quoi = edition
    setEdition(null)
    if (!quoi) return
    const propre = texte.trim()
    if (quoi === 'titre') {
      // Un titre vide rend la conversation à son nom d'origine plutôt que de la
      // laisser sans repère.
      if (propre !== session.titre) onRenommer(propre)
    } else if (propre !== (session.etiquette ?? '')) {
      onEtiqueter(propre)
    }
  }

  return (
    <li
      className={`group/session relative ${glisser?.enCours ? 'opacity-40' : ''}`}
      // Une ligne en cours d'édition ne se déplace pas : le glisser-déposer
      // empêcherait de sélectionner le texte que l'on est en train de corriger.
      draggable={!!glisser && !edition}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', session.id)
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
      {glisser?.indicateur && (
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 z-10 h-[2px] bg-projet ${
            glisser.indicateur === 'avant' ? 'top-0' : 'bottom-0'
          }`}
        />
      )}
      <button
        type="button"
        onClick={surClic}
        // Le double-clic renomme, comme on renomme un fichier ; le clic droit
        // ouvre tout ce qu'on peut faire d'autre.
        onDoubleClick={(e) => {
          e.preventDefault()
          annulerClic()
          editer('titre')
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          annulerClic()
          onMenu(e.clientX, e.clientY, editer)
        }}
        title={`${session.titre}\n${Math.round(session.octets / 1024)} Ko${
          session.gitBranch ? ` · ${session.gitBranch}` : ''
        }`}
        // Le liseré plein ne va qu'à la conversation qu'on a sous les yeux ;
        // celles qui patientent dans un autre onglet le portent en retrait.
        className={`flex w-full flex-col gap-1 border-l-2 py-2.5 pr-10 pl-3.5 text-left transition-colors ${
          active
            ? 'border-l-projet bg-fond-creux'
            : dansUnOnglet
              ? 'border-l-bordure hover:bg-fond-survol'
              : 'border-l-separateur hover:border-l-bordure hover:bg-fond-survol'
        }`}
      >
        <span className="flex min-w-0 items-baseline gap-2">
          {session.epinglee && !edition && (
            <span aria-label="En favori" title="En favori" className="shrink-0 text-attention">
              <IconeFavori taille={11} />
            </span>
          )}
          {edition === 'titre' ? (
            <input
              ref={champ}
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              onBlur={valider}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') valider()
                if (e.key === 'Escape') setEdition(null)
              }}
              aria-label="Nom de la conversation"
              className="min-w-0 flex-1 rounded border border-projet-tenu bg-fond-eleve px-1.5 py-px text-[13.5px] text-texte focus:outline-none"
            />
          ) : (
            <span
              className={`min-w-0 flex-1 truncate text-[14px] ${
                dansUnOnglet ? 'text-texte' : 'text-texte-doux'
              } ${session.titreDeRepli ? 'italic' : ''}`}
            >
              {session.titre}
            </span>
          )}
          {session.etiquette && !edition && (
            <span className="shrink-0 rounded border border-separateur px-1.5 py-px font-mono text-[10.5px] text-projet">
              {session.etiquette}
            </span>
          )}
        </span>

        {/* Sur une ligne, quitte à se faire couper : repliée, la ligne d'état
            doublait la hauteur de la conversation pour dire deux mots de plus. */}
        <span className="flex items-center gap-1.5 overflow-hidden font-mono text-[11.5px] whitespace-nowrap">
          <span style={{ color: couleur }}>{libelle}</span>
          <span className="text-texte-tenu">·</span>
          <span className="text-texte-tenu">{quand(session.misAJourLe)}</span>
          {session.gitBranch && (
            // La branche où la conversation a eu lieu : sans elle, rien ne
            // distingue un échange tenu sur main d'un autre mené dans une
            // branche de travail, et l'on reprend parfois le mauvais.
            <>
              <span className="text-texte-tenu">·</span>
              <span
                className="flex min-w-0 items-center gap-1 text-texte-tenu"
                title={`Branche : ${session.gitBranch}`}
              >
                <IconeBranche taille={10} />
                <span className="truncate">{session.gitBranch}</span>
              </span>
            </>
          )}
        </span>
      </button>

      {edition === 'etiquette' && (
        <input
          ref={champ}
          value={texte}
          maxLength={40}
          onChange={(e) => setTexte(e.target.value)}
          onBlur={valider}
          onKeyDown={(e) => {
            if (e.key === 'Enter') valider()
            if (e.key === 'Escape') setEdition(null)
          }}
          placeholder="étiquette"
          aria-label="Étiquette de la conversation"
          className="absolute top-1.5 right-2 w-28 rounded border border-projet-tenu bg-fond-eleve px-1.5 py-0.5 font-mono text-[10.5px] text-texte placeholder:text-texte-tenu focus:outline-none"
        />
      )}

      {!edition && (
        <button
          type="button"
          onClick={onBifurquer}
          title="Bifurquer : repartir de ce contexte sans toucher à la conversation d'origine"
          className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded text-texte-tenu opacity-0 transition-opacity group-hover/session:opacity-100 hover:bg-fond-eleve hover:text-accent focus-visible:opacity-100"
        >
          <IconeBifurquer taille={12} />
        </button>
      )}
    </li>
  )
}
